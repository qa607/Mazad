/**
 * The exact Failed List records the QA owner explicitly approved for real transactions
 * (authorization of 2026-11-11, staging only). Nothing else may be changed: every transaction
 * first checks that the item, vehicle, supplier and VIN still match, and stops if they do not.
 * No VIN, supplier, customer or auction may be substituted.
 */
export interface ApprovedItem {
  /** VIN without the attempt mark. */
  vin: string;
  /** Attempt mark shown after the VIN, e.g. "#F1". */
  mark: string;
  /** Auction-item ID: the row key in the Failed list. */
  itemId: string;
  vehicleId: string;
  supplierId: string;
}

export const approvedTransactions = {
  directSale: {
    item: {
      vin: 'KMHD741F4LU016928',
      mark: '#F1',
      itemId: '6638',
      vehicleId: '5414',
      supplierId: '5136',
    },
    customerId: '1520',
    supplierPrice: '35350',
    commission: '0',
    administrativeExpenses: '0',
    expectedTotal: '35,350',
  },
  uploadInvoice: {
    item: {
      vin: 'LSJA36E35LZ027565',
      mark: '#F2',
      itemId: '15137',
      vehicleId: '12255',
      supplierId: '5136',
    },
  },
  /**
   * Replacement approved on 2026-11-11 after the first T3 record (item 19530) did not match its
   * VIN. Min Increment is 500; the +100 change is explicitly approved even though 83,100 is not a
   * multiple of it. If the server rejects it, nothing else is changed.
   */
  repricing: {
    item: {
      vin: 'WDB9340135L367218',
      mark: '#F1',
      itemId: '19535',
      vehicleId: '17033',
      supplierId: '35306',
    },
    currentStartingPrice: '83,000',
    newStartingPrice: '83100',
    /** Every other field must still hold these values when the form opens. */
    unchanged: {
      minIncrement: '500',
      startingBid: '500',
      supplierPrice: '115,000',
      commission: '0',
      administrativeExpenses: '175',
      reservePrice: '115,175',
    },
  },
  suspend: {
    item: {
      vin: 'KMHL241A8MA142064',
      mark: '#F1',
      itemId: '10941',
      vehicleId: '8546',
      supplierId: '7601',
    },
    reason: 'Incorrect Inspection',
  },
  createAuction: {
    item: {
      vin: 'WDB9340135L795777',
      mark: '#F1',
      itemId: '19529',
      vehicleId: '17027',
      supplierId: '35306',
    },
    /** The auction title starts with QA-AUTO; a timestamp makes it unique (45-character limit). */
    titlePrefix: 'QA-AUTO Failed Create',
    monthsAhead: 2,
  },
  addToAuction: {
    item: {
      vin: 'RKLB20DE5R4004238',
      mark: '#F2',
      itemId: '24540',
      vehicleId: '21834',
      supplierId: '782',
    },
    auctionId: '1537',
    auctionTitle: 'Participation auction 3',
    auctionLabel: 'Participation auction 3 (AWAITING)',
  },
} as const;

/** Supplier as the grids show it. */
export function supplierLabel(supplierId: string): string {
  return `شركة تجريبية-${supplierId}`;
}

/** The approved transactions run only when this is set for the run. */
export const approvedRunEnabled = process.env.FAILED_DESTRUCTIVE_APPROVED === 'true';
