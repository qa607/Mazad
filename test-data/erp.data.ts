/**
 * ERPNext staging (the ERP that the Mazad staging Backend syncs suppliers to). Credentials are
 * never stored here: see config/credentials.config.ts.
 */
export const erpUrls = {
  base: 'https://erp-stg-fixed.motory.com',
  login: /\/login(\?|#|$)/,
  helpdesk: /\/helpdesk\//,
  desk: /\/(desk|app)(\/|$)/,
  customerList: /\/(desk|app)\/customer(\?|$)/,
  supplierList: /\/(desk|app)\/supplier(\?|$)/,
} as const;

/** Names typed into the ERPNext global search, as given in the test steps. */
export const erpSearchText = {
  customerList: 'Customer List',
  supplierList: 'Supplier List',
} as const;

/** Every BE supplier is synced with Platform = Mazad and group Mazad. */
export const erpMazad = {
  platform: 'Mazad',
  group: 'Mazad',
} as const;

/** BE user lists that hold the non-supplier ERPNext customers (buyers). */
export const buyerLists = ['dealer', 'individual'] as const;

/** How many non-supplier ERPNext customers to look up in the BE buyer lists. */
export const buyerSampleSize = 10;
