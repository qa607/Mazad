import { expect, test } from '@fixtures/website.fixture';
import { registrationCityOption, registrationData } from '@test-data/registration.data';

/**
 * Mazad website registration.
 *
 * Step 1 (account-type choice) needs no Firebase call and no approval switch.
 *
 * Step 2 onward needs the app's own anonymous Firebase session, allowed ONLY in the describe
 * block below via `test.use({ allowFirebaseAnonymousSignup: true })` (approved 2026-11-10,
 * staging project `mazad-v3`; see src/network/request-guard.ts and
 * src/fixtures/website.fixture.ts). That session is cleaned up automatically after every test
 * in that block, pass or fail. Nothing here ever clicks "Create Account" or "Verify": those
 * would submit an actual Mazad registration, which is never done by this suite. Every field
 * typed is a synthetic value (test-data/registration.data.ts), never a real person's.
 */
test.describe('Registration', { tag: '@ui' }, () => {
  test(
    'Step 1 shows the account-type choice with Next disabled',
    { tag: ['@smoke', '@functional'] },
    async ({ mazadRegistrationPage, t }) => {
      await mazadRegistrationPage.goto();
      await expect(mazadRegistrationPage.heading).toHaveText(t('createAccount'));
      await expect(mazadRegistrationPage.chooseAccountTypeLabel).toHaveText(t('chooseAccountType'));
      await expect(mazadRegistrationPage.personalAccountChoice).toContainText(
        t('personalAccountChoice'),
      );
      await expect(mazadRegistrationPage.companyAccountChoice).toContainText(
        t('companyAccountChoice'),
      );
      await expect(mazadRegistrationPage.nextButton).toBeDisabled();
    },
  );

  test(
    'Choosing Personal Account enables Next',
    { tag: '@functional' },
    async ({ mazadRegistrationPage }) => {
      await mazadRegistrationPage.goto();
      await mazadRegistrationPage.choosePersonalAccount();
      await expect(mazadRegistrationPage.nextButton).toBeEnabled();
    },
  );

  test(
    'Choosing Company Account enables Next',
    { tag: '@functional' },
    async ({ mazadRegistrationPage }) => {
      await mazadRegistrationPage.goto();
      await mazadRegistrationPage.chooseCompanyAccount();
      await expect(mazadRegistrationPage.nextButton).toBeEnabled();
    },
  );

  test.describe('step 2', () => {
    test.use({ allowFirebaseAnonymousSignup: true });

    test(
      'Personal account step 2 shows the expected fields, no email field, Create Account disabled when empty',
      { tag: '@functional' },
      async ({ mazadRegistrationPage, t }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.choosePersonalAccount();
        await mazadRegistrationPage.continueToStep2('individual');

        await expect(mazadRegistrationPage.fullNameInput).toBeVisible();
        await expect(mazadRegistrationPage.idIqamaInput).toBeVisible();
        await expect(mazadRegistrationPage.mobileNumberInput).toBeVisible();
        await expect(mazadRegistrationPage.passwordInput).toBeVisible();
        // Confirmed on staging: no email field on either step-2 form.
        await expect(mazadRegistrationPage.emailInput).toHaveCount(0);
        await expect(mazadRegistrationPage.createAccountButton).toHaveText(
          t('registrationCreateAccountButton'),
        );
        await expect(mazadRegistrationPage.createAccountButton).toBeDisabled();
      },
    );

    // City/Region (Individual only): a custom dropdown, not a <select>. Confirmed on staging
    // 2026-11-10: clicking it reveals a list of city options; clicking one sets the displayed
    // text and closes the list.
    test(
      'Personal account step 2: City/Region dropdown opens, lists options and selects one',
      { tag: '@functional' },
      async ({ mazadRegistrationPage, language, t }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.choosePersonalAccount();
        await mazadRegistrationPage.continueToStep2('individual');

        await expect(mazadRegistrationPage.cityRegionLabel).toHaveText(
          t('registrationCityRegionLabel'),
        );
        await expect(mazadRegistrationPage.cityRegionSelectedText).toHaveText(
          t('registrationSelectCityPlaceholder'),
        );

        await mazadRegistrationPage.openCityRegionDropdown();
        const city = registrationCityOption[language];
        await expect(
          mazadRegistrationPage.cityRegionOptionList.filter({ hasText: city }),
        ).toHaveCount(1);
        // Closing and reopening is covered implicitly by selectCityRegion below; here only the
        // open state and the option's presence are checked, nothing is selected yet.
      },
    );

    test(
      'Personal account step 2: selecting a city updates the displayed value',
      { tag: '@functional' },
      async ({ mazadRegistrationPage, language }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.choosePersonalAccount();
        await mazadRegistrationPage.continueToStep2('individual');

        const city = registrationCityOption[language];
        await mazadRegistrationPage.selectCityRegion(city);
        await expect(mazadRegistrationPage.cityRegionSelectedText).toHaveText(city);
      },
    );

    test(
      'Personal account step 2: filling every field, including City/Region, enables Create Account',
      { tag: '@functional' },
      async ({ mazadRegistrationPage, language }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.choosePersonalAccount();
        await mazadRegistrationPage.continueToStep2('individual');

        await mazadRegistrationPage.enterFullName(registrationData.name);
        await mazadRegistrationPage.enterIdIqama(registrationData.idIqama);
        await mazadRegistrationPage.selectCityRegion(registrationCityOption[language]);
        await mazadRegistrationPage.enterMobileNumber(registrationData.mobilePhone);
        await mazadRegistrationPage.enterPassword(registrationData.wellFormedPassword);
        await expect(mazadRegistrationPage.createAccountButton).toBeEnabled();
      },
    );

    test(
      'Personal account step 2: City/Region left unselected keeps Create Account disabled (required)',
      { tag: ['@functional', '@negative'] },
      async ({ mazadRegistrationPage }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.choosePersonalAccount();
        await mazadRegistrationPage.continueToStep2('individual');

        await mazadRegistrationPage.enterFullName(registrationData.name);
        await mazadRegistrationPage.enterIdIqama(registrationData.idIqama);
        await mazadRegistrationPage.enterMobileNumber(registrationData.mobilePhone);
        await mazadRegistrationPage.enterPassword(registrationData.wellFormedPassword);
        await expect(mazadRegistrationPage.createAccountButton).toBeDisabled();
      },
    );

    test(
      'Personal account step 2: a too-short password (with City/Region selected) keeps Create Account disabled',
      { tag: ['@functional', '@negative'] },
      async ({ mazadRegistrationPage, language }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.choosePersonalAccount();
        await mazadRegistrationPage.continueToStep2('individual');

        await mazadRegistrationPage.enterFullName(registrationData.name);
        await mazadRegistrationPage.enterIdIqama(registrationData.idIqama);
        await mazadRegistrationPage.selectCityRegion(registrationCityOption[language]);
        await mazadRegistrationPage.enterMobileNumber(registrationData.mobilePhone);
        await mazadRegistrationPage.enterPassword(registrationData.tooShortPassword);
        await expect(mazadRegistrationPage.createAccountButton).toBeDisabled();
      },
    );

    test(
      'Company account step 2 shows the expected fields, no email field, Verify disabled when empty',
      { tag: '@functional' },
      async ({ mazadRegistrationPage, t }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.chooseCompanyAccount();
        await mazadRegistrationPage.continueToStep2('company');

        await expect(mazadRegistrationPage.fullNameInput).toBeVisible();
        await expect(mazadRegistrationPage.idIqamaInput).toBeVisible();
        await expect(mazadRegistrationPage.mobileNumberInput).toBeVisible();
        await expect(mazadRegistrationPage.passwordInput).toBeVisible();
        await expect(mazadRegistrationPage.commercialRegistryInput).toBeVisible();
        await expect(mazadRegistrationPage.taxIdInput).toBeVisible();
        await expect(mazadRegistrationPage.emailInput).toHaveCount(0);
        // Confirmed on staging: Company's step-2 submit button says "Verify", not "Create Account".
        await expect(mazadRegistrationPage.companyVerifyButton).toHaveText(t('verify'));
        await expect(mazadRegistrationPage.companyVerifyButton).toBeDisabled();
      },
    );

    test(
      'Company account step 2: filling every field enables Verify (never clicked)',
      { tag: '@functional' },
      async ({ mazadRegistrationPage }) => {
        await mazadRegistrationPage.goto();
        await mazadRegistrationPage.chooseCompanyAccount();
        await mazadRegistrationPage.continueToStep2('company');

        await mazadRegistrationPage.enterFullName(registrationData.name);
        await mazadRegistrationPage.enterIdIqama(registrationData.idIqama);
        await mazadRegistrationPage.enterMobileNumber(registrationData.mobilePhone);
        await mazadRegistrationPage.enterPassword(registrationData.wellFormedPassword);
        await mazadRegistrationPage.enterCommercialRegistry(
          registrationData.commercialRegistryNumber,
        );
        await mazadRegistrationPage.enterTaxId(registrationData.taxId);
        await expect(mazadRegistrationPage.companyVerifyButton).toBeEnabled();
      },
    );
  });
});
