/* global process, console */
// Read-only comparison of the Mazad Backend Supplier List with ERPNext (Customer and Supplier).
//
// Every BE supplier is matched to its ERPNext records by Platform User ID (= BE supplier ID),
// then each field is compared. ERPNext Mazad customers that are not BE suppliers are sampled
// against the BE Dealer / Individual lists. Nothing is created, edited or deleted: the Backend
// is only browsed and ERPNext is only read through GET requests.
//
// Needs:
//   - .auth/dev-root.json  (run `npx playwright test --project=backend-setup` first)
//   - ERP_USER and ERP_PASSWORD in the local .env file
// Run: npm run erp:compare            Output: reports/erp-compare/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium, request } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'reports', 'erp-compare');
const BE_SESSION = path.join(ROOT, '.auth', 'dev-root.json');
const BE_URL = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config', 'environments', 'staging.json'), 'utf8'),
).baseURL;
const ERP_URL = 'https://erp-stg-fixed.motory.com';
const EXTRA_SAMPLE_SIZE = 30;

const env = fs.existsSync(path.join(ROOT, '.env'))
  ? dotenv.parse(fs.readFileSync(path.join(ROOT, '.env')))
  : {};

const norm = (v) => (v == null || v === '(not set)' ? '' : String(v)).replace(/\s+/g, ' ').trim();
const digits = (v) =>
  norm(v)
    .replace(/\D/g, '')
    .replace(/^(966|0)/, '');
const save = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));

/** Every supplier in the BE Supplier List, with its list columns and details-page fields. */
async function collectBackend(context) {
  const page = await context.newPage();
  const list = [];
  for (let n = 1; ; n++) {
    await page.goto(`${BE_URL}/backend/users/supplier/index?sort=id&page=${n}`);
    if (page.url().includes('/login')) {
      throw new Error('Backend session expired: run npx playwright test --project=backend-setup');
    }
    const headers = await page.$$eval('#default-id table thead tr:first-child th', (th) =>
      th.map((x) => x.textContent.trim()),
    );
    list.push(
      ...(await page.$$eval(
        '#default-id table tbody tr[data-key]',
        (rows, h) =>
          rows.map((r) =>
            Object.fromEntries(
              [...r.children].map((c, i) => [h[i], c.textContent.trim().replace(/\s+/g, ' ')]),
            ),
          ),
        headers,
      )),
    );
    if (!(await page.locator('#default-id .pagination li.next:not(.disabled)').count())) break;
  }
  for (const row of list) {
    await page.goto(`${BE_URL}/backend/users/supplier/view?id=${row.ID}`);
    row.details = await page.$$eval('label', (labels) => {
      const o = {};
      for (const l of labels) {
        const input = l.parentElement.querySelector('input, textarea');
        if (input && !(l.textContent.trim() in o)) o[l.textContent.trim()] = input.value.trim();
      }
      return o;
    });
  }
  await page.close();
  return list;
}

/** Logs in to ERPNext through its login form and returns the signed-in storage state. */
async function erpSession(browser) {
  if (!env.ERP_USER || !env.ERP_PASSWORD) {
    throw new Error('Add ERP_USER and ERP_PASSWORD to the local .env file.');
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(ERP_URL + '/');
  await page.locator('#login_email').fill(env.ERP_USER);
  await page.locator('#login_password').fill(env.ERP_PASSWORD);
  await page.locator('button.btn-login').filter({ visible: true }).first().click();
  await page.waitForURL((u) => !/^\/(login)?$/.test(u.pathname), { timeout: 60000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

/** All ERPNext Customer and Supplier records with Platform = Mazad (GET only). */
async function collectErp(state) {
  const api = await request.newContext({ baseURL: ERP_URL, storageState: state });
  const out = {};
  for (const doctype of ['Customer', 'Supplier']) {
    const res = await api.get(`/api/resource/${doctype}`, {
      params: {
        fields: JSON.stringify(['*']),
        filters: JSON.stringify([['platform', '=', 'Mazad']]),
        limit_page_length: '0',
      },
    });
    if (!res.ok()) throw new Error(`ERPNext ${doctype} list: HTTP ${res.status()}`);
    out[doctype] = (await res.json()).data;
  }
  await api.dispose();
  return out;
}

function compare(be, erp) {
  const report = { customer: [], supplier: [] };
  for (const s of be) {
    const d = s.details ?? {};
    const exp = {
      name: norm(d['Supplier Name']),
      crn: norm(d['Cr Number']),
      tax: norm(d['Tax ID']),
      email: norm(s.Email),
      phone: digits(s.Phone),
      disabled: s.Status === 'inactive' ? 1 : 0,
      address: ['Street', 'Building No', 'Additional No', 'District', 'Zip Code', 'City Name']
        .map((k) => [k, norm(d[k])])
        .filter(([, v]) => v),
    };
    for (const [key, doctype] of [
      ['customer', 'Customer'],
      ['supplier', 'Supplier'],
    ]) {
      const c = key === 'customer';
      const recs = erp[doctype].filter((r) => String(r.platform_user_id) === s.ID);
      const row = {
        id: s.ID,
        beName: s['English Name'],
        beStatus: s.Status,
        erpName: recs.map((r) => r.name).join(', ') || null,
        differences: [],
      };
      report[key].push(row);
      if (recs.length !== 1) {
        row.differences.push({
          field: 'record',
          be: '1 record',
          erp: recs.length ? `${recs.length} records` : 'missing',
        });
      }
      for (const r of recs) {
        const checks = [
          ['Name', exp.name, norm(c ? r.customer_name : r.supplier_name)],
          [
            'Arabic name',
            exp.name,
            norm(c ? r.zatca_customer_name_in_arabic : r.supplier_name_in_arabic),
          ],
          ['CR (ZATCA ID)', exp.crn, norm(c ? r.custom_buyer_id : r.supplier_id_number_for_zatca)],
          ['Tax ID', exp.tax, norm(r.tax_id)],
          ['Email', exp.email, norm(r.email_id)],
          ['Phone', exp.phone, digits(r.mobile_no || r.phone)],
          ['Disabled', String(exp.disabled), String(Number(r.disabled) || 0)],
          ['Group', 'Mazad', norm(c ? r.customer_group : r.supplier_group)],
        ];
        for (const [field, b, e] of checks) {
          if (b !== e) row.differences.push({ field, be: b || '(empty)', erp: e || '(empty)' });
        }
        const addr = norm(r.primary_address).toLowerCase();
        const missing = exp.address.filter(([, v]) => !addr.includes(v.toLowerCase()));
        if (missing.length) {
          row.differences.push({
            field: 'Address',
            be: exp.address.map(([k, v]) => `${k}=${v}`).join('; '),
            erp: `${norm(r.primary_address) || '(empty)'} [missing: ${missing.map(([k]) => k).join(', ')}]`,
          });
        }
        row.zatcaIdType = norm(c ? r.custom_buyer_id_type : r.supplier_id_type_for_zatca);
      }
    }
  }
  return report;
}

/** Samples ERPNext Mazad customers that are not BE suppliers against the BE user lists. */
async function sampleExtraCustomers(context, beIds, customers) {
  const extra = customers.filter((r) => !beIds.has(String(r.platform_user_id)));
  const step = Math.max(1, Math.floor(extra.length / EXTRA_SAMPLE_SIZE));
  const sample = extra.filter((_, i) => i % step === 0).slice(0, EXTRA_SAMPLE_SIZE);
  const page = await context.newPage();
  const result = [];
  for (const r of sample) {
    const found = [];
    for (const list of ['dealer', 'individual']) {
      const res = await page.goto(`${BE_URL}/backend/users/${list}/view?id=${r.platform_user_id}`);
      if (res?.status() === 200 && !page.url().includes('/login')) found.push(list);
    }
    result.push({
      id: String(r.platform_user_id),
      type: r.customer_type,
      name: r.customer_name,
      foundInBackend: found.join(', ') || 'not found',
    });
  }
  await page.close();
  return { total: extra.length, sample: result };
}

function summarise(be, erp, report, extra) {
  const lines = [`BE suppliers: ${be.length}`];
  for (const [key, doctype] of [
    ['customer', 'Customer'],
    ['supplier', 'Supplier'],
  ]) {
    const rows = report[key];
    const byField = {};
    for (const row of rows) {
      for (const d of row.differences) byField[d.field] = (byField[d.field] ?? 0) + 1;
    }
    lines.push(
      '',
      `${doctype} List: ${erp[doctype].length} Mazad records in ERPNext`,
      `  BE suppliers found: ${rows.filter((r) => r.erpName).length}`,
      `  fully matching: ${rows.filter((r) => !r.differences.length).length}`,
      `  missing: ${rows.filter((r) => !r.erpName).length}`,
      `  differences by field: ${JSON.stringify(byField)}`,
    );
  }
  const notFound = extra.sample.filter((r) => r.foundInBackend === 'not found');
  lines.push(
    '',
    `ERPNext Mazad customers that are not BE suppliers: ${extra.total}`,
    `  sampled ${extra.sample.length}, not found in BE Dealer/Individual lists: ${notFound.length}`,
  );
  return lines.join('\n');
}

const browser = await chromium.launch();
try {
  if (!fs.existsSync(BE_SESSION)) {
    throw new Error('No Backend session: run npx playwright test --project=backend-setup first.');
  }
  fs.mkdirSync(OUT, { recursive: true });
  const beContext = await browser.newContext({ storageState: BE_SESSION });
  const be = await collectBackend(beContext);
  save('be-suppliers.json', be);
  const erp = await collectErp(await erpSession(browser));
  save('erp-records.json', erp);
  const report = compare(be, erp);
  save('comparison.json', report);
  const extra = await sampleExtraCustomers(beContext, new Set(be.map((s) => s.ID)), erp.Customer);
  save('extra-customers.json', extra);
  const summary = summarise(be, erp, report, extra);
  fs.writeFileSync(path.join(OUT, 'summary.txt'), summary + '\n');
  console.log(summary);
  console.log(`\nDetails: ${path.relative(ROOT, OUT)}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
