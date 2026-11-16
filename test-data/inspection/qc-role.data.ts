/**
 * QC role/permission data for the Inspection backend (stg-224-inspection), confirmed live
 * 2026-11-11 by signing in as the dedicated "QA-AUTO QC TEST" account (id 5480) in a fresh
 * browser context, with no Admin session cookies present.
 */
export const qcRoleText = {
  /** The user-menu header's role suffix: "<name> - QC" for a QC User, vs "Motori Admin - Super
   * Admin" for the Admin account (see inspection-login.data.ts's dashboardTitle for the Admin
   * check). */
  roleSuffix: 'QC',
  forbidden: 'Forbidden (#403)',
  forbiddenDetail: 'You are not allowed to perform this action.',
} as const;

/**
 * Paths confirmed live: QC can open every one of these (all appear in its own sidebar, which
 * omits the Admin-only "Users" menu entirely — no QC Users / Inspectors links at all).
 */
export const qcAccessiblePaths = [
  '/car/index',
  '/car/awaitinginspection',
  '/report/inspection',
] as const;

/**
 * Paths confirmed live to return a real server-side "Forbidden (#403)" page for QC — not just a
 * hidden sidebar link, so this is enforced access control, not merely a UI omission.
 */
export const qcForbiddenPaths = [
  '/operation/index', // QC Users list
  '/operation/create', // QC Users create
  '/inspector/index', // Inspectors list
] as const;
