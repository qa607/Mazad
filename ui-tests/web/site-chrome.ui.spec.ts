import { expect, test } from '../support/fixtures';
import { runPageChecks } from '../support/page-checks';
import { declineCookieBanner, gotoGuest } from '../support/stabilize';
import { expectLocatorShot } from '../support/visual-assert';

/** Shared site chrome, captured on the home page. */
test.describe('Site chrome', () => {
  test('header', async ({ page, language, findings }) => {
    await gotoGuest(page, `/${language}/`);
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
    await expectLocatorShot(header, 'header.png');
    await runPageChecks(page, findings, { screen: 'header', root: 'header' });
  });

  test('footer', async ({ page, language, findings }) => {
    await gotoGuest(page, `/${language}/`);
    const footer = page.locator('footer').first();
    await expect(footer).toBeVisible();
    await expectLocatorShot(footer, 'footer.png');
    await runPageChecks(page, findings, { screen: 'footer', root: 'footer' });
  });

  test('cookie banner', async ({ page, language, findings }) => {
    await gotoGuest(page, `/${language}/`, { declineCookies: false });
    const banner = page.locator('.cc-window');
    await expect(banner).toBeVisible();
    await expectLocatorShot(banner, 'cookie-banner.png');
    await runPageChecks(page, findings, { screen: 'cookie-banner', root: '.cc-window' });
    await declineCookieBanner(page);
    await expect(banner).toBeHidden();
  });

  test('mobile menu', async ({ page, language, phone, findings }) => {
    test.skip(!phone, 'The burger menu is part of the phone layout (390 and 360 only).');
    await gotoGuest(page, `/${language}/`);
    await page.locator('.burger-menu-open-icon-wrapper:visible').first().click();
    const menu = page.locator('app-mobile-menu');
    await expect(menu).toBeVisible();
    await expectLocatorShot(menu, 'mobile-menu.png');
    await runPageChecks(page, findings, { screen: 'mobile-menu', root: 'app-mobile-menu' });
    await menu.locator('.burger-menu-close-icon-wrapper').first().click();
    await expect(menu).toBeHidden();
  });

  test('language switcher', async ({ page, language }) => {
    await gotoGuest(page, `/${language}/`);
    const toggle = page.locator('footer .toggle-language').first();
    await expect(toggle).toBeVisible();
    await expectLocatorShot(toggle, 'language-switcher.png');
    const other = language === 'en' ? 'ar' : 'en';
    await toggle.click();
    await expect(page).toHaveURL(new RegExp(`/${other}/`));
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${other}`));
  });
});
