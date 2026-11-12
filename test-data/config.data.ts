/**
 * Mazad Backend > Global Settings > Config test data. Read from the staging Backend (stg-154) on
 * 2026-11-12, from the live UI, its script (config.js) and the server's answers, not assumed.
 *
 * The page is one grid row of site-wide ON/OFF switches. There is nothing to create, view or
 * delete: /config/config/create, /view and /update answer 404 and the grid has no actions. A
 * switch saves as soon as it is flipped (POST /backend/config/ajax/save-config, attrName and
 * state 0/1), with no confirmation first, and applies to the whole site.
 *
 * Only Dev Root opens the page: no role has a /config route. A supplier gets 403 for the page
 * and the save request; a signed-out visitor is sent to the login page.
 *
 * By the user's decision (2026-11-12) only "Can Fail Item" is ever flipped, and it is restored
 * at once; the other switches are only read. Access checks send each setting's current value,
 * so nothing changes even if a save were accepted.
 *
 * Findings the user chose to ignore (2026-11-12) are not asserted: the server also saves a
 * state of 2, -1, empty or "00"; a save without a state is handled inconsistently; a failed save
 * leaves the loading overlay up with no error; there is no confirmation before a save; and a
 * refused save gives no reason.
 */
export const configText = {
  pageTitle: 'Configs',
  saved: 'Changes have been saved',
  notSaved: 'Changes have not been saved',
  notFound: 'Not Found (#404)',
  forbidden: 'Forbidden (#403)',
  ajaxOnly: 'This action is allowed only for AJAX requests.',
  badCsrf: 'Unable to verify your data submission.',
} as const;

/** The settings, in column order, with their column headers. */
export const configColumns = {
  auto_extend: 'Auto Extend',
  enable_nafath: 'Enable Nafath',
  enable_anb: 'Enable ANB',
  can_fail_item: 'Can Fail Item',
  enable_mojaz_request: 'Enable Mojaz Request',
} as const;
export type ConfigSetting = keyof typeof configColumns;
export const configSettings = Object.keys(configColumns) as ConfigSetting[];

/** The one setting the tests may flip (user's decision, 2026-11-12); always restored. */
export const settingToFlip: ConfigSetting = 'can_fail_item';
/**
 * The settings no test changes. Checks running in parallel with the save tests compare only
 * these, since Can Fail Item may be flipped at the same moment in another worker.
 */
export const steadySettings = configSettings.filter((setting) => setting !== settingToFlip);

/** State values the server must refuse ("Changes have not been saved"), and does. */
export const refusedStates = [
  { name: 'letters', value: 'abc' },
  { name: 'a decimal', value: '1.5' },
  { name: 'the word true', value: 'true' },
  { name: 'a value with spaces', value: ' 1 ' },
] as const;

/** Setting names the server must refuse. */
export const unknownSettingNames = [
  { name: 'an unknown name', value: 'qa_auto_unknown' },
  { name: 'the name in capitals', value: 'CAN_FAIL_ITEM' },
  { name: 'the name with a leading space', value: ' can_fail_item' },
] as const;

/**
 * Pages the app does not have for configs (GET only; the delete route is never requested, as a
 * GET to it could act on the real settings row 1).
 */
export const missingConfigPages = ['create', 'view?id=1', 'update?id=1'] as const;

/** Operation roles used for the access checks: none has a /config route. */
export const rolesWithoutConfigAccess = ['Marketing', 'Auction Supervisor'] as const;

export const configUrls = {
  page: /\/backend\/config\/config\/index(\?|$)/,
  login: /\/backend\/authentication\/login/,
} as const;
