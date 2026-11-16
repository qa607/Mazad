import { uniqueDigits } from '@utils/unique';
import type { UserFormData } from '@test-data/inspection/user-form.data';

export const inspectorText = {
  createHeading: 'Create Inspector',
  updateHeading: (name: string) => `Update Inspector: ${name}`,
} as const;

export const inspectorUrls = {
  list: '/inspector/index',
  create: '/inspector/create',
  update: (id: string) => `/inspector/update?id=${id}`,
  view: (id: string) => `/inspector/view?id=${id}`,
};

/**
 * The pre-existing, real Inspector record "QA TEST" (id 5464, +966512345678), confirmed present
 * 2026-11-09/2026-11-11. Used only as a known-taken mobile number for the duplicate-validation
 * test; it is never created, edited, or deleted by automation. The dedicated persistent account
 * these specs sign in and change the PIN on is a separate, automation-created record — see
 * getInspectionInspectorTestAccount() in config/credentials.config.ts.
 */
export const existingInspector = {
  id: '5464',
  fullNameEn: 'QA TEST',
  /** As entered in the form (no country code; the intl-tel-input widget adds +966). */
  localMobileNumber: '512345678',
  formattedMobileNumber: '+966512345678',
};

/** A unique, automation-created Inspector payload, valid and ready to submit. */
export function buildInspectorData(overrides: Partial<UserFormData> = {}): Required<UserFormData> {
  const suffix = uniqueDigits(8);
  return {
    status: 'Active',
    fullNameEn: `QA-AUTO INSPECTOR ${suffix}`,
    fullNameAr: `كيو ايه اوتو مفتش ${suffix}`,
    mobileNumber: `5${suffix}`,
    pin: '135790',
    confirmPin: '135790',
    ...overrides,
  };
}
