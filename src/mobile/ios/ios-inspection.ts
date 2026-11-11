import type { IosAppText } from '@test-data/ios-app.data';
import type { IosElement } from './page-source';

/**
 * First-inspection helpers: from a real page source, propose the accessibility identifiers for
 * src/mobile/ios/ios-selectors.ts and check the expected text in test-data/ios-app.data.ts.
 * Pure functions (no device). Only UI structure and UI text are recorded, never field values.
 */
export interface SelectorProposal {
  key: string;
  found: boolean;
  /** The element's accessibility identifier, or null when it has none (name equals its label). */
  accessibilityId: string | null;
  type?: string;
  label?: string;
  rule: string;
  /** How many visible elements matched the rule (the first one is proposed). */
  candidates: number;
  /** More than one element matched: the proposal needs a human decision before it is recorded. */
  ambiguous: boolean;
}

export interface TextCheck {
  key: string;
  expected: string;
  found: boolean;
}

/** One visible element, structure only. Input values are never recorded. */
export interface InventoryEntry {
  type: string;
  accessibilityId: string | null;
  label: string;
  placeholder: string;
  enabled: boolean;
  frame: [x: number, y: number, width: number, height: number];
}

/** Everything the guest inspection reports for one screen. */
export interface ScreenInspection {
  selectors: SelectorProposal[];
  texts: TextCheck[];
  /** Interactive elements (buttons, fields, links, switches) without an accessibility id. */
  missingIds: InventoryEntry[];
  /** Buttons with neither an accessibility id nor a label: unusable by any selector but position. */
  unlabeledButtons: InventoryEntry[];
  /** Accessibility ids carried by more than one visible element (not usable as-is). */
  duplicateIds: string[];
  inventory: InventoryEntry[];
}

/**
 * Registry keys the guest inspection cannot reach, and why (logout is not in the registry yet:
 * it needs an approved authenticated inspection). Every key in IOS_ACCESSIBILITY_IDS
 * is either proposed by a function below or listed here (checked by the iOS coverage selfcheck).
 */
export const NOT_INSPECTED_SELECTORS: Record<string, string> = {
  'login.passwordInputShown':
    'Appears only after typing a password and tapping the visibility control; the inspection types nothing.',
  'account.logoutItem':
    'Signed-in More screen: reachable only after a login (not approved, and the Log In button has no id yet).',
  'account.logoutConfirm':
    'Logout confirmation: reachable only after a login (not approved, and the Log In button has no id yet).',
  'otp.verifyButton': 'OTP step: reachable only through an OTP request (not approved).',
  'newPassword.passwordInput': 'New-password step: reachable only after a real OTP (not approved).',
  'newPassword.saveAndLoginButton':
    'New-password step: reachable only after a real OTP (not approved).',
};

/** App text keys the guest inspection cannot see, and why (the rest are checked on screen). */
export const NOT_INSPECTED_TEXTS: Record<string, string> = {
  verifyButton: 'OTP step (needs an OTP request).',
  saveAndLoginButton: 'New-password step (needs a real OTP).',
  logoutConfirm: 'Signed-in account screen (needs a login).',
  logoutBack:
    'Signed-in logout sheet: observed on the device 2026-11-09 by the signed-in inspection (not a guest screen).',
  createAccountChoice:
    'Observed on the welcome sheet by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  registrationHeading:
    'Registration step: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  chooseAccountType:
    'Registration step: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  registrationNext:
    'Registration step: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsTab:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  actionsTab:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsHeading:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsLive:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsClosed:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsWon:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsLost:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsGuestMessage:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  bidsGuestLogin:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  actionsHeading:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  actionsNeeded:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  actionsPending:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  actionsGuestMessage:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  actionsGuestLogin:
    'Guest tab screen: observed by the guest-extra inspection 2026-11-09 (not part of this first inspection).',
  notificationsHeading:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  notificationsMessage:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  notificationsEnable:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  notificationsLater:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  favoritesHeading:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  favoritesLive:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  favoritesUpcoming:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  favoritesGuestMessage:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  favoritesGuestLogin:
    'Guest screen: observed by the guest notifications-and-favorites inspection 2026-11-09 (not part of the first inspection).',
  fingerprintPromptDismiss: 'Shown after a password reset only.',
  invalidCredentials: 'Server response to a login attempt (account action).',
  unregisteredPhone: 'Server response to a Send request (account action).',
  incorrectOtp: 'OTP step (needs an OTP request).',
  passwordTooShort: 'New-password step (needs a real OTP).',
  otpVerificationHeading: 'OTP step (needs an OTP request).',
  newPasswordHeading: 'New-password step (needs a real OTP).',
};

/** The app text each guest screen is expected to show (checked on screen by the inspection). */
export function guestScreenTexts(text: IosAppText) {
  return {
    more: {
      home: text.tabs.home,
      more: text.tabs.more,
      guestPrompt: text.guestPrompt,
      languageOption: text.languageOption,
    },
    loginChoice: { entryChoiceLogin: text.entryChoiceLogin },
    login: { loginButton: text.loginButton, forgotPassword: text.forgotPassword },
    forgotPassword: {
      resetPasswordHeading: text.resetPasswordHeading,
      sendButton: text.sendButton,
    },
  } satisfies Record<string, Record<string, string>>;
}

const INPUT_TYPES = new Set(['TextField', 'SecureTextField', 'TextView', 'SearchField']);
const INTERACTIVE_TYPES = new Set([
  ...INPUT_TYPES,
  'Button',
  'Link',
  'Switch',
  'SegmentedControl',
  'Cell',
]);

const visible = (els: IosElement[]) => els.filter((e) => e.visible && e.width > 0 && e.height > 0);
const overlapsRow = (a: IosElement, b: IosElement) => a.y < b.y + b.height && b.y < a.y + a.height;
const idOf = (el: IosElement) => (el.name && el.name !== el.label ? el.name : null);

function proposal(key: string, matches: IosElement[], rule: string): SelectorProposal {
  const [el] = matches;
  const candidates = matches.length;
  if (!el) return { key, found: false, accessibilityId: null, rule, candidates, ambiguous: false };
  return {
    key,
    found: true,
    accessibilityId: idOf(el),
    type: el.type,
    label: el.label,
    rule,
    candidates,
    ambiguous: candidates > 1,
  };
}

/**
 * More tab while signed out: the Home and More tab-bar buttons and the guest prompt.
 * Ids must be the same in English and Arabic; compare both reports before recording one.
 */
export function proposeAppShellSelectors(
  elements: IosElement[],
  text: IosAppText,
): SelectorProposal[] {
  const els = visible(elements);
  const tabBar = els.find((e) => e.type === 'TabBar');
  const tabButtons = (label: string) =>
    els.filter(
      (e) => e.type === 'Button' && e.label === label && (!tabBar || overlapsRow(e, tabBar)),
    );
  const rule = tabBar ? 'Button in the TabBar labelled' : 'Button labelled (no TabBar found)';
  return [
    proposal('appShell.homeTab', tabButtons(text.tabs.home), `${rule} tabs.home text`),
    proposal('appShell.moreTab', tabButtons(text.tabs.more), `${rule} tabs.more text`),
    proposal(
      'appShell.guestPrompt',
      els.filter((e) => e.label === text.guestPrompt),
      'element labelled guestPrompt text',
    ),
  ];
}

/** Login form: phone and password fields, visibility toggle, Log In, Forgot Password. */
export function proposeLoginSelectors(
  elements: IosElement[],
  text: IosAppText,
): SelectorProposal[] {
  const els = visible(elements);
  const phones = els.filter((e) => e.type === 'TextField');
  const passwords = els.filter((e) => e.type === 'SecureTextField');
  const logins = els.filter((e) => e.type === 'Button' && e.label === text.loginButton);
  const password = passwords[0];
  const toggles = password
    ? els.filter((e) => e.type === 'Button' && !logins.includes(e) && overlapsRow(e, password))
    : [];
  return [
    // On the guest login form the phone is the only text field; a second one is ambiguous.
    proposal('login.phoneInput', phones, 'visible TextField'),
    proposal('login.passwordInput', passwords, 'visible SecureTextField'),
    proposal('login.passwordVisibilityToggle', toggles, 'Button in the password field row'),
    proposal('login.loginButton', logins, 'Button labelled loginButton text'),
    proposal(
      'login.forgotPasswordLink',
      els.filter((e) => e.label === text.forgotPassword),
      'element labelled forgotPassword text',
    ),
  ];
}

/** Forgot Password step 1: phone field, Send, navigation-bar back button. */
export function proposeForgotPasswordSelectors(
  elements: IosElement[],
  text: IosAppText,
): SelectorProposal[] {
  const els = visible(elements);
  // Found by the name the app gives it (never by position). Not language-dependent.
  const closes = els.filter((e) => e.type === 'Button' && /close/i.test(`${e.name} ${e.label}`));
  return [
    proposal(
      'forgotPassword.phoneInput',
      els.filter((e) => e.type === 'TextField'),
      'visible TextField',
    ),
    proposal(
      'forgotPassword.sendButton',
      els.filter((e) => e.type === 'Button' && e.label === text.sendButton),
      'Button labelled sendButton text',
    ),
    proposal(
      'forgotPassword.closeButton',
      closes,
      'Button whose accessible name contains "close" (the screen has no Back button)',
    ),
  ];
}

/** Whether each expected text appears as some element's label, placeholder or non-input value. */
export function checkTexts(elements: IosElement[], expected: Record<string, string>): TextCheck[] {
  const texts = new Set(
    visible(elements).flatMap((e) =>
      [e.label, e.placeholder, INPUT_TYPES.has(e.type) ? '' : e.value].filter(Boolean),
    ),
  );
  return Object.entries(expected).map(([key, value]) => ({
    key,
    expected: value,
    found: texts.has(value),
  }));
}

/** Visible elements with their structure and UI text. Input values are never included. */
export function inventory(elements: IosElement[]): InventoryEntry[] {
  return visible(elements)
    .filter((e) => e.type !== 'Other' || idOf(e) || e.label)
    .map((e) => ({
      type: e.type,
      accessibilityId: idOf(e),
      label: e.label,
      placeholder: e.placeholder,
      enabled: e.enabled,
      frame: [e.x, e.y, e.width, e.height],
    }));
}

/** Accessibility ids used by more than one visible element. */
export function duplicateIds(elements: IosElement[]): string[] {
  const counts = new Map<string, number>();
  for (const e of visible(elements)) {
    const id = idOf(e);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n > 1).map(([id]) => id);
}

/** Visible Buttons with no accessibility id and no label (nothing to locate them by). */
export function unlabeledButtons(elements: IosElement[]): InventoryEntry[] {
  return inventory(elements).filter((e) => e.type === 'Button' && !e.accessibilityId && !e.label);
}

/** Which screen is showing, from what is on it (a Close tap's destination is documented, not assumed). */
export function classifyScreen(
  elements: IosElement[],
  text: IosAppText,
): {
  screen: 'forgot-password' | 'login' | 'login-choice' | 'tab-bar' | 'unknown';
  evidence: string[];
} {
  const els = visible(elements);
  const has = (pred: (e: IosElement) => boolean) => els.some(pred);
  const evidence: string[] = [];
  if (has((e) => e.label === text.resetPasswordHeading)) {
    evidence.push(`text "${text.resetPasswordHeading}"`);
    return { screen: 'forgot-password', evidence };
  }
  if (has((e) => e.type === 'SecureTextField')) {
    evidence.push('a password field');
    if (has((e) => e.label === text.forgotPassword)) evidence.push(`"${text.forgotPassword}" link`);
    return { screen: 'login', evidence };
  }
  if (has((e) => e.type === 'Button' && e.label === text.entryChoiceLogin)) {
    evidence.push(`button "${text.entryChoiceLogin}" and no password field`);
    return { screen: 'login-choice', evidence };
  }
  if (
    has((e) => e.type === 'Button' && (e.label === text.tabs.home || e.label === text.tabs.more))
  ) {
    evidence.push('the tab bar (Home / More)');
    return { screen: 'tab-bar', evidence };
  }
  return { screen: 'unknown', evidence };
}

/** Interactive visible elements that have no accessibility id. */
export function missingIds(elements: IosElement[]): InventoryEntry[] {
  return inventory(elements).filter((e) => INTERACTIVE_TYPES.has(e.type) && !e.accessibilityId);
}

/** Full report for one screen. */
export function inspectScreen(
  elements: IosElement[],
  selectors: SelectorProposal[],
  expectedTexts: Record<string, string>,
): ScreenInspection {
  return {
    selectors,
    texts: checkTexts(elements, expectedTexts),
    missingIds: missingIds(elements),
    unlabeledButtons: unlabeledButtons(elements),
    duplicateIds: duplicateIds(elements),
    inventory: inventory(elements),
  };
}
