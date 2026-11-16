/**
 * Shared `UserCreateForm` field names/validation messages, confirmed live 2026-11-11 to be
 * identical between the QC Create/Update form (/operation) and the Inspector Create/Update form
 * (/inspector) — both are the same Yii2 model. Per-role text (headings, builders, the one known
 * existing record used for duplicate-mobile checks) lives in qc-user.data.ts / inspector.data.ts.
 */
export interface UserFormData {
  status?: 'Active' | 'In-Active';
  mobileNumber?: string;
  fullNameEn?: string;
  fullNameAr?: string;
  pin?: string;
  confirmPin?: string;
}

export const userFormText = {
  statusRequired: 'Status cannot be blank.',
  mobileNumberRequired: 'Mobile Number cannot be blank.',
  fullNameEnRequired: 'Full Name En cannot be blank.',
  /** No inline validator exists for this field (confirmed live on both forms); it is still
   * enforced, surfaced as a top-level `.alert-danger` banner instead of a per-field message. */
  fullNameArRequired: 'Full Name Ar cannot be blank.',
  pinRequired: 'Pin cannot be blank.',
  confirmPinRequired: 'Confirm Password cannot be blank.',
  pinTooShort: 'Password must be at least 6 digits',
  pinsDontMatch: "Pins don't match",
  mobileNumberTaken: (formattedMobileNumber: string) =>
    `${formattedMobileNumber} has already been taken.`,
  createdMessage: 'User Created Successfully',
  updatedMessage: 'User Updated Successfully',
  deleteConfirmMessage: 'Do you really want to delete this user(s)?',
} as const;
