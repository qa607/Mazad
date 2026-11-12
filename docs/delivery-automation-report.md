# Delivery Companies automation report

Branch `test/delivery-companies` (nothing committed). Staging `stg-154` only; no ERP; no production.
Checked on 2026-11-11.

## What is covered

| Spec                                   | Covers                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `delivery-tracking-list`               | Title, breadcrumb, sidebar, 7 columns, row data, company links, empty state, 20 rows per page                                 |
| `delivery-tracking-filters`            | All 7 filters, combined, Search, Reset, clear one, kept across pages, empty results                                           |
| `delivery-tracking-pagination-sorting` | Walk every page (no repeats, none missing), pager buttons, out-of-range page, sort by Date of delivery                        |
| `delivery-tracking-export`             | CSV, Excel 95+, Excel 2007+ contents vs grid and filters, column picker, confirm and cancel, empty export                     |
| `delivery-tracking-link-dialog`        | Edit Link popup: fields, 1,000-character limit, Cancel, validation. Nothing is saved                                          |
| `delivery-company-list`                | Title, columns, the 3 existing companies, ID sort, filters (names, Status), Reset, CSV export                                 |
| `delivery-company-view`                | Details of companies 1 to 3 vs the list, Back, Update visible, unknown ID gives 404                                           |
| `delivery-company-form`                | Required fields, email, 100-character limits, phone formats. Nothing is saved; no create request is sent                      |
| `delivery-company-create`              | The one authorized creation (see below)                                                                                       |
| `delivery-permissions`                 | Six roles: sidebar, page access (200 or 403), rows, Create, View, Update, status dropdown, Delete, Edit Link popup (GET only) |

Last full run: 102 passed, 1 skipped (creation, because the QA-AUTO company already exists), 2 expected failures (TD-01).

## The created company

One QA-AUTO company was created, once, as authorized: **ID 4, status Published**, English name
`QA-AUTO Delivery Test 42140621`. It was not updated, unpublished or deleted and remains in staging.
After saving, the page returns to the list with "Delivery Company has been created." (it does not open
the details page). The first run's check of that outcome used the page snapshot, because my first
assertion expected the details page and failed; the record was not submitted a second time. The
spec was corrected to the real behaviour, and it now skips when a QA-AUTO company exists, so it
cannot create a second one.

Because of that record, the list and filter specs ignore QA-AUTO companies, and the Tracking
Delivery company filter now offers a fourth option with no shipments.

## Defect candidate

- **TD-01** (Jira MAZ-8487: https://ksa-motory.atlassian.net/browse/MAZ-8487) The Date of delivery filter ignores the range: every row is returned. TRK-FLT-10 and
  TRK-FLT-11 are marked `@known-bug` with `test.fail()`.

## Role matrix (observed, matches configuration except where noted)

| Role                                   | Tracking | Companies | Delete link                          |
| -------------------------------------- | -------- | --------- | ------------------------------------ |
| Super Admin                            | yes      | yes       | no (no Delete permission configured) |
| Auction Supervisor                     | yes      | yes       | yes (wildcard `/deliveryCompany/*`)  |
| Auction Team                           | no (403) | yes       | no                                   |
| Customer Support, operation, Marketing | no (403) | no (403)  | no                                   |

## Blocked, pending separate approval

Not run, and not inferred as allowed:

- Saving a Tracking Link and checking it persists; searching Tracking Link by a matching value (no link values exist)
- Updating a company (existing or QA-AUTO), changing Published status, deleting any company
- Write-request permission probes (POST, PUT, PATCH, DELETE)

## Limitations

- All original companies are Published, so the Unpublished filter returns none for them.
- Delete is only reachable through the Supervisor wildcard, and no deletion is exercised.
