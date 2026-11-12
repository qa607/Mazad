import type { BackendRole } from '@config/credentials.config';
import { testRecordPrefix } from '@test-data/backend-common.data';
import { uniqueDigits } from '@utils/unique';

/**
 * Mazad Backend "Delivery Companies" test data: the Tracking page ("Tracking Companies Section")
 * and the Companies page. Texts, options and rules were read from the staging Backend (stg-154) on
 * 2026-11-11 with Dev Root; nothing here is assumed. The Backend has no localization, so its text
 * lives here, and Arabic is checked as data (company names, exports). Record counts are never fixed:
 * tests read them from the pages.
 */
export const trackingText = {
  pageTitle: 'Tracking Companies Section',
  noResults: 'No results found.',
  columnHeaders: [
    'Vin number',
    'Plate number',
    'Tracking Link',
    'Delivery company',
    'From',
    'To',
    'Date of delivery',
  ],
  /** What the Tracking Link column shows for every row (the link itself is edited in a popup). */
  editLink: 'Edit Link',
  linkDialogTitle: 'Update Tracking Link',
  linkMaxLength: 1000,
  linkTooLong: 'Tracking Link should contain at most 1,000 characters.',
} as const;

export const trackingData = {
  pageSize: 20,
  partialVinLength: 6,
  partialPlateLength: 3,
  unknownVin: 'ZZZZZZZZZZ0000000',
  unknownPlate: 'QQQQQQ',
  unknownTrackingLink: 'zzzz-no-such-link',
  /** Delivery company ID that no company has. */
  invalidCompanyId: '999',
  /** The three delivery companies the filter offers. */
  deliveryCompanies: ['SMB - Jeddah', 'SMB - Riyadh - Al-Janadriyah', 'SMB - Dammam'],
  /** A few of the delivery cities the filter offers (it has 33). */
  sampleCities: ['Riyadh', 'Jeddah', 'Dammam'],
  /** Export columns of the Tracking page, in order (CSV, XLS, XLSX). */
  exportColumns: [
    'Vin number',
    'Plate number',
    'Tracking Link',
    'Delivery company',
    'From',
    'To',
    'Date of delivery',
  ],
  exportFileName: {
    Csv: /^Tracking Companies Section \d{4}-\d{2}-\d{2}\.csv$/,
    Xls: /^Tracking Companies Section \d{4}-\d{2}-\d{2}\.xls$/,
    Xlsx: /^Tracking Companies Section \d{4}-\d{2}-\d{2}\.xlsx$/,
  },
  exportConfirmMessage: /export file will be generated for download/i,
} as const;

export const companyText = {
  listTitle: 'Delivery Companies',
  noResults: 'No results found.',
  columnHeaders: ['#', 'ID', 'Arabic Name', 'English Name', 'Status', 'Actions'],
  createButton: 'Create Delivery Company',
  deleteConfirm: 'Are you sure to delete this item?',
  required: {
    arabicName: 'Arabic Name cannot be blank.',
    englishName: 'English Name cannot be blank.',
    email: 'Email cannot be blank.',
  },
  invalidEmail: 'Email is not a valid email address.',
  arabicNameTooLong: 'Arabic Name should contain at most 100 characters.',
  englishNameTooLong: 'English Name should contain at most 100 characters.',
  invalidPhone: 'The format of Phone Number is invalid.',
  phoneTooLong: 'Phone Number should contain at most 15 characters.',
  exportColumns: [
    'ID',
    'Arabic Name',
    'English Name',
    'Email',
    'Phone Number',
    'Status',
    'Created At',
    'Updated At',
  ],
  exportFileName: /^Delivery Companies \d{4}-\d{2}-\d{2}\.csv$/,
  nameMaxLength: 100,
  emailMaxLength: 100,
  phoneMaxLength: 15,
} as const;

/** The three existing delivery companies (read-only: none is ever changed). */
export const existingCompanies = [
  {
    id: '1',
    arabicName: 'شركة سعيد محمد البسامي - جده',
    englishName: 'SMB - Jeddah',
    status: 'Published',
  },
  {
    id: '2',
    arabicName: 'شركة سعيد محمد البسامي - الرياض - الجنادرية',
    englishName: 'SMB - Riyadh - Al-Janadriyah',
    status: 'Published',
  },
  {
    id: '3',
    arabicName: 'شركة سعيد محمد البسامي - الدمام',
    englishName: 'SMB - Dammam',
    status: 'Published',
  },
] as const;

export const companyData = {
  /** Text that matches no company name. */
  unknownArabicName: 'لا يوجد هذا الاسم',
  unknownEnglishName: 'zzz-no-such-company',
  /** Part of every existing English name, and of every Arabic name. */
  commonEnglishPart: 'SMB',
  commonArabicPart: 'سعيد',
} as const;

/** Phone formats the form accepts and refuses (checked as you leave the field; nothing is saved). */
export const phoneCases = {
  valid: ['512345678', '0512345678', '+966512345678', '500000000', '+14155552671'],
  invalid: ['966512345678', '0000000000', 'abc', '123'],
  tooLong: '1'.repeat(20),
} as const;

/** The marker every test-created record carries. */
export const qaAutoMarker = testRecordPrefix;

/** A unique, synthetic QA-AUTO company for the one authorized creation. No real person or company data. */
export function newQaAutoCompany() {
  const stamp = uniqueDigits(8);
  return {
    stamp,
    arabicName: `${testRecordPrefix} شركة توصيل اختبار ${stamp}`,
    englishName: `${testRecordPrefix} Delivery Test ${stamp}`,
    email: `qa.auto.delivery.${stamp}@example.com`,
    phone: '0555000111',
  };
}

/** A well-formed e-mail address of exactly `length` characters (short local part, labels within 63). */
export function emailOfLength(length: number): string {
  const fixed = 'qa@'.length + '.com'.length;
  const labels: string[] = [];
  let left = length - fixed;
  while (left > 0) {
    const size = Math.min(60, left);
    labels.push('a'.repeat(size));
    left -= size;
    if (left > 0) left -= 1; // the dot between labels
  }
  return `qa@${labels.join('.')}.com`;
}

/** Where a signed-in role is expected to land, from each role's permission page (2026-11-11). */
export interface ExpectedDeliveryAccess {
  label: string;
  tracking: boolean;
  companies: boolean;
  /** Delete link on Companies rows: only the wildcard `/deliveryCompany/*` grants it. */
  deleteLink: boolean;
  /** Super Admin has no Delete permission and no Delete link. */
  editLink: boolean;
}

export const expectedDeliveryAccess: Record<
  'superAdmin' | Exclude<BackendRole, 'supplier'>,
  ExpectedDeliveryAccess
> = {
  superAdmin: {
    label: 'Super Admin',
    tracking: true,
    companies: true,
    deleteLink: false,
    editLink: true,
  },
  auctionSupervisor: {
    label: 'Auction Supervisor',
    tracking: true,
    companies: true,
    deleteLink: true,
    editLink: true,
  },
  auctionTeam: {
    label: 'Auction Team',
    tracking: false,
    companies: true,
    deleteLink: false,
    editLink: false,
  },
  customerSupport: {
    label: 'Customer Support',
    tracking: false,
    companies: false,
    deleteLink: false,
    editLink: false,
  },
  operation: {
    label: 'operation',
    tracking: false,
    companies: false,
    deleteLink: false,
    editLink: false,
  },
  noAuctionAccess: {
    label: 'Marketing (no auction access)',
    tracking: false,
    companies: false,
    deleteLink: false,
    editLink: false,
  },
};

export const forbiddenStatus = 403;

/** Addresses of the read-only pages, for direct-access checks (GET only). */
export const deliveryPaths = {
  tracking: '/backend/deliveryCompany/delivery-company/tracking',
  companies: '/backend/deliveryCompany/delivery-company/index',
  create: '/backend/deliveryCompany/delivery-company/create',
  view: (id: string) => `/backend/deliveryCompany/delivery-company/view?id=${id}`,
  update: (id: string) => `/backend/deliveryCompany/delivery-company/update?id=${id}`,
} as const;
