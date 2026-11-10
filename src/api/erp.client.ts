import type { APIRequestContext } from '@playwright/test';
import type { ErpAccount } from '@config/credentials.config';
import type { ErpMazadCar, ErpSalesInvoice, ErpSalesOrder } from '@typings/mazad';

const LOGIN = '/api/method/login';
const LOGOUT = '/api/method/logout';

/**
 * Read-only ERPNext (Frappe REST) client. The only non-GET calls it can make are login and
 * logout; it never creates, edits, submits, cancels or deletes ERP documents. Customer
 * personal fields are not requested.
 */
export class ErpClient {
  constructor(private readonly request: APIRequestContext) {}

  /** Signs in; the session cookie stays in the request context. */
  async login(account: ErpAccount): Promise<void> {
    const response = await this.request.post(LOGIN, {
      data: { usr: account.user, pwd: account.password },
    });
    if (!response.ok()) {
      throw new Error(`ERP login failed with HTTP ${response.status()}.`);
    }
  }

  async logout(): Promise<void> {
    await this.request.post(LOGOUT).catch(() => undefined);
  }

  private async getDoc<T>(
    doctype: string,
    name: string,
    fields: readonly string[],
  ): Promise<T | null> {
    const response = await this.request.get(
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    );
    if (response.status() === 404) return null;
    if (!response.ok()) {
      throw new Error(`ERP GET ${doctype} ${name} failed with HTTP ${response.status()}.`);
    }
    const { data } = (await response.json()) as { data: Record<string, unknown> };
    // Keep only the fields the tests compare, so customer details never reach reports.
    return Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])) as T;
  }

  /** Mazad Car is named by the Mazad vehicle ID. */
  getMazadCar(vehicleId: number | string) {
    return this.getDoc<ErpMazadCar>('Mazad Car', String(vehicleId), [
      'name',
      'vehicle_id',
      'vehicle_title_english',
      'vehicle_title_arabic',
      'status',
      'platform',
      'vin',
      'plate_no',
      'car_year',
      'selling_price',
      'admin_fee',
      'commission',
      'customer_user_id',
      'purchase_reference_id',
      'sales_invoice',
      'commission_invoice',
      'sales_order_reference',
      'payment_entry_reference',
      'delivery_note_reference',
    ]);
  }

  async getSalesInvoice(name: string): Promise<ErpSalesInvoice | null> {
    const invoice = await this.getDoc<ErpSalesInvoice>('Sales Invoice', name, [
      'name',
      'docstatus',
      'status',
      'platform',
      'is_return',
      'reference_id',
      'purchase_reference_id',
      'grand_total',
      'outstanding_amount',
      'currency',
      'items',
    ]);
    if (invoice) invoice.items = pickItems(invoice.items);
    return invoice;
  }

  async getSalesOrder(name: string): Promise<ErpSalesOrder | null> {
    const order = await this.getDoc<ErpSalesOrder>('Sales Order', name, [
      'name',
      'docstatus',
      'status',
      'purchase_reference_id',
      'grand_total',
      'items',
    ]);
    if (order) order.items = pickItems(order.items);
    return order;
  }
}

/** A string or number field as text; anything else (missing, null, objects) as undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value) || undefined
    : undefined;
}

function pickItems(items: unknown): ErpSalesInvoice['items'] {
  return ((items as Record<string, unknown>[] | undefined) ?? []).map((item) => ({
    item_code: String(item.item_code),
    mazad_car: text(item.mazad_car),
    car_vin_no: text(item.car_vin_no),
    amount: Number(item.amount),
  }));
}
