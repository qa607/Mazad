#!/usr/bin/env node
/* global process, console, URL, URLSearchParams, fetch, setTimeout, structuredClone */
/**
 * Buy Now run on staging (stg-154): every run uses a NEW car and a FREE user, buys on the app, then checks the
 * back office.
 *
 *   TEST_ENV=stg-154 node scripts/buy-now-run.mjs [--platform android|ios|both] [--go] [--fail-held-sales]
 *
 * - Default is a DRY RUN: prints which user and car each platform would get and changes nothing.
 * - --go executes: prepares the car (Buy Now price above reserve, Upcoming, a QA-AUTO auction so it shows in
 *   Awaiting) when no unused Buy Now car is ready, buys it in the app, verifies the Sold row.
 * - --ui-only: only checks, as a guest, that every unused Buy Now car shows on the customer WEBSITE (Upcoming
 *   Auctions listing and /en/car/<id>: title, VIN, price, buy_now data, "Get the App"). Add --app to also check the
 *   Android/iOS apps (Upcoming > Cars and the car page). No sign-in, no purchase, no change.
 * - Every purchase also checks the UI: the website before buying, the app car page, and Bids > Won after it.
 * - --user <id[,id]>: buy with these accounts (in --platform order) instead of the automatic rotation, e.g.
 *   --user 1331 for the Dealer.
 * - --push <n>: only puts n NEW Pricing Done cars in Awaiting with Buy Now (above reserve) and checks the
 *   website listing for each. No sign-in, no purchase.
 * - --role individual|dealer: which kind of test account the rotation uses (default individual).
 * - --fail-held-sales: when every candidate user is on hold, marks that user's QA-AUTO Buy Now sale (Waiting
 *   Transfer) Failed with Penalty 0 and Block User off, which frees the account. Off unless given.
 *
 * Users: the verified + deposit test Individuals below; credentials come from .env only (<prefix>_PHONE /
 * <prefix>_PASSWORD) and are never printed. A purchase puts the buyer on hold shortly after, so a user is only
 * picked when not on hold, preferring the least recently used one.
 * Cars: an Upcoming car with buy_now=true whose VIN was never used by this script; otherwise the next Pricing Done
 * car of a test supplier (شركة تجريبية-<n>). Used VINs and purchases are kept in reports/buy-now/state.json.
 * Back office: the saved Dev Root session (.auth/dev-root.json). Android: emulator via adb (ANDROID_UDID, default
 * emulator-5554). iOS: physical device via Appium + WebDriverAgent (IOS_UDID, IOS_WDA_URL).
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
const GO = argv.includes('--go');
const FAIL_HELD = argv.includes('--fail-held-sales');
const UI_ONLY = argv.includes('--ui-only');
const APP_TOO = argv.includes('--app');
const PUSH = argv.includes('--push') ? Number(argv[argv.indexOf('--push') + 1]) || 1 : 0;
const platformArg = argv.includes('--platform') ? argv[argv.indexOf('--platform') + 1] : 'both';
const PLATFORMS = platformArg === 'both' ? ['android', 'ios'] : [platformArg];
if (!PLATFORMS.every((p) => p === 'android' || p === 'ios'))
  throw new Error(`--platform must be android, ios or both`);

const ENV_ID = process.env.TEST_ENV;
if (ENV_ID !== 'stg-154')
  throw new Error('Run with TEST_ENV=stg-154 (the only environment this script is set up for).');
const BASE = new URL(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'config/environments', `${ENV_ID}.json`), 'utf8'))
    .baseURL,
).origin;
if (!/^https:\/\/stg-/.test(BASE)) throw new Error(`Refusing ${BASE}: not a staging URL.`);

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
 * Test buyers with a deposit (back-office type, ID and display names; credentials in .env). The rotation uses the
 * accounts of --role (individual by default, or dealer); --user <id> picks accounts explicitly.
 */
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
/** Every name an account can be shown with (English, Arabic). */
const namesOf = (u) => [u.name, ...(u.alt || [])];
const ROLE = argv.includes('--role') ? argv[argv.indexOf('--role') + 1] : 'individual';
if (!['individual', 'dealer'].includes(ROLE))
  throw new Error('--role must be individual or dealer');
const USER_IDS = argv.includes('--user') ? argv[argv.indexOf('--user') + 1].split(',') : null;
const TEST_SUPPLIER = /شركة تجريبية-\d+/;
const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;

// ---------- state (used cars and purchases) ----------
const STATE_FILE = path.join(ROOT, 'reports/buy-now/state.json');
const SEED = {
  // Cars already bought or failed by hand on 2026-11-13, before this script existed.
  usedVins: [
    'WDB9340135L367218',
    'WDB9340135L795777',
    'JTNB24HK9R3178304',
    'JTNB24HK9P3145820',
    'KMHD741C2LU037055',
  ],
  purchases: [
    {
      at: '2026-11-13T11:42:50+03:00',
      platform: 'android',
      userId: '5450',
      vin: 'KMHD741C2LU037055',
    },
    { at: '2026-11-13T11:45:17+03:00', platform: 'ios', userId: '3038', vin: 'JTNB24HK9P3145820' },
  ],
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
const lastUsedAt = (state, userId) =>
  state.purchases
    .filter((p) => p.userId === userId)
    .map((p) => p.at)
    .sort()
    .pop() || '';

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const money = (v) => Number(v).toLocaleString('en-US');
const log = (...a) => console.log(...a);

// ---------- back office ----------
async function openBackOffice() {
  const browser = await chromium.launch();
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
  return { browser, page };
}

async function isHeld(page, user) {
  await page.goto(`/backend/users/${user.type}/update?id=${user.id}`);
  const name = (await page.locator('input[name="Admin[name_en]"]').inputValue()).trim();
  if (name !== user.name)
    throw new Error(`Individual ${user.id} is "${name}", expected "${user.name}".`);
  return page.locator('input[type=checkbox][name="Admin[is_hold]"]').isChecked();
}

/** Marks one Sold row Failed: reason "Cancellation upon request by the customer", Penalty 0, Block User off. */
async function markSaleFailed(page, vin, user) {
  const buyer = user.name;
  await page.goto(
    '/backend/auction/sold/index?' + new URLSearchParams({ 'SoldListViewSearch[vin_number]': vin }),
  );
  const row = page.locator('tbody tr[data-key]').filter({ hasText: vin });
  const text = (await row.innerText()).replace(/\s+/g, ' ');
  if (
    !text.includes('Waiting Transfer') ||
    !text.includes('Type Buy Now') ||
    !namesOf(user).some((n) => text.includes(`Name ${n} Title`))
  ) {
    throw new Error(`Sold row of ${vin} is not a Waiting Transfer Buy Now sale to ${buyer}.`);
  }
  await row.locator('a.failed-btn').first().click();
  const modal = page
    .locator('.modal.show')
    .filter({ has: page.locator('#remaininginsuranceamount-remaining_insurance_amount') });
  await modal.waitFor();
  const reason = modal
    .locator('label')
    .filter({ hasText: 'Cancellation upon request by the customer' })
    .first();
  await reason.click();
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

/** QA-AUTO Buy Now sales (Waiting Transfer) of a buyer on the first Sold pages, newest first. */
async function openSalesOf(page, user) {
  const vins = [];
  for (let n = 1; n <= 3; n++) {
    await page.goto(`/backend/auction/sold/index?page=${n}`);
    const rows = await page
      .locator('tbody tr[data-key]')
      .evaluateAll((rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
    for (const t of rows) {
      if (
        namesOf(user).some((n) => t.includes(`Name ${n} Title`)) &&
        t.includes('Waiting Transfer') &&
        t.includes('Type Buy Now') &&
        t.includes('QA-AUTO')
      ) {
        const vin = (t.match(VIN_RE) || [])[0];
        if (vin) vins.push(vin);
      }
    }
  }
  return vins;
}

async function pickUsers(page, state, count) {
  const candidates = USER_IDS
    ? USER_IDS.map((id) => {
        const u = USERS.find((x) => x.id === id);
        if (!u)
          throw new Error(
            `--user ${id} is not a known test account (${USERS.map((x) => x.id).join(', ')}).`,
          );
        return u;
      })
    : USERS.filter((u) => u.type === ROLE);
  const ordered = USER_IDS
    ? candidates
    : candidates.sort((a, b) => lastUsedAt(state, a.id).localeCompare(lastUsedAt(state, b.id)));
  const free = [];
  const held = [];
  for (const u of ordered) {
    if (!DOTENV[`${u.prefix}_PHONE`] || !DOTENV[`${u.prefix}_PASSWORD`]) {
      log(`  user ${u.name}: no credentials in .env, skipped`);
      continue;
    }
    ((await isHeld(page, u)) ? held : free).push(u);
  }
  log(
    `  users free: ${free.map((u) => u.name).join(', ') || 'none'} | on hold: ${held.map((u) => u.name).join(', ') || 'none'}`,
  );
  while (free.length < count && held.length) {
    const u = held.shift();
    if (!FAIL_HELD) {
      log(`  ${u.name} is on hold; rerun with --fail-held-sales to free it`);
      continue;
    }
    const vins = await openSalesOf(page, u);
    log(
      `  ${u.name}: open Buy Now sale(s) ${vins.join(', ') || 'none found'}${GO ? ' -> Failed' : ' (would be marked Failed)'}`,
    );
    if (!GO) {
      free.push(u);
      continue;
    }
    for (const v of vins) await markSaleFailed(page, v, u);
    if (!(await isHeld(page, u))) free.push(u);
    else log(`  ${u.name} is still on hold after failing its sales`);
  }
  if (free.length < count) throw new Error(`Need ${count} free user(s), found ${free.length}.`);
  return free.slice(0, count);
}

async function apiUpcoming() {
  const res = await fetch(`${BASE}/api/v1/auction/list?section=home&tabs=upcoming`, {
    headers: {
      'x-app-name': 'mazad',
      'x-device-type': 'android',
      'x-app-version': '8.2.2-stage',
      lang: 'en',
      'device-id': 'qa-automation-buy-now-run',
    },
  });
  return (await res.json()).data.auction_list.data;
}

/** Full VIN of an upcoming auction item, from the back-office Awaiting list. */
async function awaitingVin(page, itemId) {
  // The Create Auction wizard can still be redirecting when this runs: retry an interrupted navigation.
  for (let i = 0; ; i++) {
    try {
      await page.goto('/backend/auction/awaiting/index');
      break;
    } catch (e) {
      if (i >= 2 || !/ERR_ABORTED|interrupted/.test(e.message)) throw e;
      await page.waitForLoadState('load').catch(() => {});
    }
  }
  const row = page.locator(`tbody tr[data-key="${itemId}"]`);
  if (!(await row.count())) return null;
  return ((await row.innerText()).match(VIN_RE) || [])[0] || null;
}

async function readyCars(page, state) {
  const cars = [];
  for (const a of await apiUpcoming()) {
    if (!a.price_object?.buy_now) continue;
    const vin = await awaitingVin(page, a.id);
    if (vin && !state.usedVins.includes(vin)) {
      cars.push({
        itemId: String(a.id),
        vin,
        title: a.auction_title,
        mileage: a.mileage,
        total: money(a.price_object.price_value),
        buyNowPrice: String(a.price_object.buy_now_price),
      });
    }
  }
  return cars;
}

/**
 * Customer website, as a GUEST (own context, no back-office session): the car shows in Browse Auctions >
 * Live & Upcoming Auctions > Upcoming Auctions inside its auction (title and price), and its page /en/car/<id>
 * shows the title, the VIN's last 4 digits, Price = expected total, the "Get the App" button, and carries
 * buy_now = true with the expected Buy Now price. The website itself has no Buy Now button.
 * Writes to the Mazad server are blocked; Firebase/Firestore requests are allowed because the site loads its
 * auction lists through them (blocking them makes the lists show "No upcoming auctions").
 */
async function webUiCheck(browser, car) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/*', (r) =>
    ['GET', 'HEAD'].includes(r.request().method()) || !r.request().url().startsWith(BASE)
      ? r.continue()
      : r.abort(),
  );
  const page = await ctx.newPage();
  const checks = [];
  try {
    // 1. Listing: Upcoming Auctions tab -> the upcoming auction holding the car. The tab ignores clicks made
    //    before the page has hydrated, so it is clicked until it becomes active (URL ?tab=upcoming).
    await page.goto('/en/live-auctions/', { waitUntil: 'load' });
    const tab = page.getByRole('button', { name: 'Upcoming Auctions', exact: true }).first();
    const upcomingLinks = page.locator('a[href*="/live-auctions/at-"]:visible');
    for (let i = 0; i < 6 && !/active/.test((await tab.getAttribute('class')) || ''); i++) {
      await tab.click();
      await page.waitForTimeout(1500);
    }
    const tabActive = /active/.test((await tab.getAttribute('class')) || '');
    await upcomingLinks
      .first()
      .or(page.getByText('No upcoming auctions'))
      .waitFor({ timeout: 8000 })
      .catch(() => {});
    const auctions = await upcomingLinks.evaluateAll((as) => [
      ...new Set(as.map((a) => a.getAttribute('href'))),
    ]);
    if (process.env.WEB_DEBUG) log(`    debug: upcoming auction links ${JSON.stringify(auctions)}`);
    checks.push([tabActive, 'Upcoming Auctions tab opens']);
    let found = null;
    for (const href of auctions.slice(0, 15)) {
      await page.goto(href, { waitUntil: 'load' });
      const link = page.locator(`a[href*="/car/${car.itemId}"]`).first();
      await link.waitFor({ timeout: 6000 }).catch(() => {});
      if (await link.count()) {
        found = { href, cardText: norm(await page.locator('body').innerText()) };
        break;
      }
    }
    checks.push([
      Boolean(found),
      `listed under Live & Upcoming Auctions > Upcoming Auctions${found ? ` (${found.href})` : ''}`,
    ]);
    if (found) {
      checks.push(
        [found.cardText.includes(norm(car.title)), 'auction page shows the title'],
        [found.cardText.includes(car.total), `auction page shows ${car.total}`],
        [found.cardText.includes('Buy Now'), 'auction page shows "Buy Now"'],
      );
    }
    // 2. Car page.
    await page.goto(`/en/car/${car.itemId}`, { waitUntil: 'load' });
    await page
      .locator('text=Price')
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => {});
    const body = norm(await page.locator('body').innerText());
    const html = await page.content();
    const json = (k) => (html.match(new RegExp(`"${k}":("[^"]*"|[^,}]*)`)) || [])[1] || '?';
    checks.push(
      [body.includes(norm(car.title)), `car page /en/car/${car.itemId} shows the title`],
      [body.includes(car.vin.slice(-4)), `car page shows VIN …${car.vin.slice(-4)}`],
      [/Price/.test(body) && body.includes(car.total), `car page shows Price ${car.total}`],
      [json('buy_now') === 'true', `car page data buy_now = true (${json('buy_now')})`],
      [
        json('buy_now_price').replace(/"/g, '') === car.buyNowPrice,
        `car page data buy_now_price = ${car.buyNowPrice} (${json('buy_now_price')})`,
      ],
      [
        await page.getByText('Get the App', { exact: true }).first().isVisible(),
        'car page shows "Get the App" (buying happens in the app)',
      ],
    );
  } finally {
    await ctx.close();
  }
  return reportUi('web', checks);
}

/** Next Pricing Done car of a test supplier that this script never used. */
async function nextPricingDoneCar(page, state) {
  await page.goto('/backend/auction/pricing-done/index');
  const rows = await page
    .locator('tbody tr[data-key]')
    .evaluateAll((rs) =>
      rs.map((r) => ({ id: r.getAttribute('data-key'), text: r.innerText.replace(/\s+/g, ' ') })),
    );
  for (const r of rows) {
    const vin = (r.text.match(VIN_RE) || [])[0];
    const supplier = (r.text.match(TEST_SUPPLIER) || [])[0];
    if (!vin || !supplier || state.usedVins.includes(vin)) continue;
    await page.goto(`/backend/vehicle/pricing/update?id=${r.id}`);
    const f = page.locator('form#w0');
    const num = async (sel) =>
      Number(
        (
          await f
            .locator(sel)
            .inputValue()
            .catch(() => '0')
        ).replace(/,/g, ''),
      ) || 0;
    const floor = Math.max(
      await num('#reserve_price'),
      await num('#supplier_price'),
      await num('#pricing-starting_price'),
    );
    if (!floor) continue;
    return {
      vehicleId: r.id,
      vin,
      supplier,
      title: r.text.split(' Vehicle ')[1]?.split(VIN_RE)[0]?.trim(),
      buyNow: Math.ceil((floor + 1000) / 1000) * 1000,
    };
  }
  return null;
}

async function prepareCar(page, car) {
  // 1. Buy Now price + "Show Buy Now?" (styled checkbox: its label is clicked).
  await page.goto(`/backend/vehicle/pricing/update?id=${car.vehicleId}`);
  const f = page.locator('form#w0');
  await f.locator('#pricing-buy_now_price').fill(String(car.buyNow));
  if (!(await f.locator('#pricing-enabled_buy_now').isChecked()))
    await f.locator('label[for="pricing-enabled_buy_now"]').click();
  if (!(await f.locator('#pricing-enabled_buy_now').isChecked()))
    throw new Error('Show Buy Now did not turn on.');
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/vehicle/pricing/update'),
    ),
    f.locator('button[type="submit"]', { hasText: 'Save' }).click(),
  ]);
  // 2. Pricing Done -> Upcoming.
  await page.goto(
    '/backend/auction/pricing-done/index?' +
      new URLSearchParams({ 'PricingDoneSearch[vin_number]': car.vin }),
  );
  await page.locator(`tbody tr[data-key="${car.vehicleId}"] input.checkbox-row`).check();
  await page.locator('a.upcoming-multi-btn').first().click();
  const confirm = page.locator('#modal-m #confirm-modal');
  await confirm.waitFor();
  await Promise.all([
    page.waitForLoadState('load'),
    confirm.locator('button[type="submit"]').click(),
  ]);
  // 3. A QA-AUTO auction holding the car (Create Auction wizard, Car Source: Upcoming) -> Awaiting.
  await page.goto('/backend/auction/upcoming/create');
  const form = page.locator('#create-auction-form');
  await form.locator('#auction-type-select').selectOption({ label: 'Normal Auction' });
  await form.locator('#supplier-select + .select2 .select2-selection').click();
  await page
    .locator('.select2-container--open .select2-results__option')
    .filter({ hasText: new RegExp(`^\\s*${car.supplier}\\s*$`) })
    .click();
  car.auctionTitle = `QA-AUTO Buy Now ${crypto.randomInt(1e7, 1e8)}`;
  await form.locator('#auction-title').fill(car.auctionTitle);
  for (const [sel, day] of [
    ['#auction-start_item_date', 10],
    ['#auction-end_item_date', 11],
  ]) {
    await form.locator(sel).click();
    const cal = page.locator('.datepicker-dropdown:visible .datepicker-days');
    for (let m = 0; m < 2; m++) await cal.locator('th.next').click();
    await cal.locator('td.day:not(.old):not(.new)', { hasText: new RegExp(`^${day}$`) }).click();
  }
  const back = form.getByRole('button', { name: /Back to Configuration/ });
  for (let i = 1; i <= 3 && !(await back.isVisible()); i++) {
    const next = form.getByRole('button', { name: /Next: Select Cars/ });
    if (await next.isVisible()) await next.click();
    await back.waitFor({ timeout: 4000 }).catch(() => {});
  }
  const step2 = form.locator('#step-2');
  const source = step2
    .locator('label:has(input[name="status_filter"])')
    .filter({ hasText: 'Upcoming' });
  if (!(await source.locator('input').isChecked())) await source.click();
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
  // The success alert is followed by a redirect; let it finish before the next navigation.
  await page.waitForLoadState('load').catch(() => {});
}

async function verifySold(page, car, user) {
  await page.goto(
    '/backend/auction/sold/index?' +
      new URLSearchParams({ 'SoldListViewSearch[vin_number]': car.vin }),
  );
  const rows = await page
    .locator('tbody tr[data-key]')
    .evaluateAll((rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
  const t = rows[0] || '';
  const g = (re) => (t.match(re) || [])[1] || '?';
  const checks = [
    [rows.length === 1, `one Sold row (${rows.length})`],
    [
      g(/Status (.+?) Type/) === 'Waiting Transfer',
      `Status Waiting Transfer (${g(/Status (.+?) Type/)})`,
    ],
    [/Type Buy Now/.test(t), 'Type Buy Now'],
    [
      namesOf(user).includes(g(/Name (.+?) Title/)),
      `Buyer ${user.name} (${g(/Name (.+?) Title/)})`,
    ],
    [
      g(/Sale Price ([\d,]+)/) === car.total,
      `Sale Price ${car.total} (${g(/Sale Price ([\d,]+)/)})`,
    ],
  ];
  for (const [ok, label] of checks) log(`    ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  return {
    ok: checks.every(([ok]) => ok),
    soldId: g(/ID (\d+)/),
    saleDate: g(/Sale Date ([\d-]+ [\d:]+)/),
  };
}

// ---------- Android (adb) ----------
const SERIAL = env('ANDROID_UDID', 'emulator-5554');
const PKG = 'com.app.motory.dealer.staging';
const adb = (...a) =>
  execFileSync('adb', ['-s', SERIAL, ...a], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
async function screen() {
  for (let i = 0; i < 3; i++) {
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
      const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
      return [...xml.matchAll(/<node [^>]*?>/g)].map(([a]) => {
        const g = (k) => (a.match(new RegExp(` ${k}="([^"]*)"`)) || [])[1] || '';
        const b = (g('bounds').match(/\d+/g) || [0, 0, 0, 0]).map(Number);
        return {
          text: decode(g('text')),
          id: g('resource-id').split('/').pop(),
          x: (b[0] + b[2]) >> 1,
          y: (b[1] + b[3]) >> 1,
        };
      });
    } catch {
      await sleep(1.5);
    }
  }
  throw new Error('uiautomator dump failed');
}
/** Text without direction marks (the apps wrap Arabic-containing titles in them) and with single spaces. */
const norm = (s) =>
  String(s)
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const findText = (nodes, t) => nodes.find((n) => norm(n.text) === norm(t));
const findId = (nodes, id) => nodes.find((n) => n.id === id);
const tap = (n) => adb('shell', 'input', 'tap', String(n.x), String(n.y));
const typeText = (s) => adb('shell', 'input', 'text', s.replace(/ /g, '%s'));

async function androidOpenMore() {
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  // Start-up time varies (splash, Firestore, a "Technical Error" dialog): wait up to ~30 s for the More tab.
  await sleep(6);
  let s = await screen();
  for (let i = 0; i < 12 && !findId(s, 'item_menu_activity_main_bottom_navigation_more'); i++) {
    if (findText(s, 'Close')) tap(findText(s, 'Close'));
    await sleep(2);
    s = await screen();
  }
  if (findText(s, 'Close')) {
    tap(findText(s, 'Close'));
    await sleep(1);
    s = await screen();
  }
  const moreTab = findId(s, 'item_menu_activity_main_bottom_navigation_more');
  if (!moreTab) throw new Error('Android: the app did not reach its tab bar (More) after start-up');
  tap(moreTab);
  await sleep(3);
  s = await screen();
  if (findText(s, 'تسجيل الدخول/ إنشاء حساب') && findText(s, 'English')) {
    tap(findText(s, 'English'));
    await sleep(6);
    return androidOpenMore();
  }
  return s;
}

async function androidLogout() {
  let s = await androidOpenMore();
  if (findText(s, 'Login/ Create an account')) return;
  for (let i = 0; i < 3 && !findText(s, 'Log out'); i++) {
    adb('shell', 'input', 'swipe', '540', '1900', '540', '700', '400');
    await sleep(1.5);
    s = await screen();
  }
  tap(findText(s, 'Log out'));
  await sleep(2);
  tap(findText(await screen(), 'Log out'));
  await sleep(4);
}

/** Logs [ok, label] UI checks as PASS/FAIL lines and returns them. */
function reportUi(where, checks) {
  for (const [ok, label] of checks) log(`    ${ok ? 'PASS' : 'FAIL'}  UI ${where}: ${label}`);
  return checks;
}

/**
 * Android, from any screen of the app: Home > Upcoming Auctions > Cars, finds the car and opens it. Checks that
 * it is listed and that its page shows the title, Price = expected total, Auction Status "Buy Now" and the
 * "Buy it now" button. Returns the checks and the "Buy it now" node (if shown).
 */
async function androidOpenCar(car) {
  // A user's first visit on a device shows onboarding tips ("... Tab", "Ok"): close them first.
  let tips = await screen();
  for (let i = 0; i < 6 && findText(tips, 'Ok'); i++) {
    tap(findText(tips, 'Ok'));
    await sleep(1.5);
    tips = await screen();
  }
  tap(findId(tips, 'item_menu_activity_main_bottom_navigation_home'));
  await sleep(3);
  tap(findText(await screen(), 'Upcoming Auctions'));
  await sleep(4);
  tap(findText(await screen(), 'Cars'));
  await sleep(5);
  let card;
  for (let i = 0; i < 8 && !card; i++) {
    card = findText(await screen(), car.title);
    if (!card) {
      adb('shell', 'input', 'swipe', '540', '1900', '540', '900', '400');
      await sleep(2);
    }
  }
  const checks = [[Boolean(card), `"${car.title}" listed under Upcoming Auctions > Cars`]];
  if (!card) return { checks: reportUi('android', checks), buy: null };
  tap(card);
  await sleep(6);
  const s = await screen();
  const buy = findText(s, 'Buy it now');
  checks.push(
    [Boolean(findText(s, car.title)), 'car page shows the title'],
    [Boolean(findText(s, car.total)), `car page shows Price ${car.total}`],
    [Boolean(findText(s, 'Buy Now')), 'car page shows Auction Status "Buy Now"'],
    [Boolean(buy), 'car page shows the "Buy it now" button'],
  );
  return { checks: reportUi('android', checks), buy };
}

/** Android, signed in: Bids > Won shows the bought car with its price and "You won this auction". */
async function androidCheckWon(car) {
  // After the purchase the app stays on the car page (no bottom bar): go Back until the tabs show.
  let nav = await screen();
  for (let i = 0; i < 4 && !findText(nav, 'Bids'); i++) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(2);
    nav = await screen();
  }
  if (!findText(nav, 'Bids'))
    throw new Error('Android: bottom bar (Bids) not found after the purchase');
  tap(findText(nav, 'Bids'));
  await sleep(4);
  tap(findText(await screen(), 'Won'));
  await sleep(5);
  const s = await screen();
  return reportUi('android', [
    [Boolean(findText(s, car.title)), `Bids > Won lists "${car.title}"`],
    [Boolean(findText(s, car.total)), `Bids > Won shows ${car.total}`],
    [Boolean(findText(s, 'You won this auction')), 'Bids > Won shows "You won this auction"'],
  ]);
}

/** Android, as whoever is signed in (or a guest): the car shows in the app with Buy Now. */
async function androidUiCheck(car) {
  await androidOpenMore();
  return (await androidOpenCar(car)).checks;
}

async function androidBuy(user, car) {
  let s = await androidOpenMore();
  if (!findText(s, 'Login/ Create an account') && !namesOf(user).some((n) => findText(s, n))) {
    await androidLogout();
    s = await androidOpenMore();
  }
  if (findText(s, 'Login/ Create an account')) {
    tap(findText(s, 'Login/ Create an account'));
    await sleep(2);
    tap(findText(await screen(), 'Log In'));
    await sleep(3);
    s = await screen();
    tap(findId(s, 'edit_text_phone_number'));
    await sleep(0.7);
    typeText(DOTENV[`${user.prefix}_PHONE`]);
    await sleep(0.7);
    tap(findId(s, 'edit_text_password'));
    await sleep(0.7);
    typeText(DOTENV[`${user.prefix}_PASSWORD`]);
    await sleep(0.7);
    if (adb('shell', 'dumpsys input_method | grep -c mInputShown=true || true').trim() !== '0')
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(1);
    tap(findId(await screen(), 'button_login'));
    await sleep(6);
    s = await screen();
    if (findId(s, 'textview_accept_terms_button')) {
      tap(findId(s, 'textview_accept_terms_button'));
      await sleep(4);
      s = await screen();
    }
    if (findText(s, 'Not Now')) {
      tap(findText(s, 'Not Now'));
      await sleep(3);
      s = await screen();
    }
  }
  if (!namesOf(user).some((n) => findText(s, n)))
    throw new Error(`Android: not signed in as ${user.name}`);
  const { checks: ui, buy } = await androidOpenCar(car);
  if (!buy) throw new Error('Android: the car page has no "Buy it now" button');
  tap(buy);
  await sleep(4);
  s = await screen();
  if (s.some((n) => n.text.startsWith('Sorry, you cannot participate')))
    throw new Error('Android: account cannot participate (on hold?)');
  if (!findText(s, car.total) || !findText(s, 'Confirm Purchase'))
    throw new Error(`Android: purchase sheet does not show Total ${car.total}`);
  adb('logcat', '-c');
  tap(findText(s, 'Confirm Purchase'));
  await sleep(6);
  const status =
    (adb('logcat', '-d', '-s', 'OkHttp').match(/<-- (\d{3})[^\n]*\/api\/v1\/auction\/buy-now/) ||
      [])[1] || 'not logged';
  s = await screen();
  const congrats = s.some((n) => n.text.startsWith('Congrats'));
  if (findText(s, 'Close')) tap(findText(s, 'Close'));
  await sleep(2);
  if (congrats)
    ui.push(
      ...(await androidCheckWon(car).catch((e) =>
        reportUi('android', [[false, `Bids > Won check: ${e.message}`]]),
      )),
    );
  await androidLogout();
  if (!congrats) throw new Error(`Android: no Congrats after Confirm Purchase (buy-now ${status})`);
  return { outcome: `buy-now ${status}, Congrats`, ui };
}

// ---------- iOS (Appium + WebDriverAgent) ----------
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
      'appium:newCommandTimeout': 600,
      'appium:webDriverAgentUrl': wda,
    },
  });
  const q = (s) => JSON.stringify(s);
  const ios = {
    d,
    button: (label) =>
      d.$(`-ios predicate string:type == "XCUIElementTypeButton" AND label == ${q(label)}`),
    any: (label) => d.$(`-ios predicate string:label == ${q(label)} OR name == ${q(label)}`),
    source: () => d.getPageSource(),
    restart: async () => {
      await d.execute('mobile: terminateApp', { bundleId: 'com.motory.dealer' });
      await d.execute('mobile: launchApp', { bundleId: 'com.motory.dealer' });
      await d.pause(9000);
    },
  };
  // A user's first visit on a device shows onboarding tips ("... Tab" + "Ok") over any tab; they hide the
  // screen underneath, so they are closed around every tab change.
  ios.closeTips = async () => {
    for (let i = 0; i < 6; i++) {
      const ok = await ios.button('Ok');
      if (!(await ok.isExisting())) return;
      await ok.click();
      await d.pause(1500);
    }
  };
  ios.more = async () => {
    await ios.closeTips();
    await (await ios.button('More')).click();
    await d.pause(2000);
    await ios.closeTips();
  };
  ios.logout = async () => {
    await ios.more();
    if ((await ios.source()).includes('Login/ Create an account')) return;
    await d.execute('mobile: swipe', { direction: 'up' });
    await d.pause(1500);
    await (await ios.button('Log out')).click();
    await d.pause(1500);
    // The confirmation's "Log out" is the topmost of the two buttons with that label.
    let top = null;
    for (const b of await d.$$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Log out"',
    )) {
      const r = JSON.parse(await b.getAttribute('rect'));
      if (!top || r.y < top.y) top = { b, y: r.y };
    }
    await top.b.click();
    await d.pause(3000);
  };
  return ios;
}

/**
 * iOS: Home > Upcoming Auctions > Cars, finds the car card and opens it. Checks the card (title, Price = expected
 * total, Auction Status "Buy Now") and the car page (Price, "Buy Now", "Buy it now" button).
 */
async function iosOpenCar(ios, car) {
  const { d } = ios;
  await ios.closeTips();
  await (await ios.button('Home')).click();
  await d.pause(2000);
  await ios.closeTips();
  await (await ios.any('Upcoming Auctions')).click();
  await d.pause(3000);
  for (const b of await d.$$(
    '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Cars"',
  )) {
    if (JSON.parse(await b.getAttribute('rect')).x >= 0) {
      await b.click();
      break;
    }
  }
  await d.pause(4000);
  // Car cards are buttons whose label reads "<city>, <km>, <usage>, <title>, <timer>, Price, <n>, Riyal, ...".
  let card = null;
  let label = '';
  for (let i = 0; i < 8 && !card; i++) {
    for (const b of await d.$$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS "Auction Status"',
    )) {
      const l = await b.getAttribute('label');
      if (norm(l).includes(norm(car.title))) {
        card = b;
        label = norm(l);
        break;
      }
    }
    if (!card) {
      await d.execute('mobile: swipe', { direction: 'up' });
      await d.pause(1500);
    }
  }
  const listed = Boolean(card);
  const checks = [[listed, `"${car.title}" listed under Upcoming Auctions > Cars`]];
  if (!listed) return { checks: reportUi('ios', checks), buyShown: false };
  checks.push(
    [label.includes(`Price, ${car.total}`), `card shows Price ${car.total}`],
    [label.includes('Auction Status, Buy Now'), 'card shows Auction Status "Buy Now"'],
  );
  await card.click();
  await d.pause(5000);
  const src = await ios.source();
  const buyShown = await (await ios.button('Buy it now')).isExisting();
  checks.push(
    [src.includes(`name="${car.total}"`), `car page shows Price ${car.total}`],
    [src.includes('name="Buy Now"'), 'car page shows Auction Status "Buy Now"'],
    [buyShown, 'car page shows the "Buy it now" button'],
  );
  return { checks: reportUi('ios', checks), buyShown };
}

/** iOS, signed in: Bids > Won shows the bought car with its price and "You won this auction". */
async function iosCheckWon(ios, car) {
  // After the purchase the app stays on the car page (no tab bar): go Back until the tabs show.
  for (let i = 0; i < 4 && !(await (await ios.button('Bids')).isExisting()); i++) {
    const back = await ios.button('navigationBarBack');
    if (await back.isExisting()) await back.click();
    else await ios.d.execute('mobile: tap', { x: 32, y: 60 });
    await ios.d.pause(2000);
  }
  await (await ios.button('Bids')).click();
  await ios.d.pause(3000);
  await ios.closeTips();
  await (await ios.any('Won')).click();
  await ios.d.pause(4000);
  const src = await ios.source();
  return reportUi('ios', [
    [norm(src).includes(`name="${norm(car.title)}"`), `Bids > Won lists "${car.title}"`],
    [src.includes(`name="${car.total}"`), `Bids > Won shows ${car.total}`],
    [src.includes('You won this auction'), 'Bids > Won shows "You won this auction"'],
  ]);
}

/** iOS, as whoever is signed in (or a guest): the car shows in the app with Buy Now. */
async function iosUiCheck(car) {
  const ios = await iosSession();
  try {
    await ios.restart();
    return (await iosOpenCar(ios, car)).checks;
  } finally {
    await ios.d.deleteSession().catch(() => {});
  }
}

async function iosBuy(user, car) {
  const ios = await iosSession();
  const { d } = ios;
  try {
    await ios.restart();
    await ios.more();
    let src = await ios.source();
    if (
      !src.includes('Login/ Create an account') &&
      !namesOf(user).some((n) => src.includes(`name="${n}"`))
    ) {
      await ios.logout();
      await ios.more();
      src = await ios.source();
    }
    if (src.includes('Login/ Create an account')) {
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
      // The Log In button has no label: the wide unlabeled button right under the password field.
      const passY = JSON.parse(await pass.getAttribute('rect')).y;
      let login = null;
      // Its label is nil, which a predicate `label == ""` does not match, so every button is read.
      for (const b of await d.$$('-ios predicate string:type == "XCUIElementTypeButton"')) {
        if (await b.getAttribute('label')) continue;
        const r = JSON.parse(await b.getAttribute('rect'));
        if (r.y > passY && r.width > 200 && (!login || r.y < login.y)) login = { b, y: r.y };
      }
      if (!login) throw new Error('iOS: Log In button not found');
      await login.b.click();
      await d.pause(6000);
      src = await ios.source();
      if (src.includes('Accept &amp; Continue')) {
        await (await ios.any('Accept & Continue')).click();
        await d.pause(3000);
        src = await ios.source();
      }
    }
    if (!namesOf(user).some((n) => src.includes(`name="${n}"`)))
      throw new Error(`iOS: not signed in as ${user.name}`);
    const { checks: ui, buyShown } = await iosOpenCar(ios, car);
    if (!buyShown) throw new Error('iOS: the car page has no "Buy it now" button');
    await (await ios.button('Buy it now')).click();
    await d.pause(4000);
    src = await ios.source();
    if (src.includes('cannot participate'))
      throw new Error('iOS: account cannot participate (on hold?)');
    if (!src.includes(`name="${car.total}"`) || !src.includes('name="Confirm Purchase"'))
      throw new Error(`iOS: purchase sheet does not show Total ${car.total}`);
    await (await ios.button('Confirm Purchase')).click();
    await d.pause(5000);
    const congrats = (await ios.source()).includes('Congrats!');
    const close = await ios.button('Close');
    if (await close.isExisting()) await close.click();
    await d.pause(1500);
    if (congrats)
      ui.push(
        ...(await iosCheckWon(ios, car).catch((e) =>
          reportUi('ios', [[false, `Bids > Won check: ${e.message}`]]),
        )),
      );
    await ios.logout();
    if (!congrats) throw new Error('iOS: no Congrats after Confirm Purchase');
    return { outcome: 'Congrats', ui };
  } finally {
    await d.deleteSession().catch(() => {});
  }
}

// ---------- run ----------
const uiOk = (checks) => checks.every(([ok]) => ok);
const uiCount = (checks) => `${checks.filter(([ok]) => ok).length}/${checks.length} UI checks`;
function printSummary(results) {
  log('\nSummary');
  for (const r of results)
    log(
      `  ${r.ok ? 'PASS' : 'FAIL'} | ${r.platform} | ${r.user ? `${r.user} | ` : ''}${r.car} | ${r.vin} | ${r.total} | ${uiCount(r.ui)}${r.soldId ? ` | Sold ID ${r.soldId} at ${r.saleDate}` : ''}${r.error ? ` | ${r.error}` : ''}`,
    );
  if (GO && !UI_ONLY) log(`  state: ${path.relative(ROOT, STATE_FILE)}`);
  process.exitCode = results.length && results.every((r) => r.ok) ? 0 : 1;
}

(async () => {
  const mode = PUSH
    ? `PUSH ${PUSH} new car(s) to Awaiting with Buy Now (no purchase) + web listing check`
    : UI_ONLY
      ? `UI CHECK ONLY: web${APP_TOO ? ' + app' : ''} (no sign-in, no purchase, no change)`
      : GO
        ? 'EXECUTE'
        : 'DRY RUN (nothing is changed; add --go to execute)';
  log(`Buy Now run on ${BASE} | platforms: ${PLATFORMS.join(', ')} | ${mode}`);
  const state = loadState();
  const { browser, page } = await openBackOffice();
  const results = [];
  try {
    if (PUSH) {
      // Push only: new Pricing Done cars -> Buy Now + Upcoming + QA-AUTO auction (Awaiting). No sign-in, no
      // purchase. The cars stay unused, so the next --go run picks them up.
      const pushed = [];
      for (let n = 0; n < PUSH; n++) {
        const next = await nextPricingDoneCar(page, {
          usedVins: [...state.usedVins, ...pushed.map((c) => c.vin)],
        });
        if (!next)
          throw new Error('No unused Pricing Done car of a test supplier on the first page.');
        log(
          `\n${n + 1}. ${next.title} (${next.vin}, ${next.supplier}) -> Buy Now ${money(next.buyNow)}`,
        );
        await prepareCar(page, next);
        const ready = (await readyCars(page, state)).find((c) => c.vin === next.vin);
        if (!ready)
          throw new Error(
            `${next.vin} was prepared but the app API does not list it with Buy Now.`,
          );
        log(
          `   in Awaiting: "${next.auctionTitle}", app API buy_now = true, app total ${ready.total}`,
        );
        pushed.push(ready);
        const ui = await webUiCheck(browser, ready);
        results.push({
          platform: 'web',
          car: ready.title,
          vin: ready.vin,
          total: ready.total,
          ui,
          ok: uiOk(ui),
        });
      }
      printSummary(results);
      return;
    }
    if (UI_ONLY) {
      const cars = await readyCars(page, state);
      log(
        `\nUnused Buy Now cars in Upcoming/Awaiting: ${cars.map((c) => `${c.title} (${c.vin}, ${c.total})`).join(', ') || 'none'}`,
      );
      for (const platform of APP_TOO ? ['web', ...PLATFORMS] : ['web']) {
        for (const car of cars) {
          log(`\n${platform}: ${car.title}`);
          try {
            const ui =
              platform === 'web'
                ? await webUiCheck(browser, car)
                : platform === 'android'
                  ? await androidUiCheck(car)
                  : await iosUiCheck(car);
            results.push({
              platform,
              car: car.title,
              vin: car.vin,
              total: car.total,
              ui,
              ok: uiOk(ui),
            });
          } catch (e) {
            log(`  FAILED: ${e.message}`);
            results.push({
              platform,
              car: car.title,
              vin: car.vin,
              total: car.total,
              ui: [],
              ok: false,
              error: e.message,
            });
          }
        }
      }
      printSummary(results);
      return;
    }

    log('\n1. Users');
    const users = await pickUsers(page, state, PLATFORMS.length);

    log('\n2. Cars');
    const cars = await readyCars(page, state);
    log(
      `  unused Buy Now cars already in Upcoming/Awaiting: ${cars.map((c) => `${c.title} (${c.vin})`).join(', ') || 'none'}`,
    );
    while (cars.length < PLATFORMS.length) {
      const next = await nextPricingDoneCar(page, {
        usedVins: [...state.usedVins, ...cars.map((c) => c.vin)],
      });
      if (!next)
        throw new Error('No unused Pricing Done car of a test supplier on the first page.');
      log(
        `  new car from Pricing Done: ${next.title} (${next.vin}, ${next.supplier}) -> Buy Now ${money(next.buyNow)}${GO ? '' : ' (would be prepared)'}`,
      );
      if (!GO) {
        cars.push({ ...next, total: '(set when prepared)' });
        continue;
      }
      await prepareCar(page, next);
      const prepared = (await readyCars(page, state)).find((c) => c.vin === next.vin);
      if (!prepared)
        throw new Error(`${next.vin} was prepared but the app API does not list it with Buy Now.`);
      log(`  prepared: ${prepared.title} in "${next.auctionTitle}", app total ${prepared.total}`);
      cars.push(prepared);
    }

    log('\n3. Plan');
    PLATFORMS.forEach((p, i) =>
      log(
        `  ${p.padEnd(7)} | ${users[i].name.padEnd(22)} | ${cars[i].title} | VIN ${cars[i].vin} | total ${cars[i].total}`,
      ),
    );
    if (!GO) return;

    for (const [i, platform] of PLATFORMS.entries()) {
      const user = users[i];
      const car = cars[i];
      log(`\n4. ${platform}: ${user.name} buys ${car.title}`);
      if (await isHeld(page, user)) throw new Error(`${user.name} went on hold before buying.`);
      try {
        const web = await webUiCheck(browser, car);
        const { outcome, ui: appUi } =
          platform === 'android' ? await androidBuy(user, car) : await iosBuy(user, car);
        const ui = [...web, ...appUi];
        log(`  app: ${outcome}`);
        state.usedVins.push(car.vin);
        state.purchases.push({
          at: new Date().toISOString(),
          platform,
          userId: user.id,
          vin: car.vin,
        });
        saveState(state);
        log('  back office:');
        const sold = await verifySold(page, car, user);
        results.push({
          platform,
          user: user.name,
          car: car.title,
          vin: car.vin,
          total: car.total,
          ...sold,
          ui,
          ok: sold.ok && uiOk(ui),
        });
      } catch (e) {
        log(`  FAILED: ${e.message}`);
        results.push({
          platform,
          user: user.name,
          car: car.title,
          vin: car.vin,
          total: car.total,
          ui: [],
          ok: false,
          error: e.message,
        });
      }
    }
  } finally {
    await browser.close();
  }
  if (GO) printSummary(results);
})().catch((e) => {
  console.error(`STOPPED: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
});
