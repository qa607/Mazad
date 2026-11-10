import { expect, test } from '@fixtures/test.fixture';
import type { AuctionListItem, ErpMazadCar, SoldListRow } from '@typings/mazad';
import {
  amountTolerance,
  crossSystemSampleSize,
  erpSoldStatuses,
  soldAuctionOverride,
} from '@test-data/sold-list.data';

// Signs in to the back office with real credentials: no trace, video or automatic screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

/** Everything known about one sold vehicle, per system. IDs and amounts only, no personal data. */
interface VehicleLedger {
  auctionId: number;
  vehicleId: number | null;
  vin: string;
  plate: string;
  customerId: number | null;
  backOffice: Pick<
    SoldListRow,
    'status' | 'startingPrice' | 'salePrice' | 'netAmount' | 'administrativeExpenses' | 'saleDate'
  >;
  api: {
    listedInPast: boolean;
    objectId?: number;
    vinLast4?: string;
    openingPrice?: number;
    adminFee?: number;
  };
  erp: {
    mazadCar?: Pick<
      ErpMazadCar,
      'name' | 'status' | 'platform' | 'selling_price' | 'admin_fee' | 'purchase_reference_id'
    >;
    salesInvoice?: {
      name: string;
      status: string;
      docstatus: number;
      grandTotal: number;
      outstanding: number;
    };
    commissionInvoice?: {
      name: string;
      referenceId: string | null;
      status: string;
      grandTotal: number;
    };
    salesOrder?: { name: string; status: string; grandTotal: number };
    paymentEntry?: string;
    deliveryNote?: string;
  };
}

const normalise = (s: string | undefined | null) =>
  (s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
// Compare in halalas (1/100 SAR) so floating-point noise never counts as a difference.
const near = (a: number | null | undefined, b: number | null | undefined) =>
  a != null &&
  b != null &&
  Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= Math.round(amountTolerance * 100);

test('Sold vehicles agree across the back office, the app API and the ERP', async ({
  backendSession,
  mazadSoldListPage,
  mazadApi,
  erp,
}) => {
  void backendSession;
  test.setTimeout(240_000);

  // 1. Sold auctions from the back office Sold List.
  const rows: SoldListRow[] = [];
  await test.step('Back office: read sold auctions', async () => {
    await mazadSoldListPage.goto();
    if (soldAuctionOverride !== null)
      await mazadSoldListPage.search({ auctionId: soldAuctionOverride });
    for (const row of await mazadSoldListPage.rows.all())
      rows.push(await mazadSoldListPage.readRow(row));
    expect(rows.length, 'sold auctions in the back office').toBeGreaterThan(0);
  });

  // 2. Past auctions as the app sees them.
  const apiPast = new Map<number, AuctionListItem>();
  await test.step('App API: read past auctions', async () => {
    for (let page = 1; page <= 20; page++) {
      const { body } = await mazadApi.getAuctionList({
        section: 'home',
        tab: 'past',
        lang: 'en',
        page,
        perPage: 30,
      });
      for (const item of body.data.auction_list.data) apiPast.set(item.id, item);
      if (page >= body.data.auction_list.pages_count) break;
    }
  });

  // 3. Follow the override, or the newest sold auctions that the app also lists.
  const listed = rows.filter((r) => apiPast.has(r.auctionId));
  const sample =
    soldAuctionOverride !== null
      ? rows
      : (listed.length ? listed : rows).slice(0, crossSystemSampleSize);
  test.info().annotations.push({
    type: 'vehicles followed',
    description: sample.map((r) => `auction ${r.auctionId} / vehicle ${r.vehicleId}`).join('; '),
  });

  const ledgers: VehicleLedger[] = [];
  for (const row of sample) {
    const at = `auction ${row.auctionId}`;
    const ledger: VehicleLedger = {
      auctionId: row.auctionId,
      vehicleId: row.vehicleId,
      vin: row.vin,
      plate: row.plate,
      customerId: row.customerId,
      backOffice: {
        status: row.status,
        startingPrice: row.startingPrice,
        salePrice: row.salePrice,
        netAmount: row.netAmount,
        administrativeExpenses: row.administrativeExpenses,
        saleDate: row.saleDate,
      },
      api: { listedInPast: apiPast.has(row.auctionId) },
      erp: {},
    };
    ledgers.push(ledger);

    await test.step(`${at}: back office row is complete`, () => {
      expect.soft(row.vehicleId, `[Back office] ${at} has a vehicle link`).not.toBeNull();
      expect.soft(row.vin, `[Back office] ${at} VIN`).toMatch(/^[A-Z0-9]{17}$/i);
    });

    await test.step(`${at}: app API matches the back office`, () => {
      const item = apiPast.get(row.auctionId);
      if (!item) {
        test.info().annotations.push({ type: 'not in app Past tab', description: at });
        return;
      }
      ledger.api = {
        listedInPast: true,
        objectId: item.object_id,
        vinLast4: item.vin_number.slice(-4),
        openingPrice: item.price_object.auction_start_value,
        adminFee: item.price_object.administrative_expenses,
      };
      expect.soft(item.object_id, `[API] ${at} vehicle ID vs back office`).toBe(row.vehicleId);
      expect
        .soft(item.vin_number.slice(-4), `[API] ${at} VIN last 4 vs back office`)
        .toBe(row.vin.slice(-4));
      expect
        .soft(item.price_object.administrative_expenses, `[API] ${at} admin fee vs back office`)
        .toBe(row.administrativeExpenses);
      expect
        .soft(
          item.price_object.auction_start_value,
          `[API] ${at} opening price vs back office starting price`,
        )
        .toBe(row.startingPrice);
    });

    if (row.vehicleId === null) continue;
    const vehicleId = row.vehicleId;

    const car = await test.step(`${at}: ERP Mazad Car ${vehicleId} matches`, async () => {
      const mazadCar = await erp.getMazadCar(vehicleId);
      expect.soft(mazadCar, `[ERP] Mazad Car ${vehicleId} exists`).not.toBeNull();
      if (!mazadCar) return null;
      ledger.erp.mazadCar = {
        name: mazadCar.name,
        status: mazadCar.status,
        platform: mazadCar.platform,
        selling_price: mazadCar.selling_price,
        admin_fee: mazadCar.admin_fee,
        purchase_reference_id: mazadCar.purchase_reference_id,
      };
      ledger.erp.paymentEntry = mazadCar.payment_entry_reference;
      ledger.erp.deliveryNote = mazadCar.delivery_note_reference;
      expect.soft(mazadCar.platform, `[ERP] ${at} platform`).toBe('Mazad');
      expect
        .soft(erpSoldStatuses, `[ERP] ${at} status "${mazadCar.status}" is a sold status`)
        .toContain(mazadCar.status);
      expect
        .soft(normalise(mazadCar.vin), `[ERP] ${at} VIN vs back office`)
        .toBe(normalise(row.vin));
      expect
        .soft(normalise(mazadCar.plate_no), `[ERP] ${at} plate vs back office`)
        .toBe(normalise(row.plate));
      expect
        .soft(mazadCar.customer_user_id, `[ERP] ${at} buyer user ID vs back office`)
        .toBe(String(row.customerId));
      expect
        .soft(
          near(mazadCar.selling_price, row.salePrice),
          `[ERP] ${at} selling price (${mazadCar.selling_price}) vs back office sale price (${row.salePrice})`,
        )
        .toBe(true);
      expect
        .soft(
          near(mazadCar.admin_fee, row.administrativeExpenses),
          `[ERP] ${at} admin fee (${mazadCar.admin_fee}) vs back office (${row.administrativeExpenses})`,
        )
        .toBe(true);
      expect
        .soft(
          mazadCar.purchase_reference_id ?? '',
          `[ERP] ${at} purchase reference ends with the vehicle ID`,
        )
        .toMatch(new RegExp(`_${vehicleId}$`));
      return mazadCar;
    });
    if (!car) continue;

    await test.step(`${at}: ERP invoices match the vehicle and amounts`, async () => {
      if (car.status !== 'Invoiced' && !car.sales_invoice) {
        test.info().annotations.push({
          type: 'ERP not invoiced yet',
          description: `${at}: ERP status ${car.status}`,
        });
        return;
      }
      expect.soft(car.sales_invoice, `[ERP] ${at} has a sales invoice`).toBeTruthy();
      if (car.sales_invoice) {
        const invoice = await erp.getSalesInvoice(car.sales_invoice);
        expect.soft(invoice, `[ERP] sales invoice ${car.sales_invoice} exists`).not.toBeNull();
        if (invoice) {
          ledger.erp.salesInvoice = {
            name: invoice.name,
            status: invoice.status,
            docstatus: invoice.docstatus,
            grandTotal: invoice.grand_total,
            outstanding: invoice.outstanding_amount,
          };
          expect.soft(invoice.docstatus, `[ERP] ${invoice.name} is submitted`).toBe(1);
          expect.soft(invoice.is_return, `[ERP] ${invoice.name} is not a return`).toBe(0);
          expect
            .soft(
              invoice.items.map((i) => i.mazad_car),
              `[ERP] ${invoice.name} is for Mazad Car ${vehicleId}`,
            )
            .toContain(String(vehicleId));
          expect
            .soft(
              normalise(invoice.items.find((i) => i.car_vin_no)?.car_vin_no),
              `[ERP] ${invoice.name} VIN`,
            )
            .toBe(normalise(row.vin));
          expect
            .soft(invoice.purchase_reference_id, `[ERP] ${invoice.name} purchase reference`)
            .toBe(car.purchase_reference_id);
          expect
            .soft(
              near(invoice.grand_total, row.netAmount),
              `[ERP] ${invoice.name} total (${invoice.grand_total}) vs back office net amount (${row.netAmount})`,
            )
            .toBe(true);
        }
      }
      if (car.commission_invoice) {
        const commission = await erp.getSalesInvoice(car.commission_invoice);
        if (commission) {
          ledger.erp.commissionInvoice = {
            name: commission.name,
            referenceId: commission.reference_id ?? null,
            status: commission.status,
            grandTotal: commission.grand_total,
          };
          expect.soft(commission.docstatus, `[ERP] ${commission.name} is submitted`).toBe(1);
          expect
            .soft(
              commission.reference_id ?? '',
              `[ERP] ${commission.name} reference ends with the auction ID`,
            )
            .toMatch(new RegExp(`_${row.auctionId}$`));
          expect
            .soft(
              commission.items.map((i) => i.mazad_car),
              `[ERP] ${commission.name} is for Mazad Car ${vehicleId}`,
            )
            .toContain(String(vehicleId));
          expect
            .soft(
              near(commission.grand_total, row.administrativeExpenses),
              `[ERP] ${commission.name} total (${commission.grand_total}) vs back office admin fee (${row.administrativeExpenses})`,
            )
            .toBe(true);
        }
      }
      if (car.sales_order_reference) {
        const order = await erp.getSalesOrder(car.sales_order_reference);
        if (order) {
          ledger.erp.salesOrder = {
            name: order.name,
            status: order.status,
            grandTotal: order.grand_total,
          };
          expect.soft(order.docstatus, `[ERP] ${order.name} is submitted`).toBe(1);
          expect
            .soft(order.purchase_reference_id, `[ERP] ${order.name} purchase reference`)
            .toBe(car.purchase_reference_id);
        }
      }
    });
  }

  await test.info().attach('vehicle ledger (IDs and amounts, no personal data)', {
    body: JSON.stringify(ledgers, null, 2),
    contentType: 'application/json',
  });
});
