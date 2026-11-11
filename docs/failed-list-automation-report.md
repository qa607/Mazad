# Failed List automation: final report

Mazad Backend, Auction → Failed List. Staging environment `stg-154` only. Prepared 2026-11-11 on
branch `test/failed-list` (nothing committed). No passwords, tokens or credentials appear here.

## 1. Final results

Full run of all 10 Failed List specs together (`tests/backend/failed-*.spec.ts`, 2 workers, no
retries, approved-transaction spec skipped because its approval flag is not set):

| Outcome                                                                           | Count |
| --------------------------------------------------------------------------------- | ----- |
| Passed (includes 3 expected failures for known defects and 6 sign-in setup steps) | 139   |
| **Unexpected failures**                                                           | **2** |
| Skipped                                                                           | 18    |
| Total                                                                             | 159   |

The two unexpected failures are FL-FLT-09 and FL-FLT-10. Both timed out in their `beforeEach` page
load (30 s) while the staging server was slow under two workers. They are **not** counted as passes.
Run on their own they both passed (isolated result: 2 of 2 passed, plus the 6 setup steps). Earlier
full runs on the same day had 0 or 1 such timeouts, each passing when re-run alone.

Code checks: TypeScript: no errors. ESLint: 0 errors, 360 warnings (about 321 existing, about 34 in
files from this work, mostly deliberate `test.skip` guards). Prettier: clean (`.vscode/` is not
touched and not checked).

### Expected failures (known defects, kept as `test.fail()` with evidence)

| Test      | Defect |
| --------- | ------ |
| FL-FLT-23 | DC-01  |
| FL-SUS-04 | DC-05  |
| FL-SUS-08 | DC-04  |

### Skipped tests (18) and why

| Tests                                              | Count | Reason                                                                                                                                      |
| -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 to T6 in `failed-approved-transactions.spec.ts` | 6     | Real transactions, run only with `FAILED_DESTRUCTIVE_APPROVED=true`. They were run once on 2026-11-11 (section 2) and must not be repeated. |
| FL-DIR-08, FL-DIR-09                               | 2     | Generic real Direct Sale tests; read the empty pool file                                                                                    |
| FL-INV-05 to FL-INV-08                             | 4     | Generic real upload tests; same                                                                                                             |
| FL-RPR-04, FL-RPR-05                               | 2     | Generic real re-pricing tests; same                                                                                                         |
| FL-CRE-05                                          | 1     | Generic real Create Auction test; same                                                                                                      |
| FL-ADD-04                                          | 1     | Generic real Add to Auction test; same                                                                                                      |
| FL-SUS-05, FL-SUS-07                               | 2     | Generic real Suspend tests; same                                                                                                            |

## 2. Completed Backend transactions (all approved, run once, verified in the Backend)

| #   | Workflow                                                                                  | VIN                     | Item / vehicle    | Supplier | Verified result                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------- | ----------------------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Direct Sale: customer 1520, supplier price 35,350, commission 0, expenses 0, total 35,350 | `KMHD741F4LU016928 #F1` | 6638 / 5414       | 5136     | Left Failed; Sold list ID 24738, Type Direct Sale, status Waiting Transfer, right vehicle, customer and sale price                                                                          |
| T2  | Upload Invoice (generated PDF)                                                            | `LSJA36E35LZ027565 #F2` | 15137 / 12255     | 5136     | Left Failed; Failed Invoice list row, Type "Vehicle", with View Invoice and Update Supplier Invoice actions                                                                                 |
| T3  | Repricing: starting price 83,000 to 83,100                                                | `WDB9340135L367218 #F1` | **19535** / 17033 | 35306    | Saved ("Pricing has been saved successfully."); left Failed; Pricing Done as `RePricing`, starting price 83,100; other fields unchanged; the server accepted +100 despite Min Increment 500 |
| T4  | Suspend, reason "Incorrect Inspection"                                                    | `KMHL241A8MA142064 #F1` | 10941 / 8546      | 7601     | Left Failed; Suspended list with that reason                                                                                                                                                |
| T5  | Create Auction `QA-AUTO Failed Create 41075612`, start 2027-01-10 18:25                   | `WDB9340135L795777 #F1` | 19529 / 17027     | 35306    | Left Failed; Awaiting item 24739 in the new auction                                                                                                                                         |
| T6  | Add to Auction 1537 "Participation auction 3" (AWAITING)                                  | `RKLB20DE5R4004238 #F2` | 24540 / 21834     | 782      | Left Failed; Awaiting item 24740 in that auction                                                                                                                                            |

- **T3 replacement.** The first T3 record (item 19530 / vehicle 17028) was stopped because the
  approval listed it under a different VIN. Item 19530 was never changed. Item 19535 replaced it
  after a separate approval.
- None of these changes was repeated or reversed. None can be put back into the Failed list from the
  Backend.
- **T6 assertion fixed.** The Add to Auction save shows no fixed result popup (the shared submit
  handler can show a popup, load another modal or reload). The specs now record what the page showed
  and assert the real state: gone from Failed, and exactly once in the target auction. The
  transaction itself was applied and verified, and was not repeated.

## 3. Permission coverage

| Role (account)                                                           | Result                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auction Supervisor (QA account)                                          | Failed List, Create and Failed Invoice list open; sidebar links correct                                                                                        |
| Auction Team (QA account)                                                | Failed List opens; Create and Failed Invoice list refused (403); Direct Sale form refused                                                                      |
| Customer Support (QA account)                                            | Only the Failed Invoice list opens; Direct Sale, Upload Invoice and Pricing update forms refused                                                               |
| Operation (QA account)                                                   | Nothing opens; all three forms refused                                                                                                                         |
| Marketing (QA account)                                                   | Nothing opens; all three forms refused                                                                                                                         |
| Super Admin (existing account 5556, used with its owner's authorization) | FL-PRM-05: signs in, opens the Failed List, every action offered. FL-PRM-05b: list, Create and Failed Invoice list return 200 with the right pages. Read-only. |
| Dev Root                                                                 | Separate administrative checks, labelled as such. Not a Super Admin result.                                                                                    |

The role accounts are dedicated "QA <role>" accounts (IDs 45794 to 45798). Their passwords were reset
through the Backend form and are stored only in the ignored `.env`. Not verified: Auction Team's
Upload Invoice (allowed in the matrix; would need a submit) and report/export access. FL-PRM-06 was
removed from scope (section 6).

## 4. Known defect candidates

Full evidence is in `docs/failed-list-defect-candidates.md`.

| ID    | Defect candidate                                                                                                                      | Status                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| DC-01 | Pagination repeats some items and skips others: pages 1 to 30 gave 600 rows but only 592 distinct items (8 repeats), reproduced twice | Open, covered by FL-FLT-23 (expected failure) |
| DC-02 | A mismatched supplier crashes the Add to Auction picker and shows a stack trace                                                       | Open, not automated                           |
| DC-03 | The Operation form's role list is stale (cached)                                                                                      | Open, not automated                           |
| DC-04 | Suspend reason "Requested by Supplie" is misspelled                                                                                   | Open, covered by FL-SUS-08 (expected failure) |
| DC-05 | "Reason Other" never appears for "Other Reasons"                                                                                      | Open, covered by FL-SUS-04 (expected failure) |

## 5. Operational notice: Auction 1537 / item 24540

Item 24540 (vehicle 21834) is in auction 1537 "Participation auction 3" as Awaiting item 24740. The
auction was AWAITING when the item was added and is scheduled to start **2026-11-12 17:25**. This is
an operational notice only: no action is requested or taken, and item 24540 and auction 1537 must not
be changed without separate approval.

## 6. Scope decisions and limitations

- **ERP synchronization: Out of Scope.** Decided by the QA owner on 2026-11-11. It is not pending and
  not a blocker. No ERP access or credentials are used or requested. T1 is verified in the Mazad
  Backend only.
- **FL-PRM-06 removed from scope.** The throwaway-role test would create and delete a QA role, so it
  is not part of the suite. No role is created, changed or deleted.
- **Generic real-transaction specs** still read an empty pool file and skip. Real transactions were
  run through the approved-transactions spec on approved records only.
- Staging is sometimes slow; page-load timeouts show up as isolated failures that pass when re-run.
- The Failed Invoice "category" after an upload is Type = "Vehicle"; no "Supplier Invoice" category
  is shown.
- Server-side behavior for hidden Direct Sale rows and for incompatible Add to Auction submissions is
  unverified (it would need submitting).
- One pilot vehicle (ID 22457, VIN `QAAUTO40651589700`, supplier 45961) was imported earlier and is
  not used by any test.
