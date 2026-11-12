# Jira ticket draft: TD-01

Reported as MAZ-8487: https://ksa-motory.atlassian.net/browse/MAZ-8487

**Type:** Bug
**Project / Component:** Mazad Backend, Delivery Companies, Tracking
**Environment:** Staging `stg-154` (not production), signed in as Dev Root. Found 2026-11-11.
**Suggested priority:** Medium (the filter looks usable but returns wrong results silently)

## Summary

Delivery Companies > Tracking: the "Date of delivery" filter has no effect, so every shipment is returned whatever range is chosen.

## Steps to reproduce

1. Sign in to the Backend and open Delivery Companies > Tracking
   (`/backend/deliveryCompany/delivery-company/tracking`).
2. Note the total in "Showing 1-20 of N items" (81 on 2026-11-11) and the Date of delivery of a row.
3. Open the date range picker on the search form and choose a single day that has shipments
   (or a range that excludes most of them). Click Apply, then Search.
4. Repeat from the address bar with
   `/backend/deliveryCompany/delivery-company/tracking?TrackingDeliveryCompanySearch[date_range]=YYYY-MM-DD - YYYY-MM-DD`
   using the same day for both dates.

## Expected result

Only shipments whose Date of delivery falls inside the chosen range (including both boundary days)
are listed, and the total drops accordingly.

## Actual result

All shipments are listed and the total is unchanged (81 of 81). The picker and the address bar behave the
same, and the hidden field carries the range in the same `YYYY-MM-DD - YYYY-MM-DD` format, so the range
is sent but not applied. Other filters (VIN, plate, delivery company, supplier, city) work.

## Evidence

- Automated tests, expected to fail until fixed (marked `@known-bug`, `test.fail()`), in
  `tests/backend/delivery-tracking-filters.spec.ts`: TRK-FLT-10 (custom range) and TRK-FLT-11
  (single-day boundary).
- Run them: `npx playwright test tests/backend/delivery-tracking-filters.spec.ts --project=backend --grep "TRK-FLT-1[01]"`.
  When the defect is fixed they will start failing as "expected to fail but passed"; remove `test.fail()` then.
- Attach before pushing: a screenshot of the unfiltered total and of the same total after applying the
  date range (take them from the steps above; account details in the header must be masked).

## Notes

- Read-only: reproducing it changes no data.
- Not yet checked: whether the Date of delivery column is date-only or has a time, which could affect boundary handling once the filter works.
