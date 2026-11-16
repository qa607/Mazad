import { uniqueDigits } from '@utils/unique';
import type { InspectionType } from '@mobile/inspection-android/screens/new-vehicle.screen';

/**
 * A synthetic VIN that cannot collide with a real or previously-used vehicle: a fixed "ZQA"
 * prefix (not a real WMI) followed by unique digits. Never the VIN of vehicle 22865
 * (MHKEF8CF9NK010384) or any other existing record.
 */
export function uniqueSyntheticVin(): string {
  return `ZQA${uniqueDigits(14)}`;
}

export interface VehicleBasicInfoData {
  description: string;
  usage: string;
  city: string;
  location: string;
  supplier?: string;
  company?: string;
  make?: string;
  year?: string;
  grade: string;
  bodyColor?: string;
  interiorColor?: string;
  mileage: string;
  plateNumber: string;
  transmission?: string;
  engineType?: string;
  cylinders?: string;
  engineSize?: string;
  bodyType?: string;
  roof?: string;
  numberOfDoors?: string;
  numberOfSeats?: string;
  numberOfKeys: string;
  /** Photography/Salvage-only fields (confirmed live 2026-11-14) - see
   * VehicleBasicInfoScreen's doc comment for why B2B does not have these. */
  transporter?: string;
  claimNumber?: string;
  note?: string;
}

/**
 * QA Basic Info data for one synthetic vehicle. Select-field values are left undefined by
 * default so tests can pick "the first offered option" through
 * VehicleBasicInfoScreen.selectOption() rather than hardcoding a specific Make/Supplier/Color
 * that may not exist on every environment; a test that needs a *specific* value for its
 * assertion should pass it as an override.
 */
export function buildVehicleBasicInfoData(
  type: InspectionType,
  overrides: Partial<VehicleBasicInfoData> = {},
): VehicleBasicInfoData {
  const suffix = uniqueDigits(6);
  return {
    description: `QA-AUTO synthetic ${type} vehicle ${suffix} (automation, safe to ignore)`,
    usage: 'Private',
    city: 'Abha',
    location: `QA-AUTO location ${suffix}`,
    grade: `QA-AUTO-GRADE-${suffix}`,
    mileage: '50000',
    // "ABJ", not a "Q..." prefix: confirmed live that the Plate Number field silently rejects
    // (drops) a leading "Q" - consistent with Saudi vehicle plates excluding Latin letters with
    // no direct Arabic-letter equivalent. The field's own placeholder ("A B J 1234") confirms
    // A/B/J are valid.
    plateNumber: `ABJ ${suffix.slice(0, 4)}`,
    numberOfKeys: '2',
    transporter: `QA-AUTO transporter ${suffix}`,
    claimNumber: `QA-AUTO-CLAIM-${suffix}`,
    note: `QA-AUTO note ${suffix}`,
    ...overrides,
  };
}
