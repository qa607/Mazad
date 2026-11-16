import { uniqueDigits } from '@utils/unique';

/** The Inspection backend has no localization (confirmed 2026-11-11, same as the main Backend). */
export interface QcUserFormData {
  status?: 'Active' | 'In-Active';
  mobileNumber?: string;
  fullNameEn?: string;
  fullNameAr?: string;
  pin?: string;
  confirmPin?: string;
}

/**
 * Text and validation messages confirmed live against stg-224-inspection on 2026-11-11.
 * Full Name Ar has no inline `required` validator (no error on a wholly empty submit), but
 * Create still refuses to save without it, surfaced as a top-level `.alert-danger` banner
 * ("Full Name Ar cannot be blank.") rather than the per-field `.help-block` every other
 * required field uses — a real, confirmed app inconsistency, not an assumption.
 */
export const qcUserText = {
  createHeading: 'Create QC User',
  updateHeading: (name: string) => `Update QC User: ${name}`,
  createdMessage: 'User Created Successfully',
  updatedMessage: 'User Updated Successfully',
  statusRequired: 'Status cannot be blank.',
  mobileNumberRequired: 'Mobile Number cannot be blank.',
  fullNameEnRequired: 'Full Name En cannot be blank.',
  fullNameArRequired: 'Full Name Ar cannot be blank.',
  pinRequired: 'Pin cannot be blank.',
  confirmPinRequired: 'Confirm Password cannot be blank.',
  pinTooShort: 'Password must be at least 6 digits',
  pinsDontMatch: "Pins don't match",
  mobileNumberTaken: (formattedMobileNumber: string) =>
    `${formattedMobileNumber} has already been taken.`,
  deleteConfirmMessage: 'Do you really want to delete this user(s)?',
} as const;

export const qcUserUrls = {
  list: '/operation/index',
  create: '/operation/create',
  update: (id: string) => `/operation/update?id=${id}`,
  view: (id: string) => `/operation/view?id=${id}`,
};

/**
 * The pre-existing QC record "Ahmed Moussa" (id 5333), confirmed present 2026-11-11. Used only
 * as a known-taken mobile number for the duplicate-validation test; this record itself must
 * never be created, edited, or deleted by automation.
 */
export const existingQcUser = {
  id: '5333',
  fullNameEn: 'Ahmed Moussa',
  /** As entered in the form (no country code; the intl-tel-input widget adds +966). */
  localMobileNumber: '567424945',
  formattedMobileNumber: '+966567424945',
};

/** A unique, automation-created QC user payload, valid and ready to submit. */
export function buildQcUserData(overrides: Partial<QcUserFormData> = {}): Required<QcUserFormData> {
  const suffix = uniqueDigits(8);
  return {
    status: 'Active',
    fullNameEn: `QA-AUTO QC ${suffix}`,
    fullNameAr: `كيو ايه اوتو ${suffix}`,
    mobileNumber: `5${suffix}`,
    pin: '135790',
    confirmPin: '135790',
    ...overrides,
  };
}
