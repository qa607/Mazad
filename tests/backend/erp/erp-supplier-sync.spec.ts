import {
  DEV_ROOT_MISSING_REASON,
  ERP_MISSING_REASON,
  getErpAccount,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { expect, test } from '@fixtures/supplier.fixture';
import { ErpDeskPage, type ErpRecord } from '@pages/erp/erp-desk.page';
import { SupplierListPage } from '@pages/backend/supplier-list.page';
import { SupplierViewPage } from '@pages/backend/supplier-view.page';
import { buyerLists, buyerSampleSize, erpMazad } from '@test-data/erp.data';

/**
 * BE Supplier List → ERPNext sync. Every BE supplier is matched to its ERPNext Customer and
 * Supplier records by Platform User ID (= BE supplier ID), never by name.
 *
 * The checks assert the sync rules that hold. Differences the business accepted (2026-11-08) are
 * not failures; the last test attaches them as a report instead:
 * inactive suppliers not synced, edited email or status not re-synced, no phone, no email on
 * the Customer record, missing or partial address, ZATCA ID type "700" on Customer records.
 *
 * Read-only: the Backend is browsed as Dev Root and ERPNext is read through its list API (GET).
 */

// Signed in to both systems with real accounts: no trace, video or screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

interface BeSupplier {
  id: string;
  status: string;
  email: string;
  phone: string;
  /** "Supplier Name" on the details page: the Arabic company name from the CR record. */
  supplierName: string;
  crNumber: string;
  taxId: string;
}

const CUSTOMER_FIELDS = [
  'name',
  'platform_user_id',
  'customer_type',
  'customer_group',
  'zatca_customer_name_in_arabic',
  'custom_buyer_id',
  'tax_id',
  'email_id',
  'mobile_no',
  'disabled',
] as const;

const SUPPLIER_FIELDS = [
  'name',
  'platform_user_id',
  'supplier_group',
  'supplier_name_in_arabic',
  'supplier_id_number_for_zatca',
  'tax_id',
  'email_id',
  'mobile_no',
  'disabled',
] as const;

const text = (value: string | number | null | undefined): string =>
  value == null || value === '(not set)' ? '' : String(value).replace(/\s+/g, ' ').trim();

let be: BeSupplier[] = [];
let customers: ErpRecord[] = [];
let suppliers: ErpRecord[] = [];

/** ERPNext records of one doctype, grouped by Platform User ID. */
function byPlatformUserId(records: ErpRecord[]): Map<string, ErpRecord[]> {
  const map = new Map<string, ErpRecord[]>();
  for (const record of records) {
    const id = text(record.platform_user_id);
    map.set(id, [...(map.get(id) ?? []), record]);
  }
  return map;
}

test.describe('ERPNext sync of BE suppliers', () => {
  test.beforeAll(async ({ browser, devRootSession }) => {
    const account = getErpAccount();
    test.skip(!devRootSession, DEV_ROOT_MISSING_REASON);
    test.skip(!account, ERP_MISSING_REASON);
    if (!devRootSession || !account) return;
    test.setTimeout(10 * 60_000);

    // BE: every supplier in the list, then its details page.
    const beContext = await browser.newContext({
      baseURL: envConfig.baseURL,
      storageState: devRootSession,
    });
    const page = await beContext.newPage();
    const list = new SupplierListPage(page);
    const view = new SupplierViewPage(page);
    const rows = [];
    for (let n = 1; ; n++) {
      await list.goto({ sort: 'id', page: String(n) });
      rows.push(...(await list.readRows()));
      const { to, total } = await list.summaryCounts();
      if (to >= total) break;
    }
    be = [];
    for (const row of rows) {
      await view.goto(row.ID);
      be.push({
        id: row.ID,
        status: row.Status,
        email: text(row.Email),
        phone: row.Phone,
        supplierName: text(await view.value('Supplier Name').inputValue()),
        crNumber: text(await view.value('Cr Number').inputValue()),
        taxId: text(await view.value('Tax ID').inputValue()),
      });
    }
    await beContext.close();

    // ERPNext: sign in through the form, then read every Mazad record.
    const erpContext = await browser.newContext();
    const erp = new ErpDeskPage(await erpContext.newPage());
    await erp.goto();
    await erp.loginAs(account);
    const mazad: [string, string, string][] = [['platform', '=', erpMazad.platform]];
    customers = await ErpDeskPage.listRecords(erp.page.request, 'Customer', CUSTOMER_FIELDS, mazad);
    suppliers = await ErpDeskPage.listRecords(erp.page.request, 'Supplier', SUPPLIER_FIELDS, mazad);
    await erpContext.close();
  });

  test('BE Supplier List and ERPNext lists were read', () => {
    expect(be.length, 'BE suppliers').toBeGreaterThan(0);
    expect(customers.length, 'ERPNext Mazad customers').toBeGreaterThan(0);
    expect(suppliers.length, 'ERPNext Mazad suppliers').toBeGreaterThan(0);
  });

  for (const [listName, records] of [
    ['Customer', () => customers],
    ['Supplier', () => suppliers],
  ] as const) {
    test(`Every active BE supplier has exactly one ERPNext ${listName} record`, () => {
      const erpById = byPlatformUserId(records());
      const wrong = be
        .filter((s) => s.status === 'active')
        .map((s) => ({ id: s.id, records: (erpById.get(s.id) ?? []).map((r) => r.name) }))
        .filter((s) => s.records.length !== 1);
      expect(wrong, `active BE suppliers without exactly one ${listName}`).toEqual([]);
    });

    test(`Platform User IDs are unique in the ERPNext ${listName} List`, () => {
      const duplicates = [...byPlatformUserId(records()).entries()]
        .filter(([, recs]) => recs.length > 1)
        .map(([id, recs]) => ({ id, records: recs.map((r) => r.name) }));
      expect(duplicates).toEqual([]);
    });
  }

  test('Every ERPNext Mazad supplier is a BE supplier', () => {
    const beIds = new Set(be.map((s) => s.id));
    const orphans = suppliers
      .filter((r) => !beIds.has(text(r.platform_user_id)))
      .map((r) => ({ name: r.name, platformUserId: r.platform_user_id }));
    expect(orphans).toEqual([]);
  });

  test('Synced records carry the BE CR number, tax ID and Arabic name', () => {
    const customerById = byPlatformUserId(customers);
    const supplierById = byPlatformUserId(suppliers);
    const mismatches: object[] = [];
    for (const s of be) {
      for (const [list, recs, cr, arabic] of [
        ['Customer', customerById.get(s.id), 'custom_buyer_id', 'zatca_customer_name_in_arabic'],
        [
          'Supplier',
          supplierById.get(s.id),
          'supplier_id_number_for_zatca',
          'supplier_name_in_arabic',
        ],
      ] as const) {
        for (const r of recs ?? []) {
          const fields: [string, string, string][] = [
            ['CR number', s.crNumber, text(r[cr])],
            ['Tax ID', s.taxId, text(r.tax_id)],
            ['Arabic name', s.supplierName, text(r[arabic])],
          ];
          for (const [field, expected, actual] of fields) {
            if (expected !== actual) {
              mismatches.push({ id: s.id, list, record: r.name, field, be: expected, erp: actual });
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('Synced records are in the Mazad customer and supplier groups', () => {
    const outside = [
      ...customers
        .filter((r) => text(r.customer_group) !== erpMazad.group)
        .map((r) => ({ record: r.name, group: r.customer_group })),
      ...suppliers
        .filter((r) => text(r.supplier_group) !== erpMazad.group)
        .map((r) => ({ record: r.name, group: r.supplier_group })),
    ];
    expect(outside).toEqual([]);
  });

  test('ERPNext Mazad customers that are not suppliers are BE dealers or individuals', async ({
    page,
  }) => {
    const beIds = new Set(be.map((s) => s.id));
    const buyers = customers.filter((r) => !beIds.has(text(r.platform_user_id)));
    test.skip(buyers.length === 0, 'Every ERPNext Mazad customer is a BE supplier.');
    const step = Math.max(1, Math.floor(buyers.length / buyerSampleSize));
    const sample = buyers.filter((_, i) => i % step === 0).slice(0, buyerSampleSize);

    const notFound: object[] = [];
    for (const buyer of sample) {
      let found = false;
      for (const list of buyerLists) {
        const response = await page.goto(
          `/backend/users/${list}/view?id=${text(buyer.platform_user_id)}`,
        );
        if (response?.status() === 200) {
          found = true;
          break;
        }
      }
      if (!found) notFound.push({ record: buyer.name, platformUserId: buyer.platform_user_id });
    }
    expect(notFound, `of ${sample.length} sampled out of ${buyers.length}`).toEqual([]);
  });

  test('Accepted business-rule differences are reported', async ({}, testInfo) => {
    const customerById = byPlatformUserId(customers);
    const supplierById = byPlatformUserId(suppliers);
    const digits = (v: string | number | null | undefined) =>
      text(v)
        .replace(/\D/g, '')
        .replace(/^(966|0)/, '');
    const report = {
      inactiveNotSynced: be
        .filter((s) => s.status === 'inactive' && !supplierById.has(s.id))
        .map((s) => s.id),
      inactiveButEnabledInErp: be
        .filter((s) => s.status === 'inactive')
        .filter((s) => (supplierById.get(s.id) ?? []).some((r) => !Number(r.disabled)))
        .map((s) => s.id),
      supplierEmailDiffers: be
        .filter((s) => (supplierById.get(s.id) ?? []).some((r) => text(r.email_id) !== s.email))
        .map((s) => s.id),
      customerEmailEmpty: be
        .filter((s) => (customerById.get(s.id) ?? []).some((r) => !text(r.email_id)))
        .map((s) => s.id),
      phoneDiffers: be
        .filter((s) =>
          [...(customerById.get(s.id) ?? []), ...(supplierById.get(s.id) ?? [])].some(
            (r) => digits(r.mobile_no) !== digits(s.phone),
          ),
        )
        .map((s) => s.id),
    };
    await testInfo.attach('erp-accepted-differences.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    for (const [kind, ids] of Object.entries(report)) {
      testInfo.annotations.push({ type: 'business need', description: `${kind}: ${ids.length}` });
    }
    expect(be.length).toBeGreaterThan(0);
  });
});
