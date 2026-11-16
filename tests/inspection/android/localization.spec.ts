import { expect, test } from '@fixtures/inspection-android.fixture';

test.describe(
  'Inspection Android - English and Arabic Home localization',
  { tag: ['@regression'] },
  () => {
    test('Home tabs and language menu render in English and Arabic within the device viewport', async ({
      driver,
      homeScreen,
    }, testInfo) => {
      await homeScreen.waitUntilReady();
      const { width, height } = await driver.getWindowSize();

      for (const language of ['en', 'ar'] as const) {
        await homeScreen.setLanguage(language);
        const xml = await driver.getPageSource();
        const labels =
          language === 'en'
            ? ['In Progress', 'Completed', 'Not Sent']
            : ['قيد الفحص', 'مكتملة', 'غير مرسلة'];
        const missing = labels.filter((label) => !xml.includes(`text="${label}"`));
        expect(missing, `${language} Home tab labels appear in the accessibility tree`).toEqual([]);

        const visibleLabels = [...xml.matchAll(/<[^>]+>/g)].flatMap(([node]) => {
          const text = node.match(/\btext="([^"]*)"/)?.[1];
          const bounds = node.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
          return text && labels.includes(text) && bounds
            ? [{ text, bounds: bounds.slice(1).map(Number) }]
            : [];
        });
        expect(visibleLabels, `${language} tab labels expose screen bounds`).toHaveLength(3);
        for (const { text, bounds } of visibleLabels) {
          expect(bounds[0], `${language} ${text} left edge is on screen`).toBeGreaterThanOrEqual(0);
          expect(bounds[1], `${language} ${text} top edge is on screen`).toBeGreaterThanOrEqual(0);
          expect(bounds[2], `${language} ${text} right edge is on screen`).toBeLessThanOrEqual(
            width,
          );
          expect(bounds[3], `${language} ${text} bottom edge is on screen`).toBeLessThanOrEqual(
            height,
          );
        }

        await testInfo.attach(`home-${language}.png`, {
          body: Buffer.from(await driver.takeScreenshot(), 'base64'),
          contentType: 'image/png',
        });
        await testInfo.attach(`home-${language}.xml`, {
          body: Buffer.from(xml),
          contentType: 'application/xml',
        });
      }

      // Leave the shared app in the team's prior English state after verifying both locales.
      await homeScreen.setLanguage('en');
    });
  },
);
