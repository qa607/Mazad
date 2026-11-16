import { expect, test } from '@fixtures/inspection-android.fixture';

test.describe(
  'Inspection Android - History in English and Arabic',
  { tag: ['@regression'] },
  () => {
    test('History opens, exposes translated content, and returns to Home in both directions', async ({
      driver,
      homeScreen,
    }, testInfo) => {
      await homeScreen.waitUntilReady();
      const { width, height } = await driver.getWindowSize();

      for (const language of ['en', 'ar'] as const) {
        await homeScreen.setLanguage(language);
        const homeBefore = await driver.getPageSource();
        const homeTabs =
          language === 'en'
            ? ['In Progress', 'Completed', 'Not Sent']
            : ['قيد الفحص', 'مكتملة', 'غير مرسلة'];

        // The History clock icon mirrors from the right edge in English to the left edge in RTL.
        const x = Math.round(width * (language === 'en' ? 0.81 : 0.19));
        const y = Math.round(height * 0.079);
        await driver.action('pointer').move({ x, y }).down().pause(80).up().perform();
        await driver.waitUntil(async () => (await driver.getPageSource()) !== homeBefore, {
          timeout: 10_000,
          timeoutMsg: `${language} History did not open from its Home icon.`,
        });

        const historyXml = await driver.getPageSource();
        const nodes = parseNodes(historyXml);
        const historyTexts = nodes.map(({ text }) => text);
        console.log(`[history-localization] ${language} text=${JSON.stringify(historyTexts)}`);
        const requiredLabels =
          language === 'en'
            ? [
                'Sent Inspection Reports',
                'VIN Number',
                'Started on',
                'Completed on',
                'Sent on',
                'Duration',
              ]
            : ['تقارير الفحص المرسلة', 'رقم الهيكل', 'بدأ في', 'اكتمل في', 'أرسل في', 'المدة'];
        for (const label of requiredLabels) {
          expect(historyTexts, `${language} History displays "${label}"`).toContain(label);
        }
        const expectedTypeByVin =
          language === 'en'
            ? { ZQA00179468723401: 'Salvage', ZQA00179468710501: 'Photography' }
            : { ZQA00179468723401: 'تالف', ZQA00179468710501: 'تصوير' };
        for (const [vin, typeLabel] of Object.entries(expectedTypeByVin)) {
          const vinNode = nodes.find((node) => node.text === vin);
          const typeNode = nodes.find((node) => node.text === typeLabel);
          expect(vinNode, `${language} History contains ${vin}`).toBeDefined();
          expect(typeNode, `${language} History labels ${vin} as ${typeLabel}`).toBeDefined();
          expect(Math.abs((vinNode?.centerY ?? 0) - (typeNode?.centerY ?? 10_000))).toBeLessThan(
            80,
          );
        }
        const sentOnLabels = nodes.filter(
          (node) => node.text === (language === 'en' ? 'Sent on' : 'أرسل في'),
        );
        const vinCount = nodes.filter((node) => /^ZQA\d{14}$/.test(node.text)).length;
        expect(
          sentOnLabels,
          `${language} each visible history entry has a Sent on label`,
        ).toHaveLength(vinCount);
        for (const label of sentOnLabels) {
          expect(
            nodes.some(
              (node) =>
                node.text && node.centerY > label.centerY && node.centerY - label.centerY < 90,
            ),
            `${language} Sent on has a visible date value`,
          ).toBe(true);
        }

        const scrollContainer = [...historyXml.matchAll(/<[^>]+scrollable="true"[^>]*>/g)]
          .map(([tag]) => parseBounds(tag))
          .find((bounds) => bounds !== undefined);
        expect(scrollContainer, `${language} History exposes its scrollable list`).toBeDefined();
        expect(scrollContainer?.x1).toBeGreaterThanOrEqual(0);
        expect(scrollContainer?.y1).toBeGreaterThanOrEqual(0);
        expect(scrollContainer?.x2).toBeLessThanOrEqual(width);
        expect(scrollContainer?.y2).toBeLessThanOrEqual(height);
        for (const node of nodes.filter((item) => item.text)) {
          expect(
            node.bounds.x1,
            `${language} ${node.text} is not clipped off the left`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            node.bounds.y1,
            `${language} ${node.text} is not clipped above the screen`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            node.bounds.x2,
            `${language} ${node.text} is not clipped off the right`,
          ).toBeLessThanOrEqual(width);
          expect(
            node.bounds.y2,
            `${language} ${node.text} is not clipped below the screen`,
          ).toBeLessThanOrEqual(height);
        }
        const textNodes = nodes.filter((item) => item.text);
        const overlaps = textNodes.flatMap((a, index) =>
          textNodes
            .slice(index + 1)
            .filter(
              (b) =>
                Math.min(a.bounds.x2, b.bounds.x2) > Math.max(a.bounds.x1, b.bounds.x1) &&
                Math.min(a.bounds.y2, b.bounds.y2) > Math.max(a.bounds.y1, b.bounds.y1),
            )
            .map((b) => [a.text, b.text]),
        );
        expect(overlaps, `${language} History text has no overlapping bounds`).toEqual([]);

        const backButton = driver.$('android.widget.Button');
        expect(
          await backButton.isDisplayed(),
          `${language} History exposes a back-arrow button`,
        ).toBe(true);
        const backLocation = await backButton.getLocation();
        const backSize = await backButton.getSize();
        const backCenterX = backLocation.x + backSize.width / 2;
        expect(
          language === 'en' ? backCenterX : width - backCenterX,
          `${language} back arrow is mirrored toward the navigation edge`,
        ).toBeLessThan(width / 2);
        expect(
          homeTabs.some((label) => historyTexts.includes(label)),
          `${language} History replaces the Home tab content`,
        ).toBe(false);
        await testInfo.attach(`history-${language}.png`, {
          body: Buffer.from(await driver.takeScreenshot(), 'base64'),
          contentType: 'image/png',
        });
        await testInfo.attach(`history-${language}.xml`, {
          body: Buffer.from(historyXml),
          contentType: 'application/xml',
        });

        // Scroll the list once, then use the visible arrow (the only action button on this screen).
        const firstVin = nodes.find((node) => /^ZQA\d{14}$/.test(node.text));
        await driver
          .action('pointer')
          .move({ x: Math.round(width * 0.5), y: Math.round(height * 0.78) })
          .down()
          .pause(50)
          .move({ duration: 300, x: Math.round(width * 0.5), y: Math.round(height * 0.4) })
          .up()
          .perform();
        await driver.pause(500);
        const afterScroll = parseNodes(await driver.getPageSource());
        const firstVinAfter = afterScroll.find((node) => node.text === firstVin?.text);
        expect(
          firstVinAfter === undefined || firstVinAfter.centerY < (firstVin?.centerY ?? 0),
          `${language} History list responds to scrolling`,
        ).toBe(true);

        await driver
          .action('pointer')
          .move({
            x: Math.round(backLocation.x + backSize.width / 2),
            y: Math.round(backLocation.y + backSize.height / 2),
          })
          .down()
          .pause(80)
          .up()
          .perform();
        await homeScreen.waitUntilReady();
        const homeAfterBack = await driver.getPageSource();
        for (const label of homeTabs) {
          expect(
            homeAfterBack,
            `${language} back navigation returns to its localized Home`,
          ).toContain(`text="${label}"`);
        }
      }

      // Preserve the team's prior English app-language preference after both History checks.
      await homeScreen.setLanguage('en');
    });
  },
);

function parseNodes(xml: string) {
  return [...xml.matchAll(/<([^\s>]+)[^>]*>/g)].flatMap(([tagText, tag]) => {
    const text = tagText
      .match(/\btext="([^"]*)"/)?.[1]
      .replace(/&amp;/g, '&')
      .replace(/&#10;/g, '\n');
    const bounds = parseBounds(tagText);
    return text !== undefined && bounds
      ? [
          {
            tag,
            text,
            bounds,
            centerX: (bounds.x1 + bounds.x2) / 2,
            centerY: (bounds.y1 + bounds.y2) / 2,
          },
        ]
      : [];
  });
}

function parseBounds(tag: string) {
  const match = tag.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return match
    ? { x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]) }
    : undefined;
}
