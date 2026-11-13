#!/usr/bin/env node
/* global process, console, URL, URLSearchParams, setTimeout, structuredClone, fetch, window */
/**
 * Live auction run on staging (stg-154): creates a short Standard auction for a NEW car, two test users bid
 * alternately from the Android app and the iOS app until the price reaches the car's Reserve Price, the website
 * is followed as a guest, and the back office is checked.
 *
 *   TEST_ENV=stg-154 node scripts/live-auction-run.mjs [--go] [--role individual|dealer] [--user <androidId>,<iosId>]
 *       [--car <VIN>] [--start-in 3] [--duration 5] [--fail-held-sales] [--keep-auto-extend] [--show]
 *
 * - Default is a DRY RUN: prints the bidders, the car and the bid plan; changes nothing.
 * - --go: (1) signs the Android emulator and the iOS device in as the two bidders, (2) creates a "QA-AUTO Live <n>"
 *   Normal auction (Bidding Type Standard) for the car, starting --start-in minutes from now and lasting --duration
 *   minutes, (3) when it goes live opens the car on both devices and turns that item's Auto Extend OFF in the Live
 *   list (unless --keep-auto-extend), (4) bids alternately Android/iOS ("Increase Price", "Your Increase" + steps of
 *   Min Increment, at most 6 steps per bid, "Confirm Bid") until the bid reaches the Reserve Price, (5) checks the
 *   back office (bids table, Highest >= Reserve, Sold row: Waiting Transfer, Type Auction, winner) and what the
 *   website showed (Live listing, car page price and bid count, ended).
 * - Bidders: two verified test accounts with a deposit and no hold (--role individual by default, or dealer), least
 *   recently used first; --user picks them. A winner goes on hold while its sale is Waiting Transfer;
 *   --fail-held-sales frees a held candidate by marking its QA-AUTO sale Failed (Penalty 0, Block User off).
 *   Credentials come from .env only (see .env.example) and are never printed.
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
const FAIL_HELD = argv.includes('--fail-held-sales');
const KEEP_AUTO_EXTEND = argv.includes('--keep-auto-extend');
const SHOW = argv.includes('--show');
const ROLE = opt('--role', 'individual');
const USER_IDS = opt('--user', null)?.split(',');
const CAR_VIN = opt('--car', null);
const START_IN = Number(opt('--start-in', 3));
const DURATION = Number(opt('--duration', 5));
const MAX_STEPS = 6; // "Your Increase" stops at 6 x Min Increment per bid

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

const DOTENV = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const env = (k, fallback) => process.env[k] || DOTENV[k] || fallback;

/** Test accounts with a deposit (back-office type, ID, display names; credentials in .env as <prefix>_PHONE/_PASSWORD). */
const USERS = [
  {
    prefix: 'ANDROID_TEST_INDIVIDUAL',
    id: '7946',
    name: 'Individual Motory test',
    type: 'individual',
  },
  { prefix: 'IOS_TEST_INDIVIDUAL', id: '3038', name: 'Test iOS', type: 'individual' },
  { prefix: 'TEST_ANDROID_B', id: '5450', name: 'test android', type: 'individual' },
  { prefix: 'TEST_DEALER', id: '1331', name: 'Dealer Motory Test', type: 'dealer' },
  // A Dealer's Sold row names its company (Company Name En), so that name is accepted too.
  {
    prefix: 'TEST_DEALER_B',
    id: '779',
    name: 'Test English Name',
    alt: ['Test Arabic Name', 'Test Company Name En'],
    type: 'dealer',
  },
  { prefix: 'TEST_DEALER_C', id: '715', name: 'Test User', alt: ['NGI'], type: 'dealer' },
];
const namesOf = (u) => [u.name, ...(u.alt || [])];
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
  runs: [],
};
const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return structuredClone(SEED);
  }
};
const saveState = (s) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`);
};
const lastUsedAt = (state, id) =>
  state.runs
    .filter((r) => r.users?.includes(id))
    .map((r) => r.at)
    .sort()
    .pop() || '';

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

async function isHeld(page, user) {
  await page.goto(`/backend/users/${user.type}/update?id=${user.id}`);
  const name = (await page.locator('input[name="Admin[name_en]"]').inputValue()).trim();
  if (name !== user.name)
    throw new Error(`${user.type} ${user.id} is "${name}", expected "${user.name}".`);
  return page.locator('input[type=checkbox][name="Admin[is_hold]"]').isChecked();
}

/** QA-AUTO sales (Waiting Transfer) of a user on the first Sold pages. */
async function openSalesOf(page, user) {
  const vins = [];
  for (let n = 1; n <= 3; n++) {
    await page.goto(`/backend/auction/sold/index?page=${n}`);
    const rows = await page
      .locator('tbody tr[data-key]')
      .evaluateAll((rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
    for (const t of rows) {
      if (
        namesOf(user).some((x) => t.includes(`Name ${x} Title`)) &&
        t.includes('Waiting Transfer') &&
        t.includes('QA-AUTO')
      ) {
        const vin = (t.match(VIN_RE) || [])[0];
        if (vin) vins.push(vin);
      }
    }
  }
  return vins;
}

/** Marks one Sold row Failed: "Cancellation upon request by the customer", Penalty 0, Block User off. */
async function markSaleFailed(page, vin, user) {
  await page.goto(
    '/backend/auction/sold/index?' + new URLSearchParams({ 'SoldListViewSearch[vin_number]': vin }),
  );
  const row = page.locator('tbody tr[data-key]').filter({ hasText: vin });
  const text = (await row.innerText()).replace(/\s+/g, ' ');
  if (
    !text.includes('Waiting Transfer') ||
    !namesOf(user).some((x) => text.includes(`Name ${x} Title`))
  )
    throw new Error(`Sold row of ${vin} is not a Waiting Transfer sale to ${user.name}.`);
  await row.locator('a.failed-btn').first().click();
  const modal = page
    .locator('.modal.show')
    .filter({ has: page.locator('#remaininginsuranceamount-remaining_insurance_amount') });
  await modal.waitFor();
  await modal
    .locator('label')
    .filter({ hasText: 'Cancellation upon request by the customer' })
    .first()
    .click();
  await modal.locator('#remaininginsuranceamount-remaining_insurance_amount').fill('0');
  const block = modal.locator('input[name="block-user"]');
  if (await block.isChecked()) await block.uncheck({ force: true });
  if (await block.isChecked()) throw new Error('Block User would be on; not submitted.');
  const done = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/ajax/failed-auction-item'),
  );
  await modal.locator('button[type="submit"]').click();
  await done;
}

async function pickBidders(page, state) {
  const candidates = USER_IDS
    ? USER_IDS.map((id) => {
        const u = USERS.find((x) => x.id === id);
        if (!u)
          throw new Error(
            `--user ${id} is not a known test account (${USERS.map((x) => x.id).join(', ')}).`,
          );
        return u;
      })
    : USERS.filter((u) => u.type === ROLE).sort((a, b) =>
        lastUsedAt(state, a.id).localeCompare(lastUsedAt(state, b.id)),
      );
  const free = [];
  const held = [];
  for (const u of candidates) {
    if (!DOTENV[`${u.prefix}_PHONE`] || !DOTENV[`${u.prefix}_PASSWORD`]) {
      log(`  ${u.name}: no credentials in .env, skipped`);
      continue;
    }
    ((await isHeld(page, u)) ? held : free).push(u);
  }
  log(
    `  free: ${free.map((u) => u.name).join(', ') || 'none'} | on hold: ${held.map((u) => u.name).join(', ') || 'none'}`,
  );
  while (free.length < 2 && held.length) {
    const u = held.shift();
    if (!FAIL_HELD) {
      log(`  ${u.name} is on hold; rerun with --fail-held-sales to free it`);
      continue;
    }
    const vins = await openSalesOf(page, u);
    log(
      `  ${u.name}: open sale(s) ${vins.join(', ') || 'none found'}${GO ? ' -> Failed' : ' (would be marked Failed)'}`,
    );
    if (!GO) {
      free.push(u);
      continue;
    }
    for (const v of vins) await markSaleFailed(page, v, u);
    if (!(await isHeld(page, u))) free.push(u);
  }
  if (free.length < 2) throw new Error(`Need 2 bidders without a hold, found ${free.length}.`);
  return free.slice(0, 2); // [android, ios]
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
  const car = found
    .filter((c) => c.reserve && c.inc)
    .sort((a, b) => a.bids - b.bids || (a.source === 'Failed' ? -1 : 1))[0];
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
  const itemId = await page
    .locator('tbody tr[data-key]')
    .filter({ hasText: car.vin })
    .first()
    .getAttribute('data-key');
  return { title, start, end, itemId };
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
  typeText(DOTENV[`${user.prefix}_PHONE`]);
  tap(findId(s, 'edit_text_password'));
  await sleep(0.7);
  typeText(DOTENV[`${user.prefix}_PASSWORD`]);
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
  if (namesOf(user).some((n) => src.includes(`name="${n}"`))) return;
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
  await phone.setValue(DOTENV[`${user.prefix}_PHONE`]);
  const pass = await d.$('-ios predicate string:type == "XCUIElementTypeSecureTextField"');
  await pass.click();
  await pass.setValue(DOTENV[`${user.prefix}_PASSWORD`]);
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
  if (!namesOf(user).some((n) => src.includes(`name="${n}"`)))
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
    for (const b of await d.$$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS "Price"',
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
        ? /Opening Price|Highest Price/.test(t)
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
    `Live auction run on ${BASE} | role ${USER_IDS ? 'by --user' : ROLE} | ${GO ? 'EXECUTE' : 'DRY RUN (nothing is changed; add --go to execute)'}`,
  );
  const state = loadState();
  const browser = await chromium.launch({ headless: !SHOW });
  let ios;
  try {
    const page = await openBackOffice(browser);
    log('\n1. Bidders (Android, iOS)');
    const [aUser, iUser] = await pickBidders(page, state);
    log(`  Android: ${aUser.name} | iOS: ${iUser.name}`);

    log('\n2. Car');
    const car = await pickCar(page, state);
    const plan = bidPlan(car);
    log(
      `  ${car.vin} (${car.source}, ${car.supplier}) | start ${money(car.start)} | min increment ${money(car.inc)} | reserve ${money(car.reserve)} | ${car.steps} steps -> ${plan.length} bids`,
    );
    log(
      `  plan: ${plan.map((b) => `${b.device} +${b.increase}`).join(', ')} -> bid ${money(car.start + car.steps * car.inc)}`,
    );
    if (!GO) return;

    log('\n3. Devices');
    await androidEnsureUser(aUser);
    log(`  Android signed in as ${aUser.name}`);
    ios = await iosSession();
    await iosEnsureUser(ios, iUser);
    log(`  iOS signed in as ${iUser.name}`);

    log('\n4. Auction');
    if (car.source === 'Pricing Done') await moveToUpcoming(page, car);
    const auction = await createLiveAuction(
      page,
      car,
      car.source === 'Failed' ? 'Failed' : 'Upcoming',
    );
    log(
      `  "${auction.title}" item ${auction.itemId} | ${clock(auction.start)} -> ${clock(auction.end)}`,
    );
    state.usedVins.push(car.vin);
    const run = {
      at: new Date().toISOString(),
      vin: car.vin,
      itemId: auction.itemId,
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
      KEEP_AUTO_EXTEND ? Promise.resolve('kept') : autoExtendOff(aePage, car.vin),
      androidOpenCar(appTitle),
      iosOpenCar(ios, appTitle),
    ]);
    log(`  car open on both devices | item Auto Extend: ${ae}`);
    let placed = 0;
    for (const b of plan) {
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
    check(
      ae === 'OFF' || KEEP_AUTO_EXTEND,
      `item Auto Extend ${KEEP_AUTO_EXTEND ? 'kept' : 'turned OFF'} (${ae})`,
    );
    check(
      placed === plan.length,
      `all ${plan.length} bids placed alternately Android/iOS (${placed})`,
    );
    check(where === 'sold', `car went to Sold after the end (${where})`);
    if (where === 'sold') {
      await page.goto(
        '/backend/auction/sold/index?' +
          new URLSearchParams({ 'SoldListViewSearch[vin_number]': car.vin }),
      );
      const t = (await page.locator('tbody tr[data-key]').first().innerText()).replace(/\s+/g, ' ');
      const g = (re) => (t.match(re) || [])[1] || '?';
      const highest = num(g(/Highest Price ([\d,]+)/));
      const lastBidder = plan.length % 2 ? aUser : iUser;
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
        namesOf(lastBidder).includes(g(/Name (.+?) Title/)),
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
