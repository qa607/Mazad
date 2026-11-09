import { expect, test } from '../support/fixtures';
import { findL10nIssues } from '../support/l10n-checks';
import { findLayoutIssues } from '../support/layout-rules';

/** Synthetic local pages: each rule must fire on a known defect and stay quiet on a clean page. */
const BROKEN = `
<html lang="en" dir="ltr"><body style="margin:0;font:16px sans-serif">
  <div id="clip" style="width:60px;overflow:hidden;white-space:nowrap">A long label that is cut off</div>
  <div id="ellipsis" style="width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Another long label</div>
  <div style="position:relative;height:40px">
    <span id="a" style="position:absolute;left:0;top:0">Overlapping text one</span>
    <span id="b" style="position:absolute;left:10px;top:2px">Overlapping text two</span>
  </div>
  <div id="wide" style="width:3000px">Wide content</div>
  <button id="wrap" style="width:40px">Two words</button>
  <p id="key">HOME.HEADER.TITLE</p>
</body></html>`;

const CLEAN = `
<html lang="ar" dir="rtl"><body style="margin:0;font:16px sans-serif">
  <header><nav><a href="#">الرئيسية</a></nav></header>
  <p>نص عربي قصير</p>
</body></html>`;

test.describe('Layout and l10n rules (selfcheck)', () => {
  test('flags known defects', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.setContent(BROKEN);
    const rules = (await findLayoutIssues(page, { language: 'en' })).map((i) => i.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        'text-clipped',
        'text-truncated',
        'text-overlap',
        'page-horizontal-overflow',
        'control-text-wrapped',
      ]),
    );
    const l10n = (await findL10nIssues(page, { language: 'ar' })).map((i) => i.rule);
    expect(l10n).toEqual(expect.arrayContaining(['html-lang', 'html-dir', 'raw-translation-key']));
  });

  test('flags Arabic text rendered left-to-right', async ({ page }) => {
    await page.setContent(
      '<html lang="ar" dir="rtl"><body><p style="direction:ltr">نص</p></body></html>',
    );
    const rules = (await findLayoutIssues(page, { language: 'ar' })).map((i) => i.rule);
    expect(rules).toContain('rtl-direction');
  });

  test('stays quiet on a clean page', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.setContent(CLEAN);
    expect(await findLayoutIssues(page, { language: 'ar' })).toEqual([]);
    expect(await findL10nIssues(page, { language: 'ar' })).toEqual([]);
  });
});
