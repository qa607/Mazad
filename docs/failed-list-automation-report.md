# Failed List automation: final report

Mazad Backend, Auction → Failed List. Staging environment `stg-154` only. Prepared 2026-11-11 on
branch `test/failed-list` (nothing committed). No passwords, tokens or credentials appear here.

## 1. Final results

Full run of all 12 Failed List specs together (`tests/backend/failed-*.spec.ts`, 2 workers, no
retries, approved-transaction spec skipped because its approval flag is not set), after the four
real invoice upload tests were removed from the suite:

| Outcome                                                                           | Count |
| --------------------------------------------------------------------------------- | ----- |
| Passed (includes 8 expected failures for known defects and 6 sign-in setup steps) | 201   |
| **Unexpected failures**                                                           | **0** |
| Skipped                                                                           | 14    |
| Total                                                                             | 215   |

Earlier full runs on the same day had page-load timeouts (30 s) on a slow staging server; each
passed when re-run alone and none occurred in this run.

Code checks: TypeScript: no errors. ESLint: 0 errors (warnings are mostly deliberate `test.skip`
guards). Prettier: clean (`.vscode/` is not touched and not checked).

### Expected failures (known defects, kept as `test.fail()` with evidence)

| Test                                                             | Defect |
| ---------------------------------------------------------------- | ------ |
| FL-FLT-23                                                        | DC-01  |
| FL-SUS-04                                                        | DC-05  |
| FL-SUS-08                                                        | DC-04  |
| FI-FLT-04                                                        | DC-07  |
| FI-PRM-08 (Auction Team, Customer Support, Operation, Marketing) | DC-06  |

### Skipped tests (14) and why

| Tests                                              | Count | Reason                                                                                                                                      |
| -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 to T6 in `failed-approved-transactions.spec.ts` | 6     | Real transactions, run only with `FAILED_DESTRUCTIVE_APPROVED=true`. They were run once on 2026-11-11 (section 2) and must not be repeated. |
| FL-DIR-08, FL-DIR-09                               | 2     | Generic real Direct Sale tests; read the empty pool file                                                                                    |
| FL-RPR-04, FL-RPR-05                               | 2     | Generic real re-pricing tests; same                                                                                                         |
| FL-CRE-05                                          | 1     | Generic real Create Auction test; same                                                                                                      |
| FL-ADD-04                                          | 1     | Generic real Add to Auction test; same                                                                                                      |
| FL-SUS-05, FL-SUS-07                               | 2     | Generic real Suspend tests; same                                                                                                            |

### Excluded from scope (not skipped)

- **Real invoice upload scenarios.** The four generic tests FL-INV-05, FL-INV-06, FL-INV-07 and
  FL-INV-08 (empty PDF, oversized file, upload failure, and a real upload moving a vehicle to the
  Failed Invoice list) were removed from the suite on 2026-11-11 together with the helpers and pool
  data only they used. They do not appear as skipped. The read-only upload checks stay: popup,
  required file, invalid extensions and Close (FL-INV-00 to FL-INV-04, and FI-ACT-03 to FI-ACT-06).
  The one real upload that was ever made is approved transaction T2 (section 2), run once.

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
- **Real invoice upload tests (FL-INV-05 to FL-INV-08) removed from scope**, not skipped: no real
  invoice is uploaded, replaced or updated by the suite.
- **Generic real-transaction specs** still read an empty pool file and skip. Real transactions were
  run through the approved-transactions spec on approved records only.
- Staging is sometimes slow; page-load timeouts show up as isolated failures that pass when re-run.
- The Failed Invoice "category" after an upload is Type = "Vehicle"; no "Supplier Invoice" category
  is shown.
- Server-side behavior for hidden Direct Sale rows and for incompatible Add to Auction submissions is
  unverified (it would need submitting).
- One pilot vehicle (ID 22457, VIN `QAAUTO40651589700`, supplier 45961) was imported earlier and is
  not used by any test.

## 7. Failed Invoice list: functional and permission coverage (added 2026-11-11)

Specs: `tests/backend/failed-invoice-list.spec.ts` (Dev Root) and
`tests/backend/failed-invoice-permissions.spec.ts` (role accounts and Super Admin). Page object:
`src/pages/backend/invoice/failed-invoice.page.ts`. Data: `test-data/backend-failed-invoice.data.ts`.
Everything is read-only and uses the single invoice record from T2 (item 15137). Nothing is
uploaded, replaced or updated.

### Functionality found (staging)

- Page `/backend/invoice/failed-invoice/index`: heading and breadcrumb "Failed Invoice", sidebar
  link, 7 columns (ID, Type, Customer, Vin Number, Item Title, Supplier Name, Actions).
- Filters: Supplier (offers only suppliers that have an invoice), Customer / highest bidder
  (search-as-you-type), VIN and Item Title (text), Search and Reset. No toolbar and no export. No
  page-size control. No Swagger or API documentation.
- Row actions: **View Invoice** (opens the invoice file in a new tab) and **Update Supplier
  Invoice** (opens the same "Upload Invoice" popup as the Failed list; it posts to the upload
  endpoint with `list_name=failed_supplier_invoice`).

### Results

| Spec                                 | Tests | Passed | Expected failures    | Unexpected failures | Skipped |
| ------------------------------------ | ----- | ------ | -------------------- | ------------------- | ------- |
| `failed-invoice-list.spec.ts`        | 32    | 31     | 1 (FI-FLT-04, DC-07) | 0                   | 0       |
| `failed-invoice-permissions.spec.ts` | 28    | 24     | 4 (FI-PRM-08, DC-06) | 0                   | 0       |

Run together with `failed-invoice.spec.ts` (14 read-only upload and list tests) and
`failed-permissions.spec.ts`: 118 tests (including 6 sign-in setup steps), 118 passed (5 of them
expected failures), **0 skipped**, 0 unexpected failures. FL-INV-05 to FL-INV-08 are no longer in the
suite.

### Coverage

- **List and data:** heading, breadcrumb, sidebar link, filters, 7 columns; the T2 row (ID, Type,
  Customer, VIN, title, supplier, actions); summary matches the rows; empty state ("No results
  found."); the same record after a refresh and after leaving and coming back.
- **Filters:** VIN full, partial and no match; Item Title partial and no match; Supplier; Customer
  (suggestions, picking one, no-results message); combined filters (finds the record, and a
  mismatching title finds nothing); clearing one filter; Reset.
- **Pagination:** with one page of records there is no pager, and `page` and `per-page` parameters
  keep the page working with no repeated rows. This is single-record coverage only.
- **View Invoice:** the link opens in a new tab and shows a PDF file; the address is served by the
  Backend and redirects to a PDF. Only the file type is checked; the signed address, cookies and the
  PDF contents are never read, logged or attached.
- **Update Supplier Invoice (nothing submitted):** the popup opens for this invoice; submitting with
  no file is refused ("Invoice cannot be blank.") and sends nothing; the extension message appears
  for .txt, .exe, .docx, .gif, .svg and .pdf.exe; closing leaves the record unchanged.

### Role and action permission matrix

Observed behavior matched the configured permissions for every page and action.

| Role               | List  | Sidebar | Row visible   | View Invoice     | Update Supplier Invoice              | Update form request      | File address by URL      |
| ------------------ | ----- | ------- | ------------- | ---------------- | ------------------------------------ | ------------------------ | ------------------------ |
| Super Admin (5556) | opens | yes     | yes           | shown, opens PDF | shown, popup opens                   | not checked (popup used) | not checked              |
| Auction Supervisor | opens | yes     | yes           | shown, opens PDF | shown, popup opens                   | 200                      | 302 to the PDF (allowed) |
| Auction Team       | 403   | no      | not reachable | not reachable    | not reachable (holds the permission) | 200                      | **302 (should be 403)**  |
| Customer Support   | opens | yes     | yes           | **not shown**    | **not shown**                        | 403                      | **302 (should be 403)**  |
| Operation          | 403   | no      | not reachable | not reachable    | not reachable                        | 403                      | **302 (should be 403)**  |
| Marketing          | 403   | no      | not reachable | not reachable    | not reachable                        | 403                      | **302 (should be 403)**  |

Auction Team holds only the upload permission, so it can request the update form but cannot reach the
list that offers the action. No role, permission or other record was changed.

### New defect candidates

- **DC-06 (authorization).** The invoice file address (`/backend/image/view-file?url=...`) answers
  302 to the stored PDF for any signed-in back-office user, including roles without
  `view-failed-invoice` (Auction Team, Customer Support, Operation, Marketing). The authorization
  expectation (403) is kept in FI-PRM-08, which fails as expected until fixed. Limits: the address is
  only shown in the list to permitted roles, so using it requires knowing the file URL; signed-out
  access was deliberately not tested; the Super Admin request to the file was not completed (a
  network timeout reaching the storage service during an earlier probe), though Super Admin holds
  the permission.
- **DC-07 (filter).** The Item Title filter finds the invoice for "MG 5", "MG" and "2020" but not for
  the title exactly as the grid shows it ("MG 5 2020"). FI-FLT-04 keeps the expectation and fails as
  expected; FI-FLT-04b covers the working search (vehicle name without the year).

### Not covered, and why

- Multi-record behavior (a filter excluding other records, a supplier dropdown with several values)
  and multi-page pagination (first, last, page-size changes, no duplicates across pages): the list
  holds one invoice. More records would need more uploads, which were not approved.
- **Update Supplier Invoice, real submit, replacement and server-side validation: intentionally not
  submitted.** It changes data and needs approval for a specific record and scenario.
- Export: none exists on this list (the separate "Failed" report has its own export permission).
- Signed-out access to the invoice file.
- Session note: while probing, a failed request printed part of two session cookies (one was
  account 5556's) to the terminal. Nothing was saved. Account 5556 was signed out through the normal
  logout flow; that clears the current session, and an old session cookie cannot be individually
  revoked from the Backend UI.
