import { expect, test } from '@fixtures/inspection-android.fixture';
import { uniqueSyntheticVin } from '@test-data/inspection-android/vehicle-creation.data';
import { INSPECTION_TYPES } from '@mobile/inspection-android/screens/new-vehicle.screen';

/**
 * Read-only localization audit of the empty Basic Info form. Each case stops before Save &
 * Continue, so it performs no vehicle creation or backend write. Full field rules and translated
 * field-name expectations remain in the focused type-specific tests; this audit preserves the
 * rendered screen and accessibility tree for a current English/Arabic layout review.
 */
test.describe('Inspection Android - Basic Info form localization audit', { tag: ['@regression'] }, () => {
  for (const language of ['en', 'ar'] as const) {
    for (const type of INSPECTION_TYPES) {
      test(`${type} Basic Info renders in ${language}`, { tag: ['@functional'] }, async (
        { driver, homeScreen, newVehicleScreen, basicInfoScreen },
        testInfo,
      ) => {
        await homeScreen.waitUntilReady();
        await homeScreen.setLanguage(language);
        await homeScreen.startNewVehicle();

        await newVehicleScreen.enterVin(uniqueSyntheticVin());
        const vinSource = await driver.getPageSource();
        await testInfo.attach(`${type.toLowerCase()}-${language}-new-vehicle.xml`, {
          body: Buffer.from(vinSource),
          contentType: 'application/xml',
        });
        expect(await newVehicleScreen.continueButton.isDisplayed()).toBe(true);
        await newVehicleScreen.continueFromVin();
        const expectedTypeLabel =
          language === 'ar'
            ? type === 'Photography'
              ? 'تصوير'
              : type === 'Salvage'
                ? 'تالف'
                : type
            : type;
        expect(await newVehicleScreen.typeOption(type).isDisplayed()).toBe(true);
        await newVehicleScreen.selectType(type);
        await newVehicleScreen.continueFromTypeSelection();

        expect(await basicInfoScreen.byText(expectedTypeLabel).isDisplayed()).toBe(true);
        const source = await driver.getPageSource();
        expect(source).toContain(expectedTypeLabel);
        if (language === 'ar') {
          // Require actual Arabic text in the rendered form while leaving individual translations
          // unasserted until their exact app-provided wording is documented from the captured tree.
          expect(source).toMatch(/[\u0600-\u06ff]/);
        }

        await testInfo.attach(`${type.toLowerCase()}-${language}-basic-info.png`, {
          body: Buffer.from(await driver.takeScreenshot(), 'base64'),
          contentType: 'image/png',
        });
        await testInfo.attach(`${type.toLowerCase()}-${language}-basic-info.xml`, {
          body: Buffer.from(source),
          contentType: 'application/xml',
        });
      });
    }
  }
});
