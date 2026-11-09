import { testRecordPrefix } from '@test-data/backend-common.data';

/**
 * Mazad Backend roles and permissions test data, for the Supplier List permission findings
 * PRM-02 and PRM-03 (read from the staging Backend on 2026-11-05).
 */
export const supplierPermissions = {
  create: '/users/supplier/create',
  delete: '/users/supplier/delete',
  /** Wildcard permission covering every supplier action, delete included. */
  all: '/users/supplier/*',
  /** Permissions that should change only when they are clicked themselves (PRM-02). */
  relatedToCreate: [
    '/users/supplier-ajax/save-basic-tab',
    '/users/supplier-ajax/save-auction-tab',
    '/users/supplier-ajax/save-inspection-tab',
    '/users/supplier-ajax/save-email-tab',
    '/users/ajax/add-supplier-commission',
  ],
} as const;

export const permissionData = {
  /** Built-in role that holds every permission. */
  rootRole: 'root',
  /** Permissions list search that finds the supplier delete permission. */
  deleteSearch: 'supplier/delete',
  /** Prefix of the throwaway role PRM-02 creates and deletes. */
  testRolePrefix: `${testRecordPrefix} PRM-02`,
} as const;

/** URL patterns, matched against the full page URL. */
export const permissionUrls = {
  rolePermissions: /\/access\/role\/view-permission/,
} as const;
