import fs from 'node:fs';
import path from 'node:path';
import {
  DEV_ROOT_MISSING_REASON,
  getDevRootAccount,
  testAccountNameFilter,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { expect, test } from '@fixtures/test.fixture';
import { MazadLoginPage } from '@pages/backend/auth/mazad-login.page';
import { MazadUserDirectoryPage } from '@pages/backend/mazad-user-directory.page';
import { maskPhone } from '@mobile/ios/account/recovery-journal';

/**
 * Masked, READ-ONLY report of dealer account candidates in the staging back office (project
 * ios-account-report, only with IOS_ACCOUNT_REPORT=true). It logs in once with the Dev Root
 * account from .env, lists EVERY dealer whose name matches the filter (none is chosen), and
 * writes reports/ios-account-report/<time>.json with the internal ID, status, a masked name and
 * a masked phone. After the login every request that is not a GET is aborted. It never opens,
 * edits or deletes a record, and never attaches or prints an unmasked name or phone.
 * The QA owner decides which account (if any) is synthetic and dedicated.
 */
const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-account-report');

const maskName = (name: string) =>
  name.length < 3
    ? '[short]'
    : `${name[0]}${'*'.repeat(name.length - 2)}${name.at(-1)} (${name.length} characters)`;

test('dealer account candidates (masked, read-only)', async ({ browser }, testInfo) => {
  test.setTimeout(900_000); // the unfiltered dealer list spans many pages (read-only GETs)
  const account = getDevRootAccount();
  if (!account) throw new Error(DEV_ROOT_MISSING_REASON);
  // Staging only: envConfig is restricted to the approved staging origin (TEST_ENV).
  const context = await browser.newContext({ baseURL: envConfig.baseURL });
  const blocked: string[] = [];
  let loggedIn = false;
  // Read-only guard: only the login POST may go out; any other non-GET is aborted and reported.
  await context.route('**/*', async (route) => {
    const request = route.request();
    const isLogin =
      request.method() === 'POST' && new URL(request.url()).pathname === MazadLoginPage.path;
    if (request.method() !== 'GET' && request.method() !== 'HEAD' && !(isLogin && !loggedIn)) {
      blocked.push(`${request.method()} ${new URL(request.url()).pathname}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  try {
    const page = await context.newPage();
    const loginPage = new MazadLoginPage(page);
    await loginPage.goto();
    await loginPage.loginAs(account);
    await page.waitForURL((url) => !url.pathname.includes('/authentication/login'));
    loggedIn = true;
    if (process.env.DEALER_PROBE === 'true') {
      // Read-only probe of the dealer list page: size, page count and the filter fields it offers.
      await page.goto('/backend/users/dealer/index', { waitUntil: 'domcontentloaded' });
      const summary =
        (await page
          .locator('.summary')
          .first()
          .textContent({ timeout: 3000 })
          .catch(() => '')) ?? '';
      const lastHref =
        (await page
          .locator('.pagination li.last a')
          .first()
          .getAttribute('href', { timeout: 3000 })
          .catch(() => null)) ?? '';
      const fields = await page
        .locator('table thead tr:nth-child(2) input, table thead tr:nth-child(2) select')
        .evaluateAll((els) =>
          els.map((e) => ({
            name: e.getAttribute('name'),
            options:
              e.tagName === 'SELECT'
                ? [...e.querySelectorAll('option')].map(
                    (o) => `${o.getAttribute('value')}=${o.textContent?.trim()}`,
                  )
                : undefined,
          })),
        );
      console.log(`PROBE summary: ${summary.replace(/\s+/g, ' ').trim()}`);
      console.log(`PROBE last page link: ${lastHref}`);
      console.log(`PROBE filters: ${JSON.stringify(fields)}`);
      return;
    }

    // The project's own filter first, then a few other plain words a test account may carry. Each
    // search is a read-only GET of the list; nothing is opened, edited or used.
    const patterns = [...new Set([testAccountNameFilter(), 'qa', 'demo', 'automation'])];
    const directory = new MazadUserDirectoryPage(page);
    const roles: Array<'dealer' | 'individual'> = ['dealer', 'individual'];
    const result: Record<string, unknown> = {};
    let allColumns: string[] = [];
    for (const role of roles) {
      const seen = new Map<string, Record<string, string>>();
      const words = new Map<string, string[]>();
      const perPattern: Record<string, number> = {};
      for (const pattern of patterns) {
        const rows = await directory.listCandidates(role, pattern);
        const columns = Object.keys(rows[0] ?? {});
        if (columns.length > allColumns.length) allColumns = columns;
        const idCol = columns.find((c) => /^id$/i.test(c));
        const statusCol = columns.find((c) => /status|الحالة/i.test(c));
        let matched = 0;
        for (const row of rows) {
          const id = idCol ? (row[idCol] ?? '') : '';
          // Only real account rows: the list also contains nested-table fragments.
          if (!/^\d+$/.test(id) || (statusCol ? (row[statusCol] ?? '') : '') === '') continue;
          matched++;
          seen.set(id, row);
          words.set(id, [...new Set([...(words.get(id) ?? []), pattern])]);
        }
        perPattern[pattern] = matched;
      }
      const sample = [...seen.values()][0] ?? {};
      const columns = Object.keys(sample);
      const find = (re: RegExp) => columns.find((c) => re.test(c));
      const col = {
        id: find(/^id$/i),
        status: find(/status|الحالة/i),
        arabicName: find(/arabic name|الاسم/i),
        englishName: find(/english name/i),
        company: find(/company name/i),
        joined: find(/joining/i),
        verified: find(/^verified$/i),
        registrationType: find(/registration type/i),
        phone: find(/phone|mobile|جوال|الهاتف/i),
      };
      const cell = (row: Record<string, string>, c: string | undefined) =>
        c ? (row[c] ?? '') : '';
      const candidates = [...seen.values()].map((row) => ({
        id: cell(row, col.id),
        matchedSearchWords: words.get(cell(row, col.id)) ?? [],
        status: cell(row, col.status),
        maskedArabicName: cell(row, col.arabicName) ? maskName(cell(row, col.arabicName)) : '',
        maskedEnglishName: cell(row, col.englishName) ? maskName(cell(row, col.englishName)) : '',
        maskedCompany: cell(row, col.company) ? maskName(cell(row, col.company)) : '',
        joiningDate: cell(row, col.joined),
        verified: cell(row, col.verified),
        registrationType: cell(row, col.registrationType),
        maskedPhone: cell(row, col.phone) ? maskPhone(cell(row, col.phone)) : '',
      }));
      result[role] = {
        count: candidates.length,
        matchesPerSearchWord: perPattern,
        candidates,
      };
    }
    // Every dealer, with NO name filter (owner decision 2026-11-09). Read-only list pages only; still masked.
    {
      // The list repeats its last page past the end, so the page count comes from the summary.
      await page.goto('/backend/users/dealer/index', { waitUntil: 'domcontentloaded' });
      const summaryText =
        (await page
          .locator('.summary')
          .first()
          .textContent({ timeout: 5000 })
          .catch(() => '')) ?? '';
      const total = Number(/of\s+([\d,]+)\s+items/.exec(summaryText)?.[1]?.replace(/,/g, '') ?? 0);
      if (!total) throw new Error('Could not read the dealer count from the list summary.');
      const rows = await directory.listCandidates('dealer', '', Math.ceil(total / 20) + 1);
      const columns = Object.keys(rows[0] ?? {});
      const find = (re: RegExp) => columns.find((c) => re.test(c));
      const c = {
        id: find(/^id$/i),
        status: find(/status|الحالة/i),
        arabicName: find(/arabic name/i),
        englishName: find(/english name/i),
        verified: find(/^verified$/i),
        registrationType: find(/registration type/i),
        insurance: find(/insurance/i),
        saudi: find(/saudi/i),
        joined: find(/joining/i),
        phone: find(/phone|mobile/i),
      };
      const cell = (row: Record<string, string>, col: string | undefined) =>
        col ? (row[col] ?? '') : '';
      const unique = new Map<string, Record<string, string>>();
      for (const row of rows) {
        const id = cell(row, c.id);
        if (/^\d+$/.test(id) && cell(row, c.status) !== '') unique.set(id, row);
      }
      const all = [...unique.values()].map((row) => ({
        id: cell(row, c.id),
        status: cell(row, c.status),
        verified: cell(row, c.verified),
        registrationType: cell(row, c.registrationType),
        totalInsuranceAmount: cell(row, c.insurance),
        saudi: cell(row, c.saudi),
        joiningDate: cell(row, c.joined),
        maskedEnglishName: cell(row, c.englishName) ? maskName(cell(row, c.englishName)) : '',
        maskedPhone: cell(row, c.phone) ? maskPhone(cell(row, c.phone)) : '',
      }));
      const byStatus: Record<string, number> = {};
      for (const a of all) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      result.dealerUnfiltered = {
        totalRows: rows.length,
        uniqueDealers: all.length,
        byStatus,
        // Only the active ones.
        active: all.filter((a) => a.status.toLowerCase() === 'active'),
      };
    }
    const report = {
      generatedAt: new Date().toISOString(),
      environment: 'stg-154',
      searchWords: patterns,
      note: 'Read-only discovery. Every match is listed masked; none is selected or used. Whether one is synthetic and dedicated is the QA owner decision.',
      columns: allColumns,
      ...result,
      nonGetRequestsAborted: blocked,
    };
    fs.mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });
    const file = path.join(OUT_DIR, `${report.generatedAt.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await testInfo.attach('masked-account-candidates.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    console.log(`Masked account candidates saved: ${file}`);
    expect(blocked, 'non-GET requests aborted').toEqual([]);
  } finally {
    await context.close();
  }
});
