/**
 * Allure labels for a `test.describe(title, details, body)` block, using the existing
 * allure-playwright reporter (no extra dependency): annotations of type `allure.label.<name>`
 * become Allure labels, and tags become Allure tags. Static only: allure-playwright reads them
 * when a test starts. On the website, the language is the Playwright project (en/ar), which
 * Allure already shows as the top-level suite.
 *
 * Xray: no test keys are added until the QA owner provides the key format.
 */
export type Feature =
  'Login' | 'Forgot Password' | 'Dealer' | 'Registration' | 'Guest tabs' | 'Contact Us' | 'More';
export type Severity = 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial';
export type Platform = 'web' | 'android' | 'ios';

export interface AllureDetails {
  tag: string[];
  annotation: { type: string; description: string }[];
}

export function allureLabels(labels: {
  feature: Feature;
  story: string;
  severity: Severity;
  platform: Platform;
  language?: 'en' | 'ar';
}): AllureDetails {
  const annotation = [
    { type: 'allure.label.epic', description: 'Mazad authentication' },
    { type: 'allure.label.feature', description: labels.feature },
    { type: 'allure.label.story', description: labels.story },
    { type: 'allure.label.severity', description: labels.severity },
    { type: 'allure.label.platform', description: labels.platform },
    ...(labels.language ? [{ type: 'allure.label.language', description: labels.language }] : []),
  ];
  const tag = [`@${labels.platform}`, ...(labels.language ? [`@${labels.language}`] : [])];
  return { tag, annotation };
}
