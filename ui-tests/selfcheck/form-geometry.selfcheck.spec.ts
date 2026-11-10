import type { Page } from '@playwright/test';
import { DUMMY_PASSWORD, typeDummyPassword } from '../support/dummy-input';
import { expect, test } from '../support/fixtures';
import { commonContainer, findFormGeometryIssues } from '../support/form-geometry';
import { paddedClip } from '../support/visual-assert';

/** Synthetic login-like forms; each rule must fire on a known defect and stay quiet otherwise. */
const form = (opts: { dir: 'ltr' | 'rtl'; style?: string; boxDir?: string; extra?: string }) => `
<!doctype html><html lang="${opts.dir === 'rtl' ? 'ar' : 'en'}" dir="${opts.dir}">
<body style="margin:0;font:16px sans-serif">
  <div id="form" style="width:300px;margin:40px;${opts.style ?? ''}">
    <label for="p" style="display:block;margin-bottom:6px">Phone</label>
    <div style="display:flex;border:1px solid #888;height:40px;${opts.boxDir ?? ''}">
      <span style="width:50px">+966</span><input id="p" style="border:0;flex:1;min-width:0">
    </div>
    <label for="w" style="display:block;margin:16px 0 6px">Password</label>
    <div style="display:flex;border:1px solid #888;height:40px">
      <input id="w" type="password" style="border:0;flex:1;min-width:0">
      <button type="button" style="width:32px;height:32px">o</button>
    </div>
    <button id="go" style="display:block;width:300px;height:44px;margin-top:16px;box-sizing:border-box">Go</button>
  </div>
  ${opts.extra ?? ''}
</body></html>`;

const rulesOf = async (page: Page, language: 'en' | 'ar') =>
  (
    await findFormGeometryIssues(page, {
      fields: [page.locator('#p'), page.locator('#w')],
      primary: page.locator('#go'),
      language,
    })
  ).map((i) => i.rule);

test.describe('Form geometry (selfcheck)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
  });

  test('clean LTR and RTL forms have no issues', async ({ page }) => {
    await page.setContent(form({ dir: 'ltr' }));
    expect(await rulesOf(page, 'en')).toEqual([]);
    await page.setContent(form({ dir: 'rtl' }));
    expect(await rulesOf(page, 'ar')).toEqual([]);
  });

  test('flags off-screen form, overlap, unaligned edges, label offset and small targets', async ({
    page,
  }) => {
    const broken = form({ dir: 'ltr', style: 'margin-left:600px' })
      .replace(
        'display:block;margin-bottom:6px',
        'display:block;margin-bottom:6px;padding-left:20px',
      )
      .replace(
        'width:300px;height:44px;margin-top:16px',
        'width:200px;height:44px;margin-top:-30px',
      )
      .replace('width:32px;height:32px', 'width:12px;height:12px');
    await page.setContent(broken);
    expect(await rulesOf(page, 'en')).toEqual(
      expect.arrayContaining([
        'form-off-screen',
        'controls-overlap',
        'edges-not-aligned',
        'label-misaligned',
        'tap-target-small',
      ]),
    );
  });

  test('flags field parts laid out against the reading direction', async ({ page }) => {
    await page.setContent(form({ dir: 'rtl', boxDir: 'direction:ltr' }));
    expect(await rulesOf(page, 'ar')).toContain('direction-order');
  });

  test('commonContainer tags the smallest element holding all parts', async ({ page }) => {
    await page.setContent(form({ dir: 'ltr' }));
    const container = await commonContainer(page, 'probe-form', [
      page.locator('#p'),
      page.locator('#go'),
    ]);
    await expect(container).toHaveAttribute('id', 'form');
  });
});

test.describe('Dummy password input (selfcheck)', () => {
  test('types only into #login-password of type password', async ({ page }) => {
    await page.setContent(`
      <input id="login-mobile-number" type="tel">
      <input id="other" type="password">
      <input id="login-password" type="password">`);
    await expect(typeDummyPassword(page.locator('#login-mobile-number'))).rejects.toThrow(
      /only types into/,
    );
    await expect(typeDummyPassword(page.locator('#other'))).rejects.toThrow(/only types into/);
    await expect(page.locator('#login-mobile-number')).toHaveValue('');
    await typeDummyPassword(page.locator('#login-password'));
    await expect(page.locator('#login-password')).toHaveValue(DUMMY_PASSWORD);
  });
});

/** WCAG 2.2 SC 2.5.8 spacing exception: a page with one input, one small target and a button. */
const tapPage = (linkMarginTop: number, extra = '') => `
<!doctype html><html lang="en" dir="ltr"><body style="margin:0;font:16px sans-serif">
  <div id="form" style="width:300px;margin:40px">
    <label for="p" style="display:block;margin-bottom:6px">Phone</label>
    <input id="p" style="display:block;width:300px;height:40px;box-sizing:border-box">
    <a id="small" href="#" style="display:block;width:fit-content;margin-top:${linkMarginTop}px;height:21px;line-height:21px">Forgot</a>
    ${extra}
    <button id="go" style="display:block;width:300px;height:44px;margin-top:30px;box-sizing:border-box">Go</button>
  </div>
</body></html>`;

const tapIssues = async (page: Page) =>
  (
    await findFormGeometryIssues(page, {
      fields: [page.locator('#p')],
      primary: page.locator('#go'),
      language: 'en',
    })
  ).filter((i) => i.rule.startsWith('tap-target'));

test.describe('Tap targets: WCAG 2.5.8 spacing exception (selfcheck)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
  });

  test('passes: a 21px-tall link with 20px clear above and 30px below', async ({ page }) => {
    await page.setContent(tapPage(20));
    const issues = await tapIssues(page);
    expect(issues.map((i) => i.rule)).toEqual(['tap-target-small-spaced']);
    expect(issues[0].actual).toMatch(/meets the spacing exception/);
  });

  test('fails: directly under the input, the 24px circle overlaps it', async ({ page }) => {
    await page.setContent(tapPage(0));
    const issues = await tapIssues(page);
    expect(issues.map((i) => i.rule)).toEqual(['tap-target-small']);
    expect(issues[0].actual).toMatch(/circle overlaps input#p/);
  });

  test('fails: two small targets whose circles overlap each other', async ({ page }) => {
    const pair =
      '<div style="margin-top:30px"><button id="s1" style="width:16px;height:16px;padding:0">a</button>' +
      '<button id="s2" style="width:16px;height:16px;padding:0;margin-left:4px">b</button></div>';
    await page.setContent(tapPage(20, pair));
    const byTarget = (await tapIssues(page)).map((i) => `${i.rule} ${i.component.split(' ')[0]}`);
    expect(byTarget).toEqual(
      expect.arrayContaining(['tap-target-small button#s1', 'tap-target-small button#s2']),
    );
    const s1 = (await tapIssues(page)).find((i) => i.component.startsWith('button#s1'));
    expect(s1?.actual).toMatch(/circle of button#s2/);
  });

  test('no finding for targets of at least 24x24px', async ({ page }) => {
    await page.setContent(
      tapPage(20).replace(
        'height:21px;line-height:21px',
        'height:24px;line-height:24px;min-width:24px',
      ),
    );
    expect(await tapIssues(page)).toEqual([]);
  });
});

test.describe('Padded form crop (selfcheck)', () => {
  test('grows the element box by the padding and stays inside the page', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await page.setContent(`<body style="margin:0">
      <div id="mid" style="position:absolute;left:50px;top:60px;width:100px;height:40px"></div>
      <div id="corner" style="position:absolute;left:0;top:0;width:20px;height:20px"></div>
      <div id="edge" style="position:absolute;left:380px;top:100px;width:20px;height:20px"></div>
    </body>`);
    expect(await paddedClip(page.locator('#mid'), 8)).toEqual({
      x: 42,
      y: 52,
      width: 116,
      height: 56,
    });
    expect(await paddedClip(page.locator('#corner'), 8)).toEqual({
      x: 0,
      y: 0,
      width: 28,
      height: 28,
    });
    const edge = await paddedClip(page.locator('#edge'), 8);
    expect(edge.x + edge.width).toBeLessThanOrEqual(400);
    // The page itself is unchanged by computing the clip.
    await expect(page.locator('#mid')).toHaveCSS('left', '50px');
  });
});
