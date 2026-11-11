# Failed List: test-data strategy and executed transactions

## Strategy (changed 2026-11-11)

The planned QA-AUTO pool (12 new vehicles, two new buyers, a new Awaiting auction) was dropped. The
Failed List tests now use records that already exist on staging:

- **Read-only tests** run on any Failed List row (page, filters, export, popups, forms, permissions).
- **Real transactions** run only on records the QA owner approves by exact VIN, item ID, vehicle ID
  and supplier, and only when `FAILED_DESTRUCTIVE_APPROVED=true` is set for that run. They live in
  `tests/backend/failed-approved-transactions.spec.ts` with their records in
  `test-data/backend-failed-approved.data.ts`. Each one checks every identifier first and stops on a
  mismatch, runs once, in order, with no retries, and is never reversed by the suite.
- The generic destructive tests in the other specs (`failed-invoice`, `failed-reprice`,
  `failed-create-auction`, `failed-add-to-auction`, `failed-suspend`, `failed-direct-sale`) still
  read the empty pool file `test-data/backend-failed-pool.data.ts`, so they skip. They can be pointed
  at newly approved records the same way when more transactions are approved.
- No suppliers or buyer accounts were created for this. One supplier, `QA-AUTO Failed Pool` (ID
  45961), and one imported vehicle (ID 22457, VIN `QAAUTO40651589700`) exist from the earlier
  approved steps and are not used by any test.

## Records changed on 2026-11-11 (all explicitly approved, staging)

| Workflow                                                      | VIN                     | Item / vehicle | Supplier | Result                                                 |
| ------------------------------------------------------------- | ----------------------- | -------------- | -------- | ------------------------------------------------------ |
| Direct Sale (customer 1520, 35,350, commission 0, expenses 0) | `KMHD741F4LU016928 #F1` | 6638 / 5414    | 5136     | Sold list ID 24738, Type Direct Sale, Waiting Transfer |
| Upload Invoice (generated PDF)                                | `LSJA36E35LZ027565 #F2` | 15137 / 12255  | 5136     | Failed Invoice list, Type "Vehicle"                    |
| Repricing, starting price 83,000 to 83,100                    | `WDB9340135L367218 #F1` | 19535 / 17033  | 35306    | Pricing Done, `RePricing`, 83,100                      |
| Suspend ("Incorrect Inspection")                              | `KMHL241A8MA142064 #F1` | 10941 / 8546   | 7601     | Suspended list                                         |
| Create Auction (`QA-AUTO Failed Create 41075612`, 2027-01-10) | `WDB9340135L795777 #F1` | 19529 / 17027  | 35306    | Awaiting item 24739                                    |
| Add to Auction ("Participation auction 3", ID 1537, AWAITING) | `RKLB20DE5R4004238 #F2` | 24540 / 21834  | 782      | Awaiting item 24740                                    |

None of these vehicles can be put back into the Failed list from the Backend. The first repricing
candidate (item 19530, vehicle 17028, VIN `WDB9340135L376775`) was never changed: the approval
listed it under another VIN, so it was stopped and replaced by item 19535.

Notes:

- Add to Auction gives no result popup in the UI (the save was applied; the test's popup assertion
  timed out). Auction 1537 now holds six vehicles and was due to start 2026-11-12 17:25.
- The Direct Sale (T1) was executed and verified in the Mazad Backend: the item left Failed and is
  in the Sold list (ID 24738) with the submitted prices, the right vehicle and customer.
- Evidence screenshots of each destination list were captured read-only after the run.

## Out of scope

- **ERP synchronization.** The QA owner decided that ERP verification is not part of the Failed List
  automation (2026-11-11). It is not a pending item or a blocker: no ERP credentials are requested
  or configured, and nothing in the Failed List specs reads the ERP.

## Super Admin access

FL-PRM-05 and FL-PRM-05b run with the existing Super Admin account 5556, used with the authorization
of its owner (given to the QA owner, 2026-11-11). Its password was reset through the Backend form
and the credentials live only in the ignored `.env` (`SUPER_ADMIN_PHONE`, `SUPER_ADMIN_PASSWORD`).
The checks are read-only. No other Super Admin account may be changed or used.

## Removed from scope

- **Throwaway-role permission page test** (FL-PRM-06) was removed on 2026-11-11 because it creates
  and deletes a QA role. No role is created, changed or deleted by the Failed List automation.

The full results, defects and limitations are in `docs/failed-list-automation-report.md`.
