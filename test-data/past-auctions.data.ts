/**
 * Ended (past) auctions on the website, the Android app and the iPhone app, and the app API's
 * Past list. Recorded on staging stg-154, 2026-11-14 (Android 8.2.2-stage, iOS 8.3 (1491)):
 * - The website's Live & Upcoming page ends with "Latest Ended Auctions" (three auctions, e.g.
 *   Competitive Bidding 373, 386, 387) and "All Ended Auctions" -> /<lang>/auctions/ (nine per
 *   page). An ended auction says "Ended Auction"; its car pages say "Auction was held on
 *   10/01/2027" and only offer the app.
 * - Both apps end Home with an "Ended Auctions" button listing the same auctions in the same
 *   order ("مزاد تنافسي 373" ...).
 * - The API's Past list (home, past) holds cars sold through bidding: every Sold row with bids
 *   was listed, while Sold rows with no bids (direct sale / Buy Now) and Failed rows (with or
 *   without bids) were not.
 */

/**
 * Sold List "Type" (sale type) of the cars the Past list shows. The others ("Buy Now",
 * "Direct Sale") were never listed (20 of 20 Sold rows agreed, 2026-11-14).
 */
export const pastSaleType = 'Auction';

/** How many API Past pages to read (30 per page), enough for the newest Sold and Failed rows. */
export const pastApiPages = 10;

/**
 * App text of the ended auctions screens (both apps show the same words). Arabic only: the app
 * tests run in Arabic. Recorded 2026-11-14 (Android 8.2.2-stage, iOS 8.3 (1491)).
 */
export const endedAuctionsAppText = {
  ar: {
    /** The button at the end of Home, and the heading of the list it opens. */
    endedAuctions: 'المزادات المنتهية',
    endedStatus: 'مزاد منتهي',
    heldOnPrefix: 'تم عقد المزاد بتاريخ',
    /** Mileage unit on the car cards ("169,212 كم"). */
    mileageUnit: 'كم',
  },
} as const;

/** The app's list starts with the auctions of the website's "Latest Ended Auctions" section. */
export const latestEndedCompared = 3;

export const endedAuctionRules = {
  /** The Live & Upcoming page shows at most this many ended auctions. */
  latestSectionMax: 3,
  /** "All Ended Auctions" goes here, in either language. */
  listUrl: /\/(en|ar)\/auctions\/?$/,
  /** "Auction was held on 10/01/2027" / "تم عقد المزاد بتاريخ 10/01/2027". */
  heldOnPattern: /\d{2}\/\d{2}\/\d{4}\s*$/,
} as const;
