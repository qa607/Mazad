import type { Page } from '@playwright/test';
import { getTranslator, type Translator } from '@locales';
import { typeDummyPassword } from '../support/dummy-input';
import { expect, test } from '../support/fixtures';
import { commonContainer } from '../support/form-geometry';
import { runPageChecks } from '../support/page-checks';
import { observeBrowserBack } from '../support/history';
import { gotoGuest, stabilize } from '../support/stabilize';
import { expectLocatorShot, expectPageShot } from '../support/visual-assert';

/**
 * Website Login and Forgot Password: display and navigation only.
 * Never submitted: the phone field stays empty, Login and Send are asserted disabled and never
 * clicked. The only typing is the approved dummy value in the password field
 * (password-visibility test). The guest guard halts the run on any request other than GET/HEAD.
 * Strings come from src/locales (recorded from staging).
 */

/** Extra CSS px around form crops, so text at the form's edge is never cut by the screenshot. */
const FORM_PADDING = 8;

const PHONE = '#login-mobile-number';
const PASSWORD = '#login-password';

const exact = (text: string) =>
  new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

function view(page: Page, t: Translator) {
  return {
    phone: page.locator(PHONE),
    password: page.locator(PASSWORD),
    login: page
      .locator('button')
      .filter({ hasText: exact(t('login')) })
      .first(),
    forgot: page
      .locator('button')
      .filter({ hasText: exact(t('forgotPassword')) })
      .first(),
    createAccount: page.getByRole('link', { name: t('createAccount') }).first(),
    resetHeading: page.getByText(t('resetPasswordHeading'), { exact: true }).first(),
    send: page
      .locator('button')
      .filter({ hasText: exact(t('send')) })
      .first(),
  };
}

type View = ReturnType<typeof view>;

async function expectLoginView(v: View): Promise<void> {
  await expect(v.phone).toBeVisible();
  await expect(v.phone).toHaveValue('');
  await expect(v.password).toBeVisible();
  await expect(v.login).toBeVisible();
  await expect(v.login).toBeDisabled();
  await expect(v.forgot).toBeVisible();
}

async function openForgotPassword(page: Page, v: View, language: string): Promise<void> {
  await v.forgot.click();
  await stabilize(page, { declineCookies: false });
  await expect(page).toHaveURL(new RegExp(`/${language}/login/?$`));
  await expect(v.resetHeading).toBeVisible();
  await expect(v.phone).toBeVisible();
  await expect(v.phone).toHaveValue('');
  await expect(v.send).toBeVisible();
  await expect(v.send).toBeDisabled();
  await expect(v.password).toBeHidden();
}

/**
 * Finds a clickable element and tags it with data-ui-target. Refuses submit buttons inside a
 * form, which could submit it. Returns 'found', 'none' or 'submit'.
 */
async function tagClickable(
  page: Page,
  kind: 'password-toggle' | 'back',
  labels: string[],
): Promise<'found' | 'none' | 'submit'> {
  return page.evaluate(
    ({ kind, labels, password }) => {
      document
        .querySelectorAll('[data-ui-target]')
        .forEach((e) => e.removeAttribute('data-ui-target'));
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      let found: Element | null = null;
      if (kind === 'password-toggle') {
        // An icon or button next to the password input, within 4 ancestor levels.
        const input = document.querySelector(password);
        let scope: Element | null = input?.parentElement ?? null;
        const sel =
          'button, [role="button"], mat-icon, i, svg, img, [class*="eye" i], [class*="toggle" i], [class*="visib" i], [class*="show" i]';
        for (let i = 0; scope && i < 4 && !found; i++, scope = scope.parentElement) {
          found =
            [...scope.querySelectorAll(sel)].find(
              (el) => visible(el) && el !== input && !el.contains(input),
            ) ?? null;
        }
      } else {
        const text = (el: Element) => (el.textContent ?? '').trim().replace(/\s+/g, ' ');
        found =
          [
            ...document.querySelectorAll(
              'button, a, [role="button"], [class*="back" i], [aria-label]',
            ),
          ].find(
            (el) =>
              visible(el) &&
              !el.closest('header, footer') &&
              (/back|arrow/i.test(typeof el.className === 'string' ? el.className : '') ||
                /back|رجوع|عودة/i.test(el.getAttribute('aria-label') ?? '') ||
                labels.includes(text(el)) ||
                /^(back|رجوع|العودة|عودة)\b/i.test(text(el))),
          ) ?? null;
      }
      if (!found) return 'none';
      const target = found.closest('button, a, [role="button"]') ?? found;
      if (target instanceof HTMLButtonElement && target.type === 'submit' && target.form)
        return 'submit';
      target.setAttribute('data-ui-target', kind);
      return 'found';
    },
    { kind, labels, password: PASSWORD },
  );
}

test.describe('Login and Forgot Password', () => {
  test('login view', async ({ page, language, findings }) => {
    const v = view(page, getTranslator(language));
    await gotoGuest(page, `/${language}/login/`);
    await expectLoginView(v);
    await expect.soft(v.createAccount, 'create-account link is shown (not clicked)').toBeVisible();

    await expectPageShot(page, 'login.png');
    const form = await commonContainer(page, 'login-form', [v.phone, v.password, v.login]);
    await expectLocatorShot(form, 'login-form.png', { padding: FORM_PADDING });
    await runPageChecks(page, findings, {
      screen: 'login',
      form: { fields: [v.phone, v.password], primary: v.login },
    });
  });

  test('password visibility', async ({ page, language, findings }) => {
    const v = view(page, getTranslator(language));
    await gotoGuest(page, `/${language}/login/`);
    await expectLoginView(v);
    const form = await commonContainer(page, 'login-form', [v.phone, v.password, v.login]);

    await typeDummyPassword(v.password);
    await expect(v.password).toHaveAttribute('type', 'password');
    await expect(v.phone).toHaveValue('');
    await expect(v.login, 'Login stays disabled with the phone empty').toBeDisabled();
    await expectLocatorShot(form, 'password-hidden.png', { padding: FORM_PADDING });

    const toggle = await tagClickable(page, 'password-toggle', []);
    if (toggle !== 'found') {
      findings.add({
        screen: 'login',
        component: `${PASSWORD} (visibility control)`,
        rule: toggle === 'submit' ? 'password-toggle-is-submit' : 'no-password-toggle',
        severity: 'review',
        expected: 'a show/hide password control that does not submit the form',
        actual:
          toggle === 'submit'
            ? 'the only control found is a submit button; not clicked'
            : 'none found',
        screenshot: 'password-hidden.png',
      });
    } else {
      const control = page.locator('[data-ui-target="password-toggle"]');
      await control.click();
      await expect(v.password).toHaveAttribute('type', 'text');
      await expect(v.password).toHaveValue('Visual-Check-1');
      await expect(v.login).toBeDisabled();
      await expectLocatorShot(form, 'password-shown.png', { padding: FORM_PADDING });
      await runPageChecks(page, findings, {
        screen: 'login-password-shown',
        form: { fields: [v.phone, v.password], primary: v.login },
      });

      await control.click();
      await expect(v.password).toHaveAttribute('type', 'password');
    }
    await expect(v.phone).toHaveValue('');
    await expect(v.login, 'Login stays disabled after the visibility check').toBeDisabled();
  });

  test('forgot password view', async ({ page, language, findings }) => {
    const v = view(page, getTranslator(language));
    await gotoGuest(page, `/${language}/login/`);
    await expectLoginView(v);
    await openForgotPassword(page, v, language);

    await expectPageShot(page, 'forgot-password.png');
    const form = await commonContainer(page, 'forgot-form', [v.resetHeading, v.phone, v.send]);
    await expectLocatorShot(form, 'forgot-password-form.png', { padding: FORM_PADDING });
    await runPageChecks(page, findings, {
      screen: 'forgot-password',
      form: { fields: [v.phone], primary: v.send },
    });
  });

  test('navigation: login to forgot password and back', async ({ page, language, findings }) => {
    const t = getTranslator(language);
    const v = view(page, t);
    await gotoGuest(page, `/${language}/login/`);
    await expectLoginView(v);
    await openForgotPassword(page, v, language);

    const back = await tagClickable(page, 'back', [t('login')]);
    if (back !== 'found') {
      findings.add({
        screen: 'forgot-password',
        component: 'back to login control',
        rule: back === 'submit' ? 'back-control-is-submit' : 'no-back-control',
        severity: 'review',
        expected: 'an in-page control that returns to Login',
        actual:
          back === 'submit'
            ? 'the only control found is a submit button; not clicked'
            : 'none found',
        screenshot: 'forgot-password.png',
      });
    } else {
      const control = page.locator('[data-ui-target="back"]');
      test.info().annotations.push({
        type: 'back-control',
        description: (await control.evaluate((el) => el.outerHTML.slice(0, 200))) ?? '',
      });
      await control.click();
      await stabilize(page, { declineCookies: false });
      await expectLoginView(v);
      await expect(v.resetHeading).toBeHidden();
    }
    await expect(page).toHaveURL(new RegExp(`/${language}/login/?$`));
  });

  // Observation only: what browser Back does from Forgot Password. No behaviour is assumed;
  // the result is recorded as a review finding for product clarification. The login page is
  // opened directly in a new tab, so the only earlier history entry is the blank tab.
  test('navigation: browser back from forgot password', async ({ page, language, findings }) => {
    const v = view(page, getTranslator(language));
    await gotoGuest(page, `/${language}/login/`);
    await expectLoginView(v);

    const seen = await observeBrowserBack(page, () => openForgotPassword(page, v, language));
    let shown = 'a different page';
    if (seen.stayedOnSameUrl) {
      const login = await v.password.isVisible();
      const forgot = await v.resetHeading.isVisible();
      shown =
        login && !forgot ? 'the Login view' : forgot ? 'the Forgot Password view' : 'neither view';
    }
    const added = seen.historyLengthAfterOpen - seen.historyLengthBefore;
    test.info().annotations.push({ type: 'browser-back', description: JSON.stringify(seen) });
    findings.add({
      screen: 'forgot-password',
      component: 'browser Back',
      rule: 'browser-back-observed',
      severity: 'review',
      expected: 'to be confirmed by product (observation only)',
      actual:
        `opening Forgot Password added ${added} history entr${added === 1 ? 'y' : 'ies'}; ` +
        `Back went from ${seen.urlAfterOpen} to ${seen.urlAfterBack}` +
        (seen.stayedOnSameUrl ? ` and shows ${shown}` : ' (left the login page)'),
      screenshot: 'forgot-password.png',
    });
  });
});
