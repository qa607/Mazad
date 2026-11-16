/**
 * Mazad Backend "Failed Auctions" list (/backend/auction/failed/index) test data. The Backend has
 * no localization, so its UI text lives here. Texts, options and rules were read from the staging
 * Backend (stg-154) on 2026-11-11 with Dev Root, from the live pages and the pages' own
 * validation scripts; nothing here is assumed. Counts of records are never fixed: tests read
 * them from the list.
 */
export const failedText = {
  pageTitle: 'Failed Auctions',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the selection checkbox column has no label). */
  columnHeaders: [
    '',
    'Auction Info',
    'Customer Name',
    'Item Info',
    'Statistics',
    'Prices',
    'Date',
    'Failed Reason',
    'Actions',
  ],
  /** Row actions, by their title; Direct Sale only appears on rows that have bids. */
  rowActions: ['Direct Sale', 'Repricing', 'Upload Invoice', 'Suspend'],
  /** What the Customer column shows when nobody bid. */
  customerNotSet: '(not set)',
  repricingConfirmMessage: 'Are you sure you want to reprice item?',
  suspendModalTitle: 'Suspend Vehicle Reason',
  /** The four reasons offered on the page, spelled as the page spells them. */
  suspendReasonsAsShown: [
    'The car is pending to be sold',
    'Incorrect Inspection',
    'Requested by Supplie',
    'Other Reasons',
  ],
  /** The correct spelling of the third reason (defect candidate DC-04). */
  suspendReasonThirdCorrect: 'Requested by Supplier',
  reasonRequired: 'Reason cannot be blank.',
  directSaleTitle: 'Direct Sale',
  directSaleRequired: {
    customer: 'Customer cannot be blank.',
    supplierPrice: 'Supplier Price cannot be blank.',
  },
  uploadInvoiceTitle: 'Upload Invoice',
  invoiceRequired: 'Invoice cannot be blank.',
  invoiceExtensionError: /Only files with these extensions are allowed\s*:\s*PNG, JPG, JPEG & PDF/,
  addToAuctionTitle: 'Add To Auction',
  addToAuctionNote: /Featured auctions with entrance fees or single car type are not available/,
  exportConfirmMessage: /export file will be generated for download/i,
  createAuctionTitle: 'Create Auction',
  pricingUpdateTitlePrefix: 'Update Pricing: ',
  /** Status the Pricing Done list shows for a re-priced vehicle: the application's own word. */
  rePricingStatus: 'RePricing',
} as const;

export const failedUrls = {
  list: /\/backend\/auction\/failed\/index$/,
  createAuction: /\/backend\/auction\/failed\/create$/,
  pricingUpdate: (vehicleId: string) =>
    new RegExp(`/backend/vehicle/pricing/update\\?id=${vehicleId}$`),
  vehicleView: (vehicleId: string) =>
    new RegExp(`/backend/vehicle/vehicle/view\\?id=${vehicleId}$`),
} as const;

export const failedData = {
  pageSize: 20,
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  partialVinLength: 8,
  /** A title that matches no vehicle. */
  unknownTitle: 'zzzz-no-such-title',
  /** Starting price no failed item has. */
  unknownStartingPrice: '7',
  /** Failed reasons the filter offers (2026-11-11). Reasons may be added: a subset is asserted. */
  expectedFailedReasons: ['No Bids', 'Reserve Price', 'Disabled', 'Others'],
  /** Option texts of the small fixed dropdowns, in order. */
  typeOptions: ['Vehicle', 'Sellit', 'Bulk'],
  auctionTypeOptions: ['Instant Auction', 'Approval Required Auction'],
  bidTypeOptions: ['Standard', 'Price Offering'],
  showAllOptions: ['Yes', 'No'],
  dateRangeTypeOptions: ['Start Date', 'End Date'],
  /** Select-filter values written as the grid shows them. */
  gridAuctionType: { normal: 'Instant Auction', waiting_approval: 'Approval Required Auction' },
  gridBidType: { standard: 'Standard', offering: 'Price Offering' },
} as const;

/** Direct Sale form rules, read from the page's validation script (client and AJAX). */
export const directSaleRules = {
  supplierPrice: { min: 1, max: 1_000_000_000 },
  commission: { min: 0, max: 65_000 },
  administrativeExpenses: { min: 0, max: 9_999 },
  messages: {
    notInteger: (field: string) => `${field} must be an integer.`,
    tooSmall: (field: string, min: number) => `${field} must be no less than ${min}.`,
    tooBig: (field: string, max: number) => `${field} must be no greater than ${max}.`,
  },
} as const;

/** Cases for the Direct Sale price validation, each with the field, input and expected message. */
export const directSaleInvalidCases = [
  {
    name: 'a supplier price of 0',
    field: 'supplierPrice',
    value: '0',
    error: directSaleRules.messages.tooSmall('Supplier Price', directSaleRules.supplierPrice.min),
  },
  {
    name: 'a supplier price above one billion',
    field: 'supplierPrice',
    value: '1000000001',
    error: directSaleRules.messages.tooBig('Supplier Price', directSaleRules.supplierPrice.max),
  },
  {
    name: 'a supplier price with letters',
    field: 'supplierPrice',
    value: 'abc',
    error: directSaleRules.messages.notInteger('Supplier Price'),
  },
  {
    name: 'a commission above 65,000',
    field: 'commission',
    value: '65001',
    error: directSaleRules.messages.tooBig('Commission', directSaleRules.commission.max),
  },
  {
    name: 'administrative expenses above 9,999',
    field: 'administrativeExpenses',
    value: '10000',
    error: directSaleRules.messages.tooBig(
      'Administrative Expenses',
      directSaleRules.administrativeExpenses.max,
    ),
  },
] as const;

/**
 * The price boxes drop characters they cannot hold while typing, so a decimal point or a minus
 * sign never reaches the form (seen 2026-11-11): "10.5" is shown as "105", "-1" as "1".
 */
export const directSaleMaskedInputs = [
  { name: 'a decimal supplier price', field: 'supplierPrice', typed: '10.5', shown: '105' },
  { name: 'a negative commission', field: 'commission', typed: '-1', shown: '1' },
  {
    name: 'negative administrative expenses',
    field: 'administrativeExpenses',
    typed: '-1',
    shown: '1',
  },
] as const;

/** Prices typed in the Direct Sale popup and the Total Price the page works out (verified 2026-11-11). */
export const directSaleTotals = [
  { supplierPrice: '1000', commission: '0', administrativeExpenses: '0', total: '1,000' },
  { supplierPrice: '1000', commission: '100', administrativeExpenses: '0', total: '1,100' },
  { supplierPrice: '1000', commission: '0', administrativeExpenses: '50', total: '1,050' },
  { supplierPrice: '1000', commission: '100', administrativeExpenses: '50', total: '1,150' },
  { supplierPrice: '123456', commission: '6500', administrativeExpenses: '999', total: '130,955' },
] as const;

/** Re-pricing form rules (read from the page's validation script). */
export const pricingRules = {
  startingPriceRequired: 'Starting Price cannot be blank.',
  startingPriceNotInteger: 'Starting Price must be an integer.',
  startingPriceTooSmall: 'Starting Price must be no less than 0.',
  startingPriceTooBig: 'Starting Price must be no greater than 1000000000.',
  buyNowRequired: 'Buy Now Price cannot be blank.',
} as const;

/** Columns of the Failed List export, in order (CSV, XLS and XLSX), as downloaded on 2026-11-11. */
export const failedExportColumns = [
  'Auction ID',
  'Auction Source',
  'Auction Type',
  'Bidding Type',
  'Customer Name',
  'Auction Title',
  'Total Registered',
  'Vehicle Title View',
  'Vin Number',
  'Plate Number',
  'Number Of Cars',
  'Total Bids',
  'Total Bidders',
  'Total Views',
  'Total Viewers',
  'Start Date',
  'End Date',
  'Starting Price',
  'Commission',
  'Administrative Expenses',
  'Buy Now Price',
  'Supplier Price',
  'Reserve Price',
  'Highest Price',
  'Supplier Name',
  'Failed Reason',
] as const;

/** Export file name: "Failed Auctions <yyyy-mm-dd>.<ext>". */
export const failedExportFileName = {
  Csv: /^Failed Auctions \d{4}-\d{2}-\d{2}\.csv$/,
  Xls: /^Failed Auctions \d{4}-\d{2}-\d{2}\.xls$/,
  Xlsx: /^Failed Auctions \d{4}-\d{2}-\d{2}\.xlsx$/,
} as const;

/** Arabic letters, for checking Arabic data survives the grid and the export. */
export const arabicLetters = /[؀-ۿ]/;

/** Failed Invoice list (/backend/invoice/failed-invoice/index). */
export const failedInvoiceText = {
  pageTitle: 'Failed Invoice',
  noResults: 'No results found.',
  columnHeaders: ['ID', 'Type', 'Customer', 'Vin Number', 'Item Title', 'Supplier Name', 'Actions'],
} as const;

/** Pricing Done / Suspended / Sold destination checks. */
export const destinationText = {
  pricingDoneTitle: 'Pricing Done',
  suspendedTitle: 'Suspended Vehicles',
} as const;
