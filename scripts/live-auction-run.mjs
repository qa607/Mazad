#!/usr/bin/env node
/* global process, console, URL, URLSearchParams, setTimeout, structuredClone, fetch, window */
/**
 * Live auction run on staging (stg-154): creates a short Standard auction for a NEW car, two test users bid
 * alternately from the Android app and the iOS app until the price reaches the car's Reserve Price, the website
 * is followed as a guest, and the back office is checked.
 *
 *   TEST_ENV=stg-154 node scripts/live-auction-run.mjs [--role individual|dealer] [--bidding standard|price-offering]
 *       [--go --accounts <androidId>,<iosId>] [--offers <android>,<ios>]
 *       [--car <VIN>] [--start-in 3] [--duration 5] [--keep-auto-extend] [--show]
 *
 * - Default is a DRY RUN: prints the two NEW accounts it would use, the car and the bid plan; changes nothing.
 * - --go --accounts <androidId>,<iosId> (the IDs the dry run printed; passing them approves resetting their
 *   passwords): (1) sets a new random password on both accounts and signs the Android emulator and the iOS device in
 *   with it, (2) creates a "QA-AUTO Live <n>"
 *   Normal auction (Bidding Type Standard) for the car, starting --start-in minutes from now and lasting --duration
 *   minutes, (3) when it goes live opens the car on both devices and turns that item's Auto Extend OFF in the Live
 *   list (unless --keep-auto-extend), (4) bids alternately Android/iOS ("Increase Price", "Your Increase" + steps of
 *   Min Increment, at most 6 steps per bid, "Confirm Bid") until the bid reaches the Reserve Price, (5) checks the
 *   back office (bids table, Highest >= Reserve, Sold row: Waiting Transfer, Type Auction, winner) and what the
 *   website showed (Live listing, car page price and bid count, ended).
 * - --bidding price-offering: a sealed-bid run. An auction's Bidding Type comes from its supplier, so the car's
 *   supplier is set to "Price Offering" just for creating the auction and always set back to "Standard" right after.
 *   Price Offering items have no Auto Extend switch. When live, each device submits ONE offer ("Place a Bid" > Bid
 *   Amount > "Submit Bid"): by default reserve + admin fee + 500 rounded up to 500 on Android and 1,000 more on iOS
 *   (--offers sets both). Checks: both offers placed, Sold (Bidding Type Price Offering), Highest = the higher
 *   offer, winner = its bidder.
 * - Bidders: two NEW accounts every run, never saved. From the back office list of the role: Individuals that are
 *   active, Verified and registered by Deposit; Dealers that are active with their documents reviewed; neither on
 *   hold nor used by an earlier run. Their password is replaced by a random one that lives only in this process (not
 *   in .env, not in any file, never printed). Only the IDs are recorded (state.usedAccounts) so no account is used
 *   twice. A winner is blocked by the app at once and put on hold, so it could not bid in the next run anyway.
 * - Car: a test-supplier car (شركة تجريبية-<n>) never used by this script, from the Failed list or Pricing Done
 *   (moved to Upcoming), choosing the one that needs the fewest bids; --car picks one. Used cars and runs are kept
 *   in reports/live-auction/state.json (gitignored).
 * - The website cannot bid (a live car shows "Minimum Bid" and "Get the App"); it is followed as a guest. One
 *   session per account: signing an account in on the website signs it out of the app.
 * - Devices: Android emulator through adb (ANDROID_UDID, default emulator-5554; every screen read has a timeout,
 *   the emulator can freeze), iOS device through Appium + WebDriverAgent (IOS_UDID, IOS_WDA_URL).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { remote } from 'webdriverio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const GO = argv.includes('--go');
const KEEP_AUTO_EXTEND = argv.includes('--keep-auto-extend');
const SHOW = argv.includes('--show');
const ROLE = opt('--role', 'individual');
const ACCOUNT_IDS = opt('--accounts', null)?.split(',');
const CAR_VIN = opt('--car', null);
const START_IN = Number(opt('--start-in', 3));
const DURATION = Number(opt('--duration', 5));
const MAX_STEPS = 6; // "Your Increase" stops at 6 x Min Increment per bid
const BIDDING = opt('--bidding', 'standard');
const PO = BIDDING === 'price-offering';
const OFFERS = opt('--offers', null)
  ?.split(',')
  .map((v) => Number(v.replace(/[^\d]/g, '')));

const ENV_ID = process.env.TEST_ENV;
if (ENV_ID !== 'stg-154')
  throw new Error('Run with TEST_ENV=stg-154 (the only environment this script is set up for).');
const BASE = new URL(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'config/environments', `${ENV_ID}.json`), 'utf8'))
    .baseURL,
).origin;
if (!/^https:\/\/stg-/.test(BASE)) throw new Error(`Refusing ${BASE}: not a staging URL.`);
if (!['individual', 'dealer'].includes(ROLE))
  throw new Error('--role must be individual or dealer');
if (!['standard', 'price-offering'].includes(BIDDING))
  throw new Error('--bidding must be standard or price-offering');
if (OFFERS && (OFFERS.length !== 2 || OFFERS.some((v) => !v)))
  throw new Error('--offers needs two amounts: <android>,<ios>');
if (ACCOUNT_IDS && (ACCOUNT_IDS.length !== 2 || ACCOUNT_IDS.some((v) => !/^\d+$/.test(v))))
  throw new Error('--accounts needs two back-office IDs: <androidId>,<iosId>');
if (GO && !ACCOUNT_IDS)
  throw new Error(
    '--go needs --accounts <androidId>,<iosId>: run without --go first, check the two new accounts it prints, then pass their IDs (this approves resetting their passwords).',
  );

const DOTENV = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const env = (k, fallback) => process.env[k] || DOTENV[k] || fallback;

/**
 * Where new bidders come from: the role's back-office list, filtered to accounts that can bid. Each candidate's View
 * page is checked again (status, hold, verification) before it is used.
 */
const ACCOUNT_LISTS = {
  individual: {
    model: 'IndividualSearch',
    filters: { status: 'active', is_verified: '1', registration_type: 'deposit' },
  },
  dealer: { model: 'DealerSearch', filters: { status: 'active', is_documents_reviewed: 'yes' } },
};
/** Names an account may show as (a Dealer's app header and Sold row can show its company name). */
const namesOf = (u) => u.names;
const TEST_SUPPLIER = /شركة تجريبية-\d+/;
const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;

// ---------- state ----------
const STATE_FILE = path.join(ROOT, 'reports/live-auction/state.json');
const SEED = {
  // Cars already used in live runs by hand on 2026-11-13, before this script existed.
  usedVins: [
    'KL1CD6CA9MC725505',
    '1N4BL4A9XLC158603',
    'KMHD741C2LU037055',
    '3KPFB41A1RE028039',
    'LSJW74C93NZ036340',
    'LJD5AA1D5R0128756',
    'MHFDX8FS5S0146325',
    'MR2BE9B30R0059514',
    'LJD0AA294N0168387',
  ],
  // Back-office IDs of accounts already used as bidders (IDs only, never credentials).
  usedAccounts: [],
  runs: [],
};
const loadState = () => {
  let s;
  try {
    s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    s = structuredClone(SEED);
  }
  s.usedAccounts ||= [];
  return s;
};
const saveState = (s) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`);
};
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const money = (v) => Number(v).toLocaleString('en-US');
const num = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;
const ts = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(...a);
const norm = (s) =>
  String(s)
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const checks = [];
const check = (ok, label) => {
  checks.push([ok, label]);
  log(`    ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

// ---------- back office ----------
async function openBackOffice(browser) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: path.join(ROOT, '.auth/dev-root.json'),
  });
  const page = await ctx.newPage();
  await page.goto('/backend');
  if (page.url().includes('/authentication/login'))
    throw new Error(
      'The saved Dev Root session expired: run the backend-setup project to refresh .auth/dev-root.json.',
    );
  return page;
}

/** Reads an account's View page: names, phone (the 9 digits after +966) and whether it can bid. */
async function readAccount(page, id) {
  await page.goto(`/backend/users/${ROLE}/view?id=${id}`);
  const field = async (label) =>
    norm(
      await page
        .locator('label', { hasText: new RegExp(`^\\s*${label}\\s*$`) })
        .first()
        .locator('xpath=following-sibling::input[1]')
        .inputValue()
        .catch(() => ''),
    );
  const a = {
    id,
    type: ROLE,
    name: await field('English Name'),
    status: await field('Status'),
    hold: await field('Is Hold'),
    phone: (await field('Phone')).replace(/\D/g, '').replace(/^(966|0)/, ''),
  };
  a.names = [a.name];
  if (ROLE === 'dealer') {
    const company = await field('Company Name En');
    if (company && company !== a.name) a.names.push(company);
    a.verified = await page
      .locator('label.form-check-label', { hasText: 'Documents are reviewed?' })
      .locator('xpath=preceding-sibling::input[1]')
      .isChecked()
      .catch(() => false);
  } else {
    a.verified =
      (await field('Is Verified')) === 'Yes' && (await field('Registration Type')) === 'Deposit';
  }
  a.canBid = a.status === 'active' && a.hold === 'No' && a.verified && /^5\d{8}$/.test(a.phone);
  return a;
}

/**
 * Two NEW bidders [android, ios]: the --accounts IDs (checked again), or else the first two accounts of the role's
 * filtered list that can bid and were never used by this script.
 */
async function pickNewAccounts(page, state) {
  const used = new Set(state.usedAccounts);
  const picked = [];
  if (ACCOUNT_IDS) {
    if (ACCOUNT_IDS[0] === ACCOUNT_IDS[1]) throw new Error('--accounts needs two different IDs.');
    for (const id of ACCOUNT_IDS) {
      if (used.has(id))
        throw new Error(`${ROLE} ${id} was used by an earlier run; every run needs new accounts.`);
      const a = await readAccount(page, id);
      if (!a.canBid)
        throw new Error(
          `${ROLE} ${id} cannot bid (status ${a.status || '?'}, hold ${a.hold || '?'}, verified ${a.verified}).`,
        );
      picked.push(a);
    }
    return picked;
  }
  const { model, filters } = ACCOUNT_LISTS[ROLE];
  const params = Object.fromEntries(Object.entries(filters).map(([k, v]) => [`${model}[${k}]`, v]));
  for (let n = 1; n <= 10 && picked.length < 2; n++) {
    await page.goto(
      `/backend/users/${ROLE}/index?` + new URLSearchParams({ ...params, page: String(n) }),
    );
    const ids = await page
      .locator('tbody tr[data-key]')
      .evaluateAll((rs) => rs.map((r) => r.getAttribute('data-key')));
    if (!ids.length) break;
    for (const id of ids) {
      if (picked.length === 2) break;
      if (used.has(id)) continue;
      const a = await readAccount(page, id);
      if (a.canBid) picked.push(a);
    }
  }
  if (picked.length < 2)
    throw new Error(`Found ${picked.length} new ${ROLE} account(s) that can bid; 2 are needed.`);
  return picked;
}

/** Sets a new random password on the account (Update form). It is kept in memory only: never saved or printed. */
async function resetPassword(page, acct) {
  const password = `Qa!${crypto.randomBytes(6).toString('hex')}X1`;
  await page.goto(`/backend/users/${acct.type}/update?id=${acct.id}`);
  const name = norm(await page.locator('input[name="Admin[name_en]"]').inputValue());
  if (name !== acct.name)
    throw new Error(
      `${acct.type} ${acct.id} is "${name}", expected "${acct.name}"; password not changed.`,
    );
  const form = page.locator('form', { has: page.locator('input[name="Admin[new_password]"]') });
  await form.locator('input[name="Admin[new_password]"]').fill(password);
  await form.locator('input[name="Admin[passwordConfirm]"]').fill(password);
  await form.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.endsWith('/update'), { timeout: 30000 }).catch(() => {});
  if (new URL(page.url()).pathname.endsWith('/update'))
    throw new Error(`${acct.type} ${acct.id}: the new password was not saved.`);
  acct.password = password;
}

/** Pricing of a vehicle: starting price, min increment, reserve, admin fee, and the bids needed to the reserve. */
async function pricing(page, vehicleId) {
  await page.goto(`/backend/vehicle/pricing/update?id=${vehicleId}`);
  const f = page.locator('form#w0');
  const v = async (sel) =>
    num(
      await f
        .locator(sel)
        .inputValue()
        .catch(() => '0'),
    );
  const p = {
    start: await v('#pricing-starting_price'),
    inc: await v('#pricing-min_increment'),
    reserve: await v('#reserve_price'),
    admin: await v('#administrative_expenses'),
  };
  p.steps = p.inc ? Math.ceil(Math.max(0, p.reserve - p.start) / p.inc) : Infinity;
  p.bids = Math.ceil(p.steps / MAX_STEPS);
  return p;
}

/** Unused test-supplier cars from the Failed list and Pricing Done, with the fewest bids to the reserve first. */
async function pickCar(page, state) {
  const found = [];
  for (const [source, url, link] of [
    ['Failed', '/backend/auction/failed/index', 'a[href*="vehicle/vehicle/view"]'],
    ['Pricing Done', '/backend/auction/pricing-done/index', null],
  ]) {
    for (let n = 1; n <= 2; n++) {
      await page.goto(`${url}?page=${n}`);
      for (const row of await page.locator('tbody tr[data-key]').all()) {
        const text = (await row.innerText()).replace(/\s+/g, ' ');
        const vin = (text.match(VIN_RE) || [])[0];
        const supplier = (text.match(TEST_SUPPLIER) || [])[0];
        if (!vin || !supplier || state.usedVins.includes(vin) || found.some((c) => c.vin === vin))
          continue;
        // A car whose last auction was a QA-AUTO one was used by another QA script (e.g. Buy Now runs).
        if (/QA-AUTO/.test(text)) continue;
        if (CAR_VIN && vin !== CAR_VIN) continue;
        const vehicleId = link
          ? (
              (await row
                .locator(link)
                .first()
                .getAttribute('href')
                .catch(() => '')) || ''
            ).match(/id=(\d+)/)?.[1]
          : await row.getAttribute('data-key');
        if (vehicleId)
          found.push({
            source,
            vin,
            supplier,
            vehicleId,
            rowKey: await row.getAttribute('data-key'),
          });
      }
    }
  }
  if (!found.length)
    throw new Error(
      CAR_VIN
        ? `${CAR_VIN} is not an unused test-supplier car in Failed or Pricing Done.`
        : 'No unused test-supplier car in Failed or Pricing Done.',
    );
  for (const c of found.slice(0, 12)) Object.assign(c, await pricing(page, c.vehicleId));
  // Standard: fewest bids to the reserve. Price Offering: the lowest reserve (smaller offers).
  const car = found
    .filter((c) => c.reserve && c.inc)
    .sort(
      (a, b) => (PO ? a.reserve - b.reserve : a.bids - b.bids) || (a.source === 'Failed' ? -1 : 1),
    )[0];
  if (!car) throw new Error('No candidate car has a reserve price and a min increment.');
  return car;
}

/** Bid plan: steps per bid (at most 6), and the "Your Increase" text each bid must show. */
function bidPlan(car) {
  const plan = [];
  for (let left = car.steps; left > 0; left -= MAX_STEPS) plan.push(Math.min(MAX_STEPS, left));
  return plan.map((steps, i) => ({
    device: i % 2 ? 'ios' : 'android',
    steps,
    increase: money(steps * car.inc),
  }));
}

/**
 * Price Offering: sealed offers, Android first, iOS higher. Default: reserve + admin fee + 500, rounded up to 500,
 * and 1,000 more on iOS; --offers overrides both.
 */
function offerPlan(car) {
  const base = Math.ceil((car.reserve + car.admin + 500) / 500) * 500;
  const [android, ios] = OFFERS || [base, base + 1000];
  return [
    { device: 'android', amount: android },
    { device: 'ios', amount: ios },
  ];
}

/**
 * Sets the Bid Type of the car's supplier (Update Supplier > Auction Info, its own form) and reads it back. The
 * supplier ID is the number in the test supplier's name (شركة تجريبية-782 -> 782), confirmed against its name field.
 */
async function setSupplierBidType(page, supplier, type) {
  const id = (supplier.match(/-(\d+)$/) || [])[1];
  if (!id) throw new Error(`Cannot tell the supplier ID of "${supplier}".`);
  const open = async () => {
    await page.goto(`/backend/users/supplier/update?id=${id}`);
    const name = (await page.locator('input[name="Supplier[supplier_name]"]').inputValue()).trim();
    if (name !== supplier) throw new Error(`Supplier ${id} is "${name}", expected "${supplier}".`);
    await page.locator('a[href="#pane-auction"]').click();
    await page.locator('#supplier-bid_type').waitFor({ state: 'attached' });
  };
  const read = () =>
    page.locator('#supplier-bid_type').evaluate((s) => s.selectedOptions[0]?.text.trim());
  await open();
  if ((await read()) === type) return type;
  const form = page.locator('#form-supplier-auction');
  await form.locator('#supplier-bid_type + .select2 .select2-selection').click();
  await page
    .locator('.select2-container--open .select2-results__option')
    .filter({ hasText: new RegExp(`^\\s*${type}\\s*$`) })
    .click();
  await form.locator('button[type="submit"]').click();
  const ok = page.locator('.swal2-popup .swal2-confirm');
  await ok.waitFor({ timeout: 15000 });
  await ok.click();
  await open();
  const now = await read();
  if (now !== type) throw new Error(`Supplier ${id} Bid Type is "${now}", expected "${type}".`);
  return now;
}

async function moveToUpcoming(page, car) {
  await page.goto(
    '/backend/auction/pricing-done/index?' +
      new URLSearchParams({ 'PricingDoneSearch[vin_number]': car.vin }),
  );
  await page.locator(`tbody tr[data-key="${car.rowKey}"] input.checkbox-row`).check();
  await page.locator('a.upcoming-multi-btn').first().click();
  const confirm = page.locator('#modal-m #confirm-modal');
  await confirm.waitFor();
  await Promise.all([
    page.waitForLoadState('load'),
    confirm.locator('button[type="submit"]').click(),
  ]);
}

const clock = (d) =>
  `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;

/** Create Auction wizard: Normal (Standard bidding), today, start/end times, the one car from <source>. */
async function createLiveAuction(page, car, source) {
  const start = new Date(Date.now() + START_IN * 60000);
  start.setSeconds(0, 0);
  if (start.getTime() - Date.now() < 150000) start.setMinutes(start.getMinutes() + 1);
  const end = new Date(start.getTime() + DURATION * 60000);
  if (end.getDate() !== start.getDate())
    throw new Error('The auction window would cross midnight.');
  const title = `QA-AUTO Live ${crypto.randomInt(1e7, 1e8)}`;
  await page.goto('/backend/auction/upcoming/create');
  const form = page.locator('#create-auction-form');
  await form.locator('#auction-type-select').selectOption({ label: 'Normal Auction' });
  await form.locator('#supplier-select + .select2 .select2-selection').click();
  await page
    .locator('.select2-container--open .select2-results__option')
    .filter({ hasText: new RegExp(`^\\s*${car.supplier}\\s*$`) })
    .click();
  await form.locator('#auction-title').fill(title);
  for (const sel of ['#auction-start_item_date', '#auction-end_item_date']) {
    await form.locator(sel).click();
    await page
      .locator('.datepicker-dropdown:visible .datepicker-days td.day:not(.old):not(.new)', {
        hasText: new RegExp(`^${start.getDate()}$`),
      })
      .click();
  }
  for (const [sel, d] of [
    ['#auction-start_item_time', start],
    ['#auction-end_item_time', end],
  ]) {
    await form.locator(sel).evaluate((el, v) => {
      const $ = window.jQuery;
      $(el).timepicker('setTime', v);
      $(el).trigger('change');
    }, clock(d));
  }
  const back = form.getByRole('button', { name: /Back to Configuration/ });
  for (let i = 1; i <= 3 && !(await back.isVisible()); i++) {
    const next = form.getByRole('button', { name: /Next: Select Cars/ });
    if (await next.isVisible()) await next.click();
    await back.waitFor({ timeout: 4000 }).catch(() => {});
  }
  if (!(await back.isVisible())) throw new Error('Create Auction stayed on step 1.');
  const step2 = form.locator('#step-2');
  const src = step2.locator('label:has(input[name="status_filter"])').filter({ hasText: source });
  if (!(await src.locator('input').isChecked())) await src.click();
  const row = step2
    .locator('#selected-items-grid tbody tr:has(input.checkbox-row)')
    .filter({ hasText: car.vin });
  await row.first().waitFor({ timeout: 20000 });
  await row.locator('input.checkbox-row').check();
  if ((await step2.locator('input.checkbox-row:checked').count()) !== 1)
    throw new Error('Expected exactly one car ticked.');
  await form.locator('#create-auction-btn').click();
  await page
    .locator('.swal2-popup')
    .filter({ hasText: 'created successfully' })
    .waitFor({ timeout: 20000 });
  await page.waitForLoadState('load').catch(() => {});
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(
        '/backend/auction/awaiting/index?' +
          new URLSearchParams({ 'AwaitingSearch[vin_number]': car.vin }),
      );
      break;
    } catch {
      await sleep(1.5);
    }
  }
  const awaiting = page.locator('tbody tr[data-key]').filter({ hasText: car.vin }).first();
  const itemId = await awaiting.getAttribute('data-key');
  const rowText = norm(await awaiting.innerText());
  return { title, start, end, itemId, rowText };
}

/** Turns the item's Auto Extend switch OFF in the Live list (waits for it to go live) and reads it back. */
async function autoExtendOff(page, vin) {
  const url =
    '/backend/auction/live/index?' + new URLSearchParams({ 'LiveSearch[vin_number]': vin });
  let row;
  for (let t = 0; t < 36; t++) {
    await page.goto(url);
    row = page.locator('tbody tr[data-key]').filter({ hasText: vin });
    if (await row.count()) break;
    await sleep(5);
  }
  if (!(await row.count())) return 'not live';
  if (await row.locator('input.auto-extend').isChecked()) {
    await row
      .locator('.bootstrap-switch')
      .filter({ has: page.locator('input.auto-extend') })
      .click();
    const ok = page.locator('.swal2-popup .swal2-confirm');
    await ok.waitFor({ timeout: 10000 }).catch(() => {});
    if (await ok.isVisible().catch(() => false)) await ok.click();
  }
  await page.goto(url);
  return (await page
    .locator('tbody tr[data-key]')
    .filter({ hasText: vin })
    .locator('input.auto-extend')
    .isChecked())
    ? 'ON'
    : 'OFF';
}

// ---------- Android (adb; every call has a timeout because the emulator can freeze) ----------
const SERIAL = env('ANDROID_UDID', 'emulator-5554');
const PKG = 'com.app.motory.dealer.staging';
const adb = (...a) =>
  execFileSync('adb', ['-s', SERIAL, ...a], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 25000,
  });
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
async function screen() {
  for (let i = 0; i < 4; i++) {
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
      const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
      return [...xml.matchAll(/<node [^>]*?>/g)].map(([a]) => {
        const g = (k) => (a.match(new RegExp(` ${k}="([^"]*)"`)) || [])[1] || '';
        const b = (g('bounds').match(/\d+/g) || [0, 0, 0, 0]).map(Number);
        return {
          text: decode(g('text')),
          id: g('resource-id').split('/').pop(),
          cls: g('class'),
          clickable: g('clickable') === 'true',
          x: (b[0] + b[2]) >> 1,
          y: (b[1] + b[3]) >> 1,
          left: b[0],
        };
      });
    } catch {
      await sleep(2);
    }
  }
  throw new Error('Android: the screen could not be read (emulator frozen?).');
}
const findText = (nodes, t) => nodes.find((n) => norm(n.text) === norm(t));
const findId = (nodes, id) => nodes.find((n) => n.id === id);
const tap = (n) => adb('shell', 'input', 'tap', String(n.x), String(n.y));
const typeText = (s) => adb('shell', 'input', 'text', s.replace(/ /g, '%s'));
/** Closes one-time dialogs: first participation ("Continue"), onboarding tips ("Ok"). */
async function androidCloseDialogs() {
  let s = await screen();
  for (let i = 0; i < 4; i++) {
    const b = findText(s, 'Continue') || findText(s, 'Ok');
    if (!b) return s;
    tap(b);
    await sleep(1.5);
    s = await screen();
  }
  return s;
}

async function androidToTabs() {
  let s = await androidCloseDialogs();
  for (let i = 0; i < 4 && !findId(s, 'item_menu_activity_main_bottom_navigation_more'); i++) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(1.5);
    s = await androidCloseDialogs();
  }
  if (!findId(s, 'item_menu_activity_main_bottom_navigation_more')) {
    adb('shell', 'am', 'force-stop', PKG);
    adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
    for (let i = 0; i < 12 && !findId(s, 'item_menu_activity_main_bottom_navigation_more'); i++) {
      await sleep(3);
      s = await screen();
      if (findText(s, 'Close')) tap(findText(s, 'Close'));
    }
  }
  return s;
}

async function androidEnsureUser(user) {
  let s = await androidToTabs();
  tap(findId(s, 'item_menu_activity_main_bottom_navigation_more'));
  await sleep(3);
  s = await androidCloseDialogs();
  if (namesOf(user).some((n) => findText(s, n))) return;
  if (!findText(s, 'Login/ Create an account')) {
    for (let i = 0; i < 3 && !findText(s, 'Log out'); i++) {
      adb('shell', 'input', 'swipe', '540', '1900', '540', '700', '400');
      await sleep(1.5);
      s = await screen();
    }
    tap(findText(s, 'Log out'));
    await sleep(2);
    tap(findText(await screen(), 'Log out'));
    await sleep(4);
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '400');
    await sleep(1.5);
    s = await screen();
  }
  tap(findText(s, 'Login/ Create an account'));
  await sleep(2);
  tap(findText(await screen(), 'Log In'));
  await sleep(3);
  s = await screen();
  tap(findId(s, 'edit_text_phone_number'));
  await sleep(0.7);
  // The field (after +966) drops digits typed in one go: type the 9 digits one by one and check them.
  adb('shell', 'input', 'keyevent', ...Array(12).fill('KEYCODE_DEL'));
  for (const digit of user.phone) {
    typeText(digit);
    await sleep(0.25);
  }
  await sleep(0.8);
  s = await screen();
  if (findId(s, 'edit_text_phone_number')?.text.replace(/\D/g, '') !== user.phone)
    throw new Error(`Android: the phone of ${user.name} was not typed correctly; not logging in`);
  tap(findId(s, 'edit_text_password'));
  await sleep(0.7);
  typeText(user.password);
  if (adb('shell', 'dumpsys input_method | grep -c mInputShown=true || true').trim() !== '0')
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await sleep(1);
  tap(findId(await screen(), 'button_login'));
  await sleep(7);
  s = await screen();
  if (findId(s, 'textview_accept_terms_button')) {
    tap(findId(s, 'textview_accept_terms_button'));
    await sleep(4);
    s = await screen();
  }
  if (findText(s, 'Not Now')) {
    tap(findText(s, 'Not Now'));
    await sleep(3);
  }
  s = await androidCloseDialogs();
  if (findId(s, 'text_view_password_label') && findText(s, 'Change Password'))
    throw new Error(`Android: ${user.name} must change its password in the app first.`);
  if (!namesOf(user).some((n) => findText(s, n)))
    throw new Error(`Android: not signed in as ${user.name}`);
}

async function androidOpenCar(title) {
  const s = await androidToTabs();
  tap(findId(s, 'item_menu_activity_main_bottom_navigation_home'));
  await sleep(3);
  tap(findText(await androidCloseDialogs(), 'Live Auctions'));
  await sleep(3);
  tap(findText(await screen(), 'Cars'));
  await sleep(4);
  for (let i = 0; i < 10; i++) {
    const card = findText(await screen(), title);
    if (card) {
      tap(card);
      await sleep(4);
      return;
    }
    adb('shell', 'input', 'swipe', '540', '1900', '540', '900', '400');
    await sleep(1.5);
  }
  throw new Error(`Android: "${title}" not under Live Auctions > Cars`);
}

/** On the open car page: Increase Price, "Your Increase" up to <increase>, Confirm Bid. */
async function androidBid(increase) {
  let s = await androidCloseDialogs();
  for (let t = 0; t < 20 && !findText(s, 'Increase Price'); t++) {
    await sleep(3);
    s = await androidCloseDialogs();
  }
  if (!findText(s, 'Increase Price'))
    throw new Error('Android: no "Increase Price" on the car page');
  tap(findText(s, 'Increase Price'));
  await sleep(2.5);
  const row = async () => {
    s = await screen();
    const label = findText(s, 'Your Increase');
    if (!label) return {};
    const value = s.find((n) => /^[0-9,]+$/.test(n.text) && Math.abs(n.y - label.y) < 45)?.text;
    const plus = s
      .filter((n) => n.clickable && Math.abs(n.y - label.y) < 60 && n.left > 500)
      .sort((a, b) => b.x - a.x)[0];
    return { value, plus };
  };
  let { value, plus } = await row();
  if (!plus) throw new Error('Android: the + button was not found');
  for (let i = 0; i < 8 && value !== increase; i++) {
    tap(plus);
    await sleep(0.35);
    ({ value } = await row());
  }
  if (value !== increase) {
    if (findText(s, 'Cancel')) tap(findText(s, 'Cancel'));
    throw new Error(`Android: "Your Increase" shows ${value}, expected ${increase}; not confirmed`);
  }
  tap(findText(s, 'Confirm Bid'));
  await sleep(4);
  s = await androidCloseDialogs();
  const i = s.findIndex((n) => n.text === 'Highest Price');
  return i >= 0 ? s.slice(i + 1, i + 4).find((n) => /^[0-9,]+$/.test(n.text))?.text : '?';
}

/** Price Offering, on the open car page: Place a Bid, Bid Amount = <amount>, hide the keyboard, Submit Bid. */
async function androidOffer(amount) {
  let s = await androidCloseDialogs();
  for (let t = 0; t < 20 && !findText(s, 'Place a Bid'); t++) {
    await sleep(3);
    s = await androidCloseDialogs();
  }
  if (!findText(s, 'Place a Bid')) throw new Error('Android: no "Place a Bid" on the car page');
  tap(findText(s, 'Place a Bid'));
  await sleep(2.5);
  s = await androidCloseDialogs();
  const field = () => s.find((n) => n.cls.endsWith('EditText'));
  if (!field()) throw new Error('Android: no Bid Amount field');
  tap(field());
  await sleep(1);
  adb('shell', 'input', 'keyevent', ...Array(12).fill('KEYCODE_DEL'));
  typeText(String(amount));
  await sleep(1);
  // Back only while the keyboard is up: with it hidden, Back closes the sheet.
  if (adb('shell', 'dumpsys input_method | grep -c mInputShown=true || true').trim() !== '0')
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await sleep(1.5);
  s = await screen();
  if (num(field()?.text) !== amount)
    throw new Error(
      `Android: Bid Amount shows "${field()?.text}", expected ${money(amount)}; not submitted`,
    );
  if (!findText(s, 'Submit Bid')) throw new Error('Android: no "Submit Bid"; not submitted');
  tap(findText(s, 'Submit Bid'));
  await sleep(4);
  s = await androidCloseDialogs();
  if (!findText(s, 'Your Bid Amount') && !findText(s, 'Bid submitted successfully!'))
    throw new Error('Android: the offer was not confirmed ("Your Bid Amount" not shown)');
}

// ---------- iOS (Appium + WebDriverAgent) ----------
const parseSource = (src) =>
  [...src.matchAll(/<XCUIElementType(\w+) ([^>]*?)\/?>/g)].map((m) => {
    const g = (k) => (m[2].match(new RegExp(` ${k}="([^"]*)"`)) || [])[1] || '';
    return {
      type: m[1],
      label: g('label'),
      visible: g('visible') === 'true',
      x: +g('x'),
      y: +g('y'),
      w: +g('width'),
      h: +g('height'),
    };
  });
async function iosSession() {
  const wda = env('IOS_WDA_URL');
  const udid = env('IOS_UDID');
  if (!wda || !udid) throw new Error('iOS: set IOS_WDA_URL and IOS_UDID.');
  const d = await remote({
    hostname: '127.0.0.1',
    port: Number(env('APPIUM_PORT', '4723')),
    path: '/',
    logLevel: 'error',
    capabilities: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': udid,
      'appium:bundleId': 'com.motory.dealer',
      'appium:noReset': true,
      'appium:newCommandTimeout': 900,
      'appium:webDriverAgentUrl': wda,
    },
  });
  const ios = { d };
  ios.els = async () => parseSource(await d.getPageSource());
  ios.tapEl = (e) => d.execute('mobile: tap', { x: e.x + e.w / 2, y: e.y + e.h / 2 });
  ios.button = (label) =>
    d.$(
      `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(label)}`,
    );
  ios.closeDialogs = async () => {
    for (let i = 0; i < 5; i++) {
      const b = (await ios.els()).find(
        (e) => e.visible && e.type === 'Button' && ['Continue', 'Ok', 'Close'].includes(e.label),
      );
      if (!b) return;
      await ios.tapEl(b);
      await d.pause(1300);
    }
  };
  ios.toTabs = async () => {
    await d.execute('mobile: activateApp', { bundleId: 'com.motory.dealer' });
    for (let i = 0; i < 5; i++) {
      await ios.closeDialogs();
      if (await (await ios.button('More')).isExisting()) return;
      const back = await ios.button('navigationBarBack');
      if (await back.isExisting()) await back.click();
      else await d.execute('mobile: tap', { x: 32, y: 60 });
      await d.pause(1500);
    }
  };
  return ios;
}

async function iosEnsureUser(ios, user) {
  const { d } = ios;
  await ios.toTabs();
  await (await ios.button('More')).click();
  await d.pause(2000);
  await ios.closeDialogs();
  let src = await d.getPageSource();
  if (namesOf(user).some((n) => norm(src).includes(`name="${n}"`))) return;
  if (!src.includes('Login/ Create an account')) {
    await d.execute('mobile: swipe', { direction: 'up' });
    await d.pause(1500);
    await (await ios.button('Log out')).click();
    await d.pause(1500);
    let top = null;
    for (const b of await d.$$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Log out"',
    )) {
      const r = JSON.parse(await b.getAttribute('rect'));
      if (!top || r.y < top.y) top = { b, y: r.y };
    }
    await top.b.click();
    await d.pause(3000);
    await (await ios.button('More')).click();
    await d.pause(2000);
  }
  await (await ios.button('Login/ Create an account')).click();
  await d.pause(2000);
  await (await ios.button('Log In')).click();
  await d.pause(2500);
  const phone = await d.$('-ios predicate string:type == "XCUIElementTypeTextField"');
  await phone.click();
  await phone.setValue(`0${user.phone}`);
  if (
    !String((await phone.getAttribute('value')) || '')
      .replace(/\D/g, '')
      .endsWith(user.phone)
  )
    throw new Error(`iOS: the phone of ${user.name} was not typed correctly; not logging in`);
  const pass = await d.$('-ios predicate string:type == "XCUIElementTypeSecureTextField"');
  await pass.click();
  await pass.setValue(user.password);
  // The Log In button has no label (nil): the wide unlabeled button right under the password field.
  const passY = JSON.parse(await pass.getAttribute('rect')).y;
  let login = null;
  for (const b of await d.$$('-ios predicate string:type == "XCUIElementTypeButton"')) {
    if (await b.getAttribute('label')) continue;
    const r = JSON.parse(await b.getAttribute('rect'));
    if (r.y > passY && r.width > 200 && (!login || r.y < login.y)) login = { b, y: r.y };
  }
  if (!login) throw new Error('iOS: Log In button not found');
  await login.b.click();
  await d.pause(6000);
  await ios.closeDialogs();
  src = await d.getPageSource();
  if (!namesOf(user).some((n) => norm(src).includes(`name="${n}"`)))
    throw new Error(`iOS: not signed in as ${user.name}`);
}

async function iosOpenCar(ios, title) {
  const { d } = ios;
  await ios.toTabs();
  await (await ios.button('Home')).click();
  await d.pause(2000);
  await ios.closeDialogs();
  await (await d.$('-ios predicate string:label == "Live Auctions"')).click();
  await d.pause(2500);
  for (const b of await d.$$(
    '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Cars"',
  )) {
    if (JSON.parse(await b.getAttribute('rect')).x >= 0) {
      await b.click();
      break;
    }
  }
  await d.pause(3500);
  for (let i = 0; i < 6; i++) {
    // Standard cards show "Opening/Highest Price"; Price Offering cards only "Auction Status".
    for (const b of await d.$$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND (label CONTAINS "Price" OR label CONTAINS "Auction Status")',
    )) {
      if (norm(await b.getAttribute('label')).includes(norm(title))) {
        await b.click();
        await d.pause(4000);
        return;
      }
    }
    await d.execute('mobile: swipe', { direction: 'up' });
    await d.pause(1200);
  }
  throw new Error(`iOS: "${title}" not under Live Auctions > Cars`);
}

/** On the open car page: Increase Price, "Your Increase" up to <increase>, Confirm Bid. */
async function iosBid(ios, increase) {
  const { d } = ios;
  let els = await ios.els();
  const find = (label) => els.find((e) => e.visible && e.label === label);
  for (let t = 0; t < 15 && !find('Increase Price'); t++) {
    await ios.closeDialogs();
    await d.pause(2000);
    els = await ios.els();
  }
  if (!find('Increase Price')) throw new Error('iOS: no "Increase Price" on the car page');
  await ios.tapEl(find('Increase Price'));
  await d.pause(2500);
  const row = async () => {
    els = await ios.els();
    const label = find('Your Increase');
    if (!label) return {};
    const same = els.filter((e) => e.visible && Math.abs(e.y - label.y) < 12);
    return {
      value: same.find((e) => e.type === 'StaticText' && /^[0-9,]+$/.test(e.label))?.label,
      plus: same.filter((e) => e.type === 'Button' && !e.label).sort((a, b) => b.x - a.x)[0],
    };
  };
  let { value, plus } = await row();
  if (!plus) throw new Error('iOS: the + button was not found');
  for (let i = 0; i < 8 && value !== increase; i++) {
    await ios.tapEl(plus);
    await d.pause(250);
    ({ value } = await row());
  }
  if (value !== increase) {
    if (find('Cancel')) await ios.tapEl(find('Cancel'));
    throw new Error(`iOS: "Your Increase" shows ${value}, expected ${increase}; not confirmed`);
  }
  await ios.tapEl(find('Confirm Bid'));
  await d.pause(4000);
  await ios.closeDialogs();
  els = await ios.els();
  const i = els.findIndex((e) => e.label === 'Highest Price');
  return i >= 0
    ? els.slice(i + 1, i + 6).find((e) => /^[0-9,]+$/.test(e.label))?.label || '?'
    : '?';
}

/**
 * Price Offering, on the open car page: Place a Bid, Bid Amount = <amount>, Submit Bid. Never tap outside the sheet
 * (that closes it). "Submit Bid" has no label (nil or ""): the wide button right under the amount field, above the
 * number pad, enabled once an amount is typed.
 */
async function iosOffer(ios, amount) {
  const { d } = ios;
  const tapIfShown = async (labels) => {
    for (const l of labels) {
      const b = await ios.button(l);
      if (await b.isExisting()) {
        await b.click();
        await d.pause(1000);
      }
    }
  };
  let place;
  for (let t = 0; t < 15; t++) {
    place = await ios.button('Place a Bid');
    if (await place.isExisting()) break;
    await d.pause(2000);
  }
  if (!(await place.isExisting())) throw new Error('iOS: no "Place a Bid" on the car page');
  await place.click();
  await d.pause(2500);
  await tapIfShown(['Continue', 'Ok']);
  const field = await d.$(
    '-ios predicate string:type == "XCUIElementTypeTextField" AND visible == 1',
  );
  await field.click();
  await field.clearValue().catch(() => {});
  await field.setValue(String(amount));
  await d.pause(800);
  const typed = num(await field.getAttribute('value'));
  if (typed !== amount)
    throw new Error(
      `iOS: Bid Amount shows ${money(typed)}, expected ${money(amount)}; not submitted`,
    );
  const fr = JSON.parse(await field.getAttribute('rect'));
  let submit = null;
  for (const b of await d.$$(
    '-ios predicate string:type == "XCUIElementTypeButton" AND visible == 1',
  )) {
    if (await b.getAttribute('label')) continue;
    const r = JSON.parse(await b.getAttribute('rect'));
    if (r.y > fr.y + fr.height && r.y < fr.y + fr.height + 120 && r.width > 300) {
      submit = { b, r };
      break;
    }
  }
  if (!submit) throw new Error('iOS: "Submit Bid" not found under the amount field; not submitted');
  if (String(await submit.b.getAttribute('enabled')) !== 'true')
    throw new Error('iOS: "Submit Bid" is disabled; not submitted');
  await d.execute('mobile: tap', {
    x: submit.r.x + submit.r.width / 2,
    y: submit.r.y + submit.r.height / 2,
  });
  await d.pause(3000);
  await tapIfShown(['Continue', 'Ok']);
  if (!(await ios.els()).some((e) => e.visible && e.label === 'Your Bid Amount'))
    throw new Error('iOS: the offer was not confirmed ("Your Bid Amount" not shown)');
}

// ---------- website (guest) ----------
/** Follows the car on the website until it shows the auction ended; returns what was seen. */
async function watchWebsite(browser, itemId, stopAt) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: SHOW ? null : { width: 1440, height: 1000 },
  });
  // Writes to the Mazad server are blocked; Firebase is allowed (the site loads its auction lists through it).
  await ctx.route('**/*', (r) =>
    ['GET', 'HEAD'].includes(r.request().method()) || !r.request().url().startsWith(BASE)
      ? r.continue()
      : r.abort(),
  );
  const page = await ctx.newPage();
  const seen = { live: false, maxBids: 0, ended: false, lines: [] };
  let last = '';
  while (Date.now() < stopAt) {
    await page.goto(`/en/car/${itemId}/`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(2500);
    const t = norm(
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    );
    const bids = Number((t.match(/Biddings (\d+) Bids?/) || [])[1] || 0);
    const state = /Auction was held on/.test(t)
      ? 'ended'
      : /\d{2} : \d{2} : \d{2} : \d{2}/.test(t)
        ? /Opening Price|Highest Price|Bidding Started|Sealed Bidding/.test(t)
          ? 'live'
          : 'upcoming'
        : '?';
    const line = `${state} | ${bids} bid(s)`;
    if (line !== last) {
      seen.lines.push(`${ts()} ${line}`);
      log(`  web ${ts()}: car page ${line}`);
      last = line;
    }
    if (state === 'live') seen.live = true;
    seen.maxBids = Math.max(seen.maxBids, bids);
    if (state === 'ended') {
      seen.ended = true;
      break;
    }
    await sleep(3);
  }
  await ctx.close();
  return seen;
}

// ---------- run ----------
(async () => {
  log(
    `Live auction run on ${BASE} | role ${ROLE} | bidding ${BIDDING} | ${GO ? 'EXECUTE' : 'DRY RUN (nothing is changed)'}`,
  );
  const state = loadState();
  const browser = await chromium.launch({ headless: !SHOW });
  let ios;
  try {
    const page = await openBackOffice(browser);
    log(`\n1. New ${ROLE} accounts (Android, iOS)`);
    const [aUser, iUser] = await pickNewAccounts(page, state);
    log(`  Android: ${aUser.name} (${aUser.id}) | iOS: ${iUser.name} (${iUser.id})`);

    log('\n2. Car');
    const car = await pickCar(page, state);
    const plan = bidPlan(car);
    const offers = offerPlan(car);
    const topOffer = Math.max(...offers.map((o) => o.amount));
    if (PO) {
      log(
        `  ${car.vin} (${car.source}, ${car.supplier}) | start ${money(car.start)} | reserve ${money(car.reserve)} | admin fee ${money(car.admin)}`,
      );
      log(
        `  plan: sealed offers ${offers.map((o) => `${o.device} ${money(o.amount)}`).join(', ')} -> expect ${topOffer - car.admin >= car.reserve ? 'Sold' : 'Failed (below the reserve)'}`,
      );
    } else {
      log(
        `  ${car.vin} (${car.source}, ${car.supplier}) | start ${money(car.start)} | min increment ${money(car.inc)} | reserve ${money(car.reserve)} | ${car.steps} steps -> ${plan.length} bids`,
      );
      log(
        `  plan: ${plan.map((b) => `${b.device} +${b.increase}`).join(', ')} -> bid ${money(car.start + car.steps * car.inc)}`,
      );
    }
    if (!GO) {
      log(
        `\nTo run: add --go --accounts ${aUser.id},${iUser.id} (approves setting a new password on both accounts).`,
      );
      return;
    }

    log('\n3. Devices');
    // From here on these accounts count as used, even if a later step fails.
    for (const u of [aUser, iUser]) {
      await resetPassword(page, u);
      state.usedAccounts.push(u.id);
      saveState(state);
    }
    log('  new passwords set on both accounts (kept in memory only)');
    await androidEnsureUser(aUser);
    log(`  Android signed in as ${aUser.name}`);
    ios = await iosSession();
    await iosEnsureUser(ios, iUser);
    log(`  iOS signed in as ${iUser.name}`);

    log('\n4. Auction');
    if (car.source === 'Pricing Done') await moveToUpcoming(page, car);
    let auction;
    if (PO)
      log(`  supplier Bid Type: ${await setSupplierBidType(page, car.supplier, 'Price Offering')}`);
    try {
      auction = await createLiveAuction(page, car, car.source === 'Failed' ? 'Failed' : 'Upcoming');
    } finally {
      // Always back to Standard, even when creating the auction failed.
      if (PO)
        log(
          `  supplier Bid Type restored: ${await setSupplierBidType(page, car.supplier, 'Standard')}`,
        );
    }
    log(
      `  "${auction.title}" item ${auction.itemId} | ${clock(auction.start)} -> ${clock(auction.end)}`,
    );
    if (PO)
      check(
        /Price Offering/.test(auction.rowText),
        'auction created with Bidding Type Price Offering',
      );
    state.usedVins.push(car.vin);
    const run = {
      at: new Date().toISOString(),
      vin: car.vin,
      itemId: auction.itemId,
      bidding: BIDDING,
      users: [aUser.id, iUser.id],
      bids: [],
    };
    state.runs.push(run);
    saveState(state);
    const api = await (
      await fetch(`${BASE}/api/v1/auction/list?section=home&tabs=upcoming`, {
        headers: {
          'x-app-name': 'mazad',
          'x-device-type': 'android',
          'x-app-version': '8.2.2-stage',
          lang: 'en',
        },
      })
    ).json();
    const appTitle =
      api.data.auction_list.data.find((a) => String(a.id) === auction.itemId)?.auction_title ||
      car.vin;
    const web = watchWebsite(browser, auction.itemId, auction.end.getTime() + 8 * 60000);

    log(`\n5. Live (waiting for ${clock(auction.start)})`);
    while (Date.now() < auction.start.getTime() + 8000) await sleep(2);
    const aePage = await browser
      .newContext({ baseURL: BASE, storageState: path.join(ROOT, '.auth/dev-root.json') })
      .then((c) => c.newPage());
    const [ae] = await Promise.all([
      // Price Offering items have no Auto Extend switch.
      PO || KEEP_AUTO_EXTEND
        ? Promise.resolve(PO ? 'n/a' : 'kept')
        : autoExtendOff(aePage, car.vin),
      androidOpenCar(appTitle),
      iosOpenCar(ios, appTitle),
    ]);
    log(`  car open on both devices | item Auto Extend: ${ae}`);
    let placed = 0;
    // Each device submits one sealed offer; a failure on one does not stop the other.
    for (const o of PO ? offers : []) {
      try {
        if (o.device === 'android') await androidOffer(o.amount);
        else await iosOffer(ios, o.amount);
        placed++;
        run.bids.push({ at: ts(), device: o.device, offer: o.amount });
        log(`  ${ts()} ${o.device} offer ${money(o.amount)} submitted`);
      } catch (e) {
        log(`  ${ts()} ${o.device} offer FAILED: ${e.message}`);
      }
    }
    for (const b of PO ? [] : plan) {
      try {
        const price =
          b.device === 'android' ? await androidBid(b.increase) : await iosBid(ios, b.increase);
        placed++;
        run.bids.push({ at: ts(), device: b.device, increase: b.increase, price });
        log(`  ${ts()} ${b.device} +${b.increase} -> highest ${price}`);
      } catch (e) {
        log(`  ${ts()} ${b.device} bid FAILED: ${e.message}`);
        break;
      }
    }
    saveState(state);

    log('\n6. Result');
    let where = 'live';
    const until = Math.max(Date.now(), auction.end.getTime()) + 6 * 60000;
    while (Date.now() < until) {
      await page.goto(
        '/backend/auction/sold/index?' +
          new URLSearchParams({ 'SoldListViewSearch[vin_number]': car.vin }),
      );
      if (await page.locator('tbody tr[data-key]').count()) {
        where = 'sold';
        break;
      }
      await page.goto(
        '/backend/auction/failed/index?' +
          new URLSearchParams({ 'FailedListViewSearch[vin_number]': car.vin }),
      );
      if (await page.locator('tbody tr[data-key]').filter({ hasText: auction.title }).count()) {
        where = 'failed';
        break;
      }
      await sleep(15);
    }
    const seen = await web;
    const expected = PO && topOffer - car.admin < car.reserve ? 'failed' : 'sold';
    if (PO) {
      check(placed === offers.length, `both sealed offers placed, Android and iOS (${placed})`);
    } else {
      check(
        ae === 'OFF' || KEEP_AUTO_EXTEND,
        `item Auto Extend ${KEEP_AUTO_EXTEND ? 'kept' : 'turned OFF'} (${ae})`,
      );
      check(
        placed === plan.length,
        `all ${plan.length} bids placed alternately Android/iOS (${placed})`,
      );
    }
    check(
      where === expected,
      `car went to ${expected === 'sold' ? 'Sold' : 'Failed'} after the end (${where})`,
    );
    if (where === 'sold') {
      await page.goto(
        '/backend/auction/sold/index?' +
          new URLSearchParams({ 'SoldListViewSearch[vin_number]': car.vin }),
      );
      const t = (await page.locator('tbody tr[data-key]').first().innerText()).replace(/\s+/g, ' ');
      const g = (re) => (t.match(re) || [])[1] || '?';
      const highest = num(g(/Highest Price ([\d,]+)/));
      // Standard: the last bid wins. Price Offering: the higher offer wins.
      const lastBidder = PO
        ? offers.find((o) => o.amount === topOffer).device === 'android'
          ? aUser
          : iUser
        : plan.length % 2
          ? aUser
          : iUser;
      if (PO) {
        check(/Bidding Type Price Offering/.test(t), 'Sold row: Bidding Type Price Offering');
        check(
          highest === topOffer,
          `Highest Price ${money(highest)} = the higher offer ${money(topOffer)}`,
        );
      }
      check(
        g(/Status (.+?) Type/) === 'Waiting Transfer',
        `Status Waiting Transfer (${g(/Status (.+?) Type/)})`,
      );
      check(/Type Auction/.test(t), 'Type Auction');
      check(
        Number(g(/Total Bids (\d+)/)) === placed && g(/Total Bidders (\d+)/) === '2',
        `bids ${g(/Total Bids (\d+)/)} by ${g(/Total Bidders (\d+)/)} bidders`,
      );
      check(
        highest - car.admin >= car.reserve,
        `highest bid ${money(highest - car.admin)} (+${money(car.admin)} fees = ${money(highest)}) >= reserve ${money(car.reserve)}`,
      );
      check(
        namesOf(lastBidder)
          .map(norm)
          .includes(norm(g(/Name (.+?) Title/))),
        `winner ${lastBidder.name} (${g(/Name (.+?) Title/)})`,
      );
      log(`    Sold ID ${g(/ID (\d+)/)} at ${g(/Sale Date ([\d-]+ [\d:]+)/)}`);
    }
    check(seen.live, 'website (guest) showed the car live');
    check(seen.maxBids === placed, `website showed ${seen.maxBids} bid(s)`);
    check(seen.ended, 'website showed the auction ended');
    run.result = { where, checks: checks.map(([ok, l]) => `${ok ? 'PASS' : 'FAIL'} ${l}`) };
    saveState(state);
  } finally {
    if (ios) await ios.d.deleteSession().catch(() => {});
    await browser.close();
  }
  if (!GO) return;
  const failed = checks.filter(([ok]) => !ok).length;
  log(
    `\n${failed ? `${failed} CHECK(S) FAILED` : 'ALL CHECKS PASSED'} | state: ${path.relative(ROOT, STATE_FILE)}`,
  );
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error(`STOPPED: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
});
