import type { Language } from './index';

/** Mazad API response envelope. */
export interface ApiEnvelope<T> {
  status: number;
  message: string;
  data: T;
}

/** A tab definition from GET /v1/configuration (home, my_bids, listings...). */
export interface ConfigTab {
  tab: string;
  tab_text: string;
  empty?: {
    logged?: EmptyState;
    guest?: EmptyState;
  };
}

export interface EmptyState {
  title: string;
  description?: string;
  button_label?: string;
  redirect_to?: string;
}

export interface AppConfiguration {
  home: ConfigTab[];
  my_bids: ConfigTab[];
  listings: ConfigTab[];
  notification: { empty?: { logged?: EmptyState; guest?: EmptyState } }[];
}

/** A Help Center category from GET /v1/faq-list (the apps list exactly these, in this order). */
export interface FaqCategory {
  id: number;
  name: string;
  icon: string;
  /** Only filled when one category is asked for (GET /v1/faq-list?id=<id>); null in the list. */
  questions?: FaqQuestionItem[] | null;
}

/** A published question of a Help Center category, in the order the app lists them. */
export interface FaqQuestionItem {
  question: string;
  answer: string;
}

/** Sections and tabs accepted by GET /v1/auction/list (from the OpenAPI spec). */
export type AuctionSection = 'home' | 'my_bids' | 'favorite' | 'listings';
export type AuctionTab = 'live' | 'upcoming' | 'past' | 'lost' | 'won' | 'tap_waiting_approval';

export interface AuctionListItem {
  id: number;
  status: string;
  current_tab: string;
  type: string;
  /** Vehicle (object) ID: the back office vehicle ID and the ERP Mazad Car name. */
  object_id: number;
  /** Masked by the API, e.g. "VIN: XXXXXXXXXXXXX2838". */
  vin_number: string;
  auction_title: string;
  year: number;
  city: string;
  mileage: string;
  price_object: {
    administrative_expenses: number;
    bids_amount: number;
    auction_start_value: number;
    administrative_expenses_text_en: string;
    administrative_expenses_text_ar: string;
    after_sale_status: string | null;
  };
}

export interface AuctionList {
  section_tabs: { tab: string; tab_text: string }[];
  settings: { auctions_count: number | null; is_filtered: boolean };
  auction_list: { pages_count: number; data: AuctionListItem[] };
}

export interface AuctionListQuery {
  section: AuctionSection;
  tab: AuctionTab;
  lang: Language;
  page?: number;
  perPage?: number;
}

/** One row of the back office Sold List, as displayed. Amounts are in SAR. */
export interface SoldListRow {
  auctionId: number;
  auctionTitle: string;
  auctionType: string;
  biddingType: string;
  status: string;
  saleType: string;
  /** Customer (buyer) user ID, from the customer link. Names are not read. */
  customerId: number | null;
  vehicleId: number | null;
  itemTitle: string;
  itemType: string;
  vin: string;
  plate: string;
  startingPrice: number | null;
  reservePrice: number | null;
  highestPrice: number | null;
  administrativeExpenses: number | null;
  salePrice: number | null;
  netAmount: number | null;
  startDate: string;
  saleDate: string;
  /** Labels of the row's action links (e.g. "View Invoice", "View Workflow"). */
  actions: string[];
}

/** ERP Mazad Car (ERPNext custom DocType, named by the Mazad vehicle ID). */
export interface ErpMazadCar {
  name: string;
  vehicle_id: string;
  vehicle_title_english?: string;
  vehicle_title_arabic?: string;
  status?: string;
  platform?: string;
  vin?: string;
  plate_no?: string;
  car_year?: string;
  selling_price?: number;
  admin_fee?: number;
  commission?: number;
  customer_user_id?: string;
  purchase_reference_id?: string;
  sales_invoice?: string;
  commission_invoice?: string;
  sales_order_reference?: string;
  payment_entry_reference?: string;
  delivery_note_reference?: string;
}

export interface ErpInvoiceItem {
  item_code: string;
  mazad_car?: string;
  car_vin_no?: string;
  amount: number;
}

export interface ErpSalesInvoice {
  name: string;
  docstatus: number;
  status: string;
  platform?: string;
  is_return: number;
  reference_id?: string | null;
  purchase_reference_id?: string | null;
  grand_total: number;
  outstanding_amount: number;
  currency: string;
  items: ErpInvoiceItem[];
}

export interface ErpSalesOrder {
  name: string;
  docstatus: number;
  status: string;
  purchase_reference_id?: string | null;
  grand_total: number;
  items: ErpInvoiceItem[];
}
