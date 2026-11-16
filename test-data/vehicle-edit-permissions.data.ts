/**
 * Mazad V3 Backend > vehicle edit-permission by lifecycle status, confirmed live 2026-11-12
 * signed in as Dev Root. Existing real staging records only — nothing created for this.
 */
export const vehicleLifecycleRecords = {
  /** The first row of the Backend's own "Waiting for QC" inspection list (20 records live). */
  waitingQc: { id: 23722, label: 'Waiting for QC' },
  /** The one real vehicle confirmed to be in Ongoing Inspection status. */
  ongoing: { id: 10433, label: 'Ongoing' },
  /** The designated QC Completed vehicle (same VIN as Inspection's vehicle 22865). */
  qcCompleted: { id: 23716, label: 'QC Completed' },
  /** The one real vehicle confirmed to be in Awaiting status (auction lifecycle, not an
   * inspection status — kept for the pre-existing Awaiting-auction coverage below). */
  awaiting: { id: 23624, label: 'Awaiting' },
} as const;

export const vehicleEditPermissionText = {
  /** `/vehicle/vehicle/update` for an Ongoing vehicle server-side redirects here instead of
   * rendering a form. */
  viewPath: '/backend/vehicle/vehicle/view',
  /** Page titles of the Backend's own "Inspections" sidebar lists. */
  waitingQcListTitle: 'Waiting for QC',
  ongoingListTitle: 'Ongoing',
  qcCompletedListTitle: 'QC Completed',
} as const;
