import fs from 'node:fs';
import path from 'node:path';
import {
  DEV_ROOT_MISSING_REASON,
  getDevRootAccount,
  getIosDealerId,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { expect, test } from '@fixtures/test.fixture';
import { MazadLoginPage } from '@pages/backend/mazad-login.page';
import { MazadUserDirectoryPage } from '@pages/backend/mazad-user-directory.page';

/**
 * Configures the dedicated Dealer's PHONE in the local .env (IOS_TEST_DEALER_PHONE), READ-ONLY on the
 * staging back office. Runs only with IOS_DEALER_CONFIG=true (project ios-account-report).
 *
 * - Logs in once with the Dev Root admin account, then only GET list pages (every other write
 *   request is aborted); it opens, edits and deletes no record.
 * - Finds the Dealer by its internal ID (IOS_TEST_DEALER_ID from .env), checks the role (it is in the Dealers list) and that it is
 *   active, and writes ONLY its phone to .env. The phone is never printed, attached or saved elsewhere.
 * - Never touches IOS_TEST_DEALER_PASSWORD, OTP_CODE or any other variable. It reports the
 *   outcome with booleans only.
 */
const SUPPLIED_STAGING_OTP = '1111';
const ENV_FILE = path.resolve(__dirname, '..', '.env');

test('configure the dedicated Dealer phone from the staging back office (read-only)', async ({
  browser,
}) => {
  // Writes .env, so it runs only when asked for explicitly.
  test.skip(process.env.IOS_DEALER_CONFIG !== 'true', 'Runs only with IOS_DEALER_CONFIG=true.');
  test.setTimeout(600_000);
  const account = getDevRootAccount();
  if (!account) throw new Error(DEV_ROOT_MISSING_REASON);
  // The Dealer is selected by IOS_TEST_DEALER_ID in .env; no account ID is written in this file.
  const DEALER_ID = getIosDealerId();
  if (!DEALER_ID) {
    throw new Error('IOS_TEST_DEALER_ID is missing or not a valid account ID in the local .env.');
  }
  const context = await browser.newContext({ baseURL: envConfig.baseURL });
  const blocked: string[] = [];
  let loggedIn = false;
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

    // The Dealers list (so the role is dealer), every page, no name filter: the selected Dealer is
    // chosen by its ID in .env, whatever its name.
    await page.goto('/backend/users/dealer/index', { waitUntil: 'domcontentloaded' });
    const summaryText =
      (await page
        .locator('.summary')
        .first()
        .textContent({ timeout: 5000 })
        .catch(() => '')) ?? '';
    const total = Number(/of\s+([\d,]+)\s+items/.exec(summaryText)?.[1]?.replace(/,/g, '') ?? 0);
    if (!total) throw new Error('Could not read the Dealers list size.');
    const rows = await new MazadUserDirectoryPage(page).listCandidates(
      'dealer',
      '',
      Math.ceil(total / 20) + 1,
    );
    const matches = rows.filter((row) => (row.ID ?? '') === DEALER_ID);
    expect(matches.length === 1, 'exactly one Dealers-list row has the chosen ID').toBe(true);
    const row = matches[0];
    expect((row.Status ?? '').toLowerCase() === 'active', 'the chosen Dealer is active').toBe(true);
    const phone = (row.Phone ?? '').replace(/[\s-]/g, '');
    expect(/^\+?\d{9,15}$/.test(phone), 'the phone has a plausible phone format').toBe(true);

    // Write ONLY IOS_TEST_DEALER_PHONE, keeping every other line (and the file mode) as it is.
    const before = fs.readFileSync(ENV_FILE, 'utf8');
    const line = `IOS_TEST_DEALER_PHONE=${phone}`;
    const hasLine = /^IOS_TEST_DEALER_PHONE=.*$/m.test(before);
    const after = hasLine
      ? before.replace(/^IOS_TEST_DEALER_PHONE=.*$/m, () => line)
      : `${before}${before.endsWith('\n') ? '' : '\n'}${line}\n`;
    const mode = fs.statSync(ENV_FILE).mode & 0o777;
    const temp = `${ENV_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temp, after, { mode });
    fs.renameSync(temp, ENV_FILE);

    // Outcome, booleans only.
    const env = fs.readFileSync(ENV_FILE, 'utf8');
    const otp = /^OTP_CODE=(.*)$/m
      .exec(env)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, '');
    console.log(
      JSON.stringify({
        dealerIdLoadedFromEnv: true,
        inDealersList: true,
        active: true,
        phoneWrittenToEnv: /^IOS_TEST_DEALER_PHONE=\S+$/m.test(env),
        phoneVariableWasPresentBefore: hasLine,
        passwordVariableSet: /^IOS_TEST_DEALER_PASSWORD=\S+/m.test(env),
        otpCodeEqualsSuppliedStagingValue: otp === SUPPLIED_STAGING_OTP,
        nonGetRequestsAborted: blocked.length,
      }),
    );
    expect(blocked.length === 0, 'no non-GET request was attempted').toBe(true);
  } finally {
    await context.close();
  }
});

/**
 * READ-ONLY view of the configured Dealer's back-office record (runs only with IOS_DEALER_RECORD=true),
 * to gather evidence for the account confirmations. It opens the record's view page with a GET (any
 * other write request is aborted), clicks nothing, and prints a MASKED summary: field labels, an
 * allowlist of non-sensitive values (status, dates, amounts, flags), and only the LENGTH and keyword
 * flags of free text. No name, phone, email or note text is printed or saved.
 */
const RECORD_VALUE_ALLOWLIST =
  /status|type|verified|verification|registration|deposit|promissory|insurance|joining|joined|created|updated|last|active|blocked|balance|bids?|wins?|auctions?|saudi|country|city|role|source|channel|hold|reviewed/i;
const SENSITIVE_LABEL =
  /name|phone|mobile|email|e-mail|address|iban|bank|id number|national|identity|commercial|cr\b|vat|tax|password|token|otp|contact|representative|rep\b/i;
const FREE_TEXT_LABEL = /note|comment|remark|description|reason|memo|internal/i;

test('view the dedicated Dealer record (read-only, masked)', async ({ browser }) => {
  test.skip(process.env.IOS_DEALER_RECORD !== 'true', 'Runs only with IOS_DEALER_RECORD=true.');
  test.setTimeout(240_000);
  const account = getDevRootAccount();
  if (!account) throw new Error(DEV_ROOT_MISSING_REASON);
  const DEALER_ID = getIosDealerId();
  if (!DEALER_ID)
    throw new Error('IOS_TEST_DEALER_ID is missing or not a valid account ID in the local .env.');
  const context = await browser.newContext({ baseURL: envConfig.baseURL });
  const blocked: string[] = [];
  let loggedIn = false;
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

    // Open the record's view page by ID (a GET). No action link on the page is ever followed.
    const viewHref = `/backend/users/dealer/view?id=${DEALER_ID}`;
    const hrefs: string[] = [];
    const summary: Record<string, unknown> = {
      actionLinkKinds: hrefs.map((h) =>
        (
          h.match(/\/(view|update|edit|delete|block|activate|[a-z-]+)(?:[/?]|$)/i)?.[1] ?? 'other'
        ).toLowerCase(),
      ),
      viewLinkFound: Boolean(viewHref),
    };
    if (viewHref) {
      await page.goto(viewHref, { waitUntil: 'domcontentloaded' });
      summary.viewPath = new URL(viewHref, envConfig.baseURL).pathname;
      // Label/value pairs, read from the DOM (read-only). The layout is unknown, so three shapes are
      // tried: table rows (th/td), definition lists, and a label element followed by a value element.
      const pairs = await page.evaluate(() => {
        const clean = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
        const out: [string, string][] = [];
        document.querySelectorAll('table tr').forEach((tr) => {
          const th = tr.querySelector(':scope > th');
          const td = tr.querySelector(':scope > td');
          if (th && td) out.push([clean(th.textContent), clean(td.textContent)]);
        });
        document.querySelectorAll('dl').forEach((dl) => {
          dl.querySelectorAll('dt').forEach((dt) => {
            const dd = dt.nextElementSibling;
            if (dd) out.push([clean(dt.textContent), clean(dd.textContent)]);
          });
        });
        document
          .querySelectorAll(
            'label, .control-label, .form-label, .col-form-label, strong, b, .detail-label, .info-label',
          )
          .forEach((el) => {
            const label = clean(el.textContent).replace(/:$/, '');
            if (!label || label.length > 40) return;
            // A form-style record: the value is the control's value (never a password field).
            const forId = (el as HTMLLabelElement).htmlFor;
            const control =
              (forId ? document.getElementById(forId) : null) ??
              el.parentElement?.querySelector('input, select, textarea') ??
              null;
            let value: string;
            if (control instanceof HTMLSelectElement) {
              value = clean(control.selectedOptions[0]?.textContent);
            } else if (
              control instanceof HTMLInputElement ||
              control instanceof HTMLTextAreaElement
            ) {
              value =
                control instanceof HTMLInputElement && control.type === 'password'
                  ? ''
                  : clean(control.value);
            } else {
              const next = el.nextElementSibling;
              value = next
                ? clean(next.textContent)
                : clean(el.parentElement?.textContent).replace(label, '').trim();
            }
            out.push([label, value.slice(0, 400)]);
          });
        return out;
      });
      const seenLabels = new Set<string>();
      const unique = pairs.filter(
        ([label]) => label && !seenLabels.has(label) && seenLabels.add(label),
      );
      const headings = await page
        .locator('h1, h2, h3, h4, .nav-tabs a, .card-title, .card-header')
        .allTextContents();
      summary.sections = headings
        .map((h) => h.replace(/\s+/g, ' ').trim())
        .filter((h) => h && h.length <= 60)
        .slice(0, 30);
      summary.labelCount = unique.length;
      summary.fields = unique.map(([label, value]) => {
        const free = FREE_TEXT_LABEL.test(label);
        const sensitive = SENSITIVE_LABEL.test(label) && !free;
        const showValue = RECORD_VALUE_ALLOWLIST.test(label) && !sensitive && !free;
        return {
          label: label.slice(0, 50),
          value: showValue
            ? value.slice(0, 60)
            : sensitive
              ? '[masked]'
              : free
                ? '[free text]'
                : '[not shown]',
          ...(sensitive ||
          /district|street|building|zip|additional|unit|legal|file|image/i.test(label)
            ? { filled: value.length > 0 }
            : {}),
          ...(free
            ? {
                length: value.length,
                mentionsTest: /test|qa|automation|demo|اختبار|تجريب/i.test(value),
              }
            : {}),
        };
      });
      // Optional: compare the record's names with a name the owner supplied (read from a file, so it is
      // never on a command line or in a log). Only yes/no results are reported, never the names.
      const compareFile = process.env.IOS_COMPARE_NAME_FILE;
      if (compareFile) {
        const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();
        const expected = normalize(fs.readFileSync(compareFile, 'utf8'));
        const valueOf = (label: string) => normalize(unique.find(([l]) => l === label)?.[1] ?? '');
        summary.nameCheck = {
          recordIdIsTheConfiguredOne: true,
          arabicNameMatches: expected.length > 0 && valueOf('Arabic Name') === expected,
          englishNameMatches: expected.length > 0 && valueOf('English Name') === expected,
          bothFieldsAreIdentical: valueOf('Arabic Name') === valueOf('English Name'),
        };
      }
      summary.pageMentionsTestOrQa = /\b(test|qa|automation|demo)\b|اختبار|تجريب/i.test(
        unique.map(([, v]) => v).join(' '),
      );
    }
    summary.nonGetRequestsAborted = blocked.length;
    console.log(`RECORD ${JSON.stringify(summary)}`);
    expect(blocked.length === 0, 'no non-GET request was attempted').toBe(true);
  } finally {
    await context.close();
  }
});

/**
 * READ-ONLY lookup of a phone number in the Dealers list (runs only with IOS_LOOKUP_PHONE_FILE set to a
 * file that holds the number, so the number never appears on a command line, in a log or in a report).
 * Reports only whether it was found and the matching account's ID, status, join date and insurance
 * summary. GET list pages only; any other write request is aborted.
 */
test('look up a phone number in the Dealers list (read-only, masked)', async ({ browser }) => {
  const file = process.env.IOS_LOOKUP_PHONE_FILE;
  test.skip(!file, 'Runs only with IOS_LOOKUP_PHONE_FILE set.');
  test.setTimeout(600_000);
  const wanted = fs.readFileSync(file as string, 'utf8').replace(/\D/g, '');
  if (wanted.length < 9) throw new Error('The lookup file does not hold a plausible phone number.');
  const tail = wanted.slice(-9);
  const account = getDevRootAccount();
  if (!account) throw new Error(DEV_ROOT_MISSING_REASON);
  const context = await browser.newContext({ baseURL: envConfig.baseURL });
  const blocked: string[] = [];
  let loggedIn = false;
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
    const directory = new MazadUserDirectoryPage(page);
    const found: Record<string, string>[] = [];
    for (const role of ['dealer', 'individual'] as const) {
      await page.goto(
        role === 'dealer' ? '/backend/users/dealer/index' : '/backend/users/individual/index',
        {
          waitUntil: 'domcontentloaded',
        },
      );
      const summaryText =
        (await page
          .locator('.summary')
          .first()
          .textContent({ timeout: 5000 })
          .catch(() => '')) ?? '';
      const total = Number(/of\s+([\d,]+)\s+items/.exec(summaryText)?.[1]?.replace(/,/g, '') ?? 0);
      if (!total) throw new Error('Could not read the list size.');
      const rows = await directory.listCandidates(role, '', Math.ceil(total / 20) + 1);
      for (const row of rows) {
        const digits = (row.Phone ?? '').replace(/\D/g, '');
        if (digits.endsWith(tail) && /^\d+$/.test(row.ID ?? '')) {
          found.push({
            role,
            id: row.ID,
            status: row.Status ?? '',
            joined: (row['Joining Date'] ?? '').slice(0, 10),
            insurance: row['Total insurance amount'] ?? '',
            verified: row.Verified ?? '',
            registration: row['Registration Type'] ?? '',
          });
        }
      }
      // Stop after the Dealers list when the number is already found there.
      if (found.length) break;
    }
    console.log(
      `LOOKUP ${JSON.stringify({ matches: found, nonGetRequestsAborted: blocked.length })}`,
    );
    expect(blocked.length === 0, 'no non-GET request was attempted').toBe(true);
  } finally {
    await context.close();
  }
});
