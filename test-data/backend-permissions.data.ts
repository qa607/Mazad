import type { BackendRole } from '@config/credentials.config';
import { testRecordPrefix } from '@test-data/backend-common.data';

/**
 * Expected back-office access to the auction lists, per role. Taken from each role's
 * permissions page on staging (Roles & Permissions -> Roles -> View Permission) on 2026-11-08.
 * Entries marked "To confirm" look unintended and need a business decision: if the decision
 * differs, change the expectation here and the test will report the gap.
 */

/** The auction list pages under test. */
export const auctionPages = {
  readyForPricing: { label: 'Ready For Pricing', path: '/backend/auction/ready-for-pricing/index' },
  pricingDone: { label: 'Pricing Done', path: '/backend/auction/pricing-done/index' },
  upcoming: { label: 'Upcoming', path: '/backend/auction/upcoming/index' },
  suspended: { label: 'Suspended Vehicles', path: '/backend/auction/suspend/index' },
} as const;

/**
 * Actions on those pages, as the AJAX requests their buttons send. Every request uses input that
 * changes nothing: vehicle/item ID 0 (no such record) or an empty form. An allowed role gets
 * HTTP 200 (with a JSON warning or a no-op "success"); a denied role should get HTTP 403.
 */
export const auctionActions = {
  suspend: {
    label: 'Suspend',
    path: '/backend/vehicle/ajax/suspend-vehicle?vehicles_id=0&bulks_id=&list_name=pricing-done',
  },
  moveToUpcoming: {
    label: 'Move to upcoming',
    path: '/backend/vehicle/ajax/upcoming-vehicle?vehicles_id=0&bulks_id=&list_name=pricing-done',
  },
  backToPricingDone: {
    label: 'Back to pricing done',
    path: '/backend/auction/ajax/pricing-done-back-auction-item?id=0&list_name=upcoming',
  },
  createAuction: {
    label: 'Create auction',
    path: '/backend/auction/ajax/create-auction?list_name=upcoming',
  },
  // Suspended Vehicles: activate a suspended vehicle back into Ready For Pricing.
  activate: {
    label: 'Activate suspended vehicle',
    path: '/backend/auction/ajax/activate-auction-item?vehicles_id=0&bulks_id=&list_name=suspended',
  },
  // Irreversible deletes (destructive): sent only for roles that must be refused. The permission
  // check runs before the action, so a refused request deletes nothing. They are never sent for
  // an allowed role, even with ID 0, in case the server reads the input differently.
  deleteSuspended: {
    label: 'Delete suspended items (bulk)',
    path: '/backend/auction/ajax/delete-auction-item?vehicles_id=0&bulks_id=&list_name=suspended',
    destructive: true,
  },
  deleteVehicle: {
    label: 'Delete vehicle (row)',
    path: '/backend/vehicle/vehicle/delete?id=0&from_suspend=1',
    destructive: true,
  },
} as const;

export type AuctionPage = keyof typeof auctionPages;
export type AuctionAction = keyof typeof auctionActions;

/** Who is signed in: Dev Root (role "root") or one of the role test accounts. */
export type AccessProfile = 'devRoot' | BackendRole;

interface ExpectedAccess {
  label: string;
  pages: readonly AuctionPage[];
  actions: readonly AuctionAction[];
}

const allPages = Object.keys(auctionPages) as AuctionPage[];
const allActions = Object.keys(auctionActions) as AuctionAction[];

export const expectedAccess: Record<AccessProfile, ExpectedAccess> = {
  devRoot: { label: 'root (Dev Root)', pages: allPages, actions: allActions },
  auctionSupervisor: { label: 'Auction Supervisor', pages: allPages, actions: allActions },
  // View only: opens all four lists (Suspended Vehicles included), but none of their actions.
  customerSupport: { label: 'Customer Support', pages: allPages, actions: [] },
  // To confirm: Auction Team can open Ready For Pricing and Upcoming, but neither Pricing Done
  // nor Suspended Vehicles.
  auctionTeam: { label: 'Auction Team', pages: ['readyForPricing', 'upcoming'], actions: [] },
  // To confirm: the operation role has only 9 basic permissions (login, home, global search,
  // images), so an account with only this role can open none of the auction lists.
  operation: { label: 'operation', pages: [], actions: [] },
  noAuctionAccess: { label: 'Marketing (no auction access)', pages: [], actions: [] },
};

/** HTTP status the Backend returns for a route the signed-in role may not use. */
export const forbiddenStatus = 403;

export const backendHomePath = '/backend/site/index';

// ---------------------------------------------------------------------------
// Supplier List permission findings (PRM-02, PRM-03)
// ---------------------------------------------------------------------------

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
