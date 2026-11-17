import type { Language } from '@typings';
import { uniqueDigits } from '@utils/unique';

/**
 * Delivery confirmation and the purchase survey, end to end: a buyer confirms an In Delivery sale
 * in the app and answers the survey; the back office then lists the sale as Delivered (with the
 * signature) and shows the answers in the Purchase Survey Report.
 *
 * Recorded on stg-154, 2026-11-15 (Android 8.2.2-stage, English), with sale 24721:
 * - Sold List > In Delivery: the buyer's My Actions card shows "Confirm Pickup" (and "Pickup
 *   Information"); its button opens the "Confirm Delivery" sheet: a "received as specified"
 *   checkbox, a signature pad and "Confirm delivery".
 * - Then a dialog: "Thank you for your trust in Mazad by Motory!" with "Rate your purchase
 *   experience" / "No, Thank you"; the survey "Rate Your Purchase Experience" asks the ACTIVE
 *   questions of Survey > Confirm Delivery (by ID, each on its From–To scale), then an optional
 *   text, "Send", and "Thank you!" / "Back".
 * - The sale leaves the Sold List for the Delivered List (actions now include "Signature"); the
 *   report's newest row has the item title, every score as "n/To" and the text.
 * - Before it reaches In Delivery the buyer pays a refundable ownership-transfer deposit by SADAD
 *   (a real bank bill), so a test cannot bring its own purchase that far: it uses a sale already
 *   In Delivery and signs in as its buyer (QA owner, 2026-11-17).
 */
export const confirmDeliveryAppText = {
  en: {
    pickupStep: 'Confirm Pickup',
    pickupButton: 'Confirm Pickup',
    sheetTitle: 'Confirm Delivery',
    thanks: 'Thank you for your trust in Mazad by Motory!',
    rateExperience: 'Rate your purchase experience',
    surveyTitle: 'Rate Your Purchase Experience',
    scaleLow: 'Very low',
    scaleHigh: 'Very high',
    optionalQuestion: 'Do you have anything else you would like to add? (optional)',
    send: 'Send',
    sent: 'Thank you!',
    back: 'Back',
  },
} as const satisfies Partial<Record<Language, Record<string, string>>>;

/** Languages this suite runs in (a sale is confirmed once, so one language per run). */
export const confirmDeliveryLanguages = [
  'en',
] as const satisfies readonly (keyof typeof confirmDeliveryAppText)[];

/** The score chosen on a scale: near the top, and different for each question, to be traceable. */
export function surveyScore(index: number, to: number): number {
  return to - (index === 0 ? 2 : 1);
}

/** A unique free-text answer, to find the run's row in the report. */
export function newSurveyComment(): string {
  return `QA-AUTO survey ${uniqueDigits(7)}`;
}

/** The sale approved for this run and its buyer's account, from "<sale>:<account>". */
export interface ApprovedDelivery {
  saleId: number;
  accountId: number;
}

export function approvedDelivery(
  value: string | undefined = process.env.MAZAD_CONFIRM_DELIVERY_SALE,
): ApprovedDelivery | undefined {
  const match = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(value ?? '');
  return match ? { saleId: Number(match[1]), accountId: Number(match[2]) } : undefined;
}

/** Why the test cannot run without a sale named for it. */
export const APPROVED_DELIVERY_MISSING =
  'No sale approved for this run: set MAZAD_CONFIRM_DELIVERY_SALE="<sale ID>:<buyer account ID>" (a sale In Delivery and its Individual buyer, approved by the QA owner).';

/** The after-sale status a sale must have, as the Sold List filter takes it. */
export const inDeliveryStatus = { filter: 'in_delivery', label: 'In Delivery' } as const;
