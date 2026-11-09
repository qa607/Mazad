/**
 * Data for the auction lifecycle test (tests/backend/auction-live.spec.ts): a real auction that
 * goes live on staging. The Backend has no localization, so its UI text lives here.
 */
export const auctionLiveData = {
  /** Title prefix (with a timestamp appended it must stay within the 45-character limit). */
  titlePrefix: 'QA Live Test -',
  /** Minutes from now to the auction start: enough to see it in Awaiting first. */
  startInMinutes: 3,
  /** Auction length in minutes; it ends with no bids, so the vehicle goes to Failed. */
  durationMinutes: 3,
  /** Extra minutes allowed for the server's scheduler to move the vehicle between lists. */
  schedulerGraceMinutes: 4,
  /** How often the test reloads a list while waiting for the scheduler. */
  pollEverySeconds: 15,
  timeZone: 'Asia/Riyadh',
} as const;

export const auctionLiveText = {
  movedToUpcoming: 'Items have been moved to upcoming',
  movedToPricingDone: 'Items have been moved to pricing done',
  created: 'The auction has been created successfully.',
  /** Bidding type of auctions created from the wizard; it has no Auto Extend switch. */
  priceOffering: 'Price Offering',
} as const;
