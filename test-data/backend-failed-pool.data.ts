/**
 * The dedicated QA-AUTO pool for the Failed List's destructive workflows. Every destructive
 * scenario uses its own vehicle, so a scenario can never consume another's. Nothing here is a
 * secret: VINs and IDs only. Real trial-company vehicles are never listed.
 *
 *
 * Destructive tests also need FAILED_DESTRUCTIVE_APPROVED=true in the shell environment. The
 * switch is a deliberate second lock: it is set per run, only after the QA owner approves the
 * VIN, the action, the destination and the data it changes.
 */
export const failedPool = {
  /** Supplier that owns every pool vehicle (shown in grids as "شركة تجريبية-<id>"). */
  supplierId: '45961',
  /** Admin name given to the pool supplier (the grids show the CR company name instead). */
  supplierAdminName: 'QA-AUTO Failed Pool',
  /** Title of the compatible AWAITING auction owned by the pool supplier. */
  addTargetAuctionTitle: 'QA-AUTO Add Target',
  /** One vehicle per destructive scenario, by VIN (without the "#F<n>" mark). */
  vehicles: {
    /** FL-INV-08: invoice upload. */
    invoice: '',
    /** FL-RPR-05: re-pricing saved. */
    reprice: '',
    /** FL-CRE-05: Create Auction, then Back to upcoming. */
    createAuction: '',
    /** FL-ADD-04: Add to Auction. */
    addToAuction: '',
    /** FL-SUS-05: Suspend, then Activate. */
    suspend: '',
    /** FL-DIR-09: Direct Sale. Needs two or more distinct bidders and a highest price above 0. */
    directSale: '',
  },
  /** Vehicles whose popups are opened and closed but never committed. */
  probes: {
    /** Any failed vehicle: invoice, suspend and re-pricing negatives. */
    general: '',
    /** A failed vehicle with bids: Direct Sale popup and validation. */
    withBids: '',
    /** A failed vehicle with no bids: Direct Sale must not be offered. */
    noBids: '',
  },
} as const;

export type PoolVehicleKey = keyof typeof failedPool.vehicles;
export type PoolProbeKey = keyof typeof failedPool.probes;

const unset = (value: string) => value.trim() === '';

/** Names of the pool entries that still have no VIN. Empty when the pool is fully prepared. */
export function missingPoolEntries(): string[] {
  return [
    ...(unset(failedPool.supplierId) ? ['supplierId'] : []),
    ...Object.entries(failedPool.vehicles)
      .filter(([, vin]) => unset(vin))
      .map(([key]) => `vehicles.${key}`),
    ...Object.entries(failedPool.probes)
      .filter(([, vin]) => unset(vin))
      .map(([key]) => `probes.${key}`),
  ];
}

/** Why a destructive test must skip, or null when it may run. */
export function destructiveSkipReason(needs: readonly PoolVehicleKey[]): string | null {
  const missing = needs.filter((key) => unset(failedPool.vehicles[key]));
  if (unset(failedPool.supplierId) || missing.length > 0) {
    return `QA-AUTO pool not prepared (no VIN for: ${missing.join(', ') || 'supplier'}). See docs/failed-list-qa-pool-handoff.md.`;
  }
  if (process.env.FAILED_DESTRUCTIVE_APPROVED !== 'true') {
    return 'Destructive Failed List tests need explicit approval: set FAILED_DESTRUCTIVE_APPROVED=true for this run.';
  }
  return null;
}

/** Why a probe test must skip, or null when it may run. */
export function probeSkipReason(key: PoolProbeKey): string | null {
  return unset(failedPool.probes[key])
    ? `QA-AUTO probe vehicle "${key}" not prepared. See docs/failed-list-qa-pool-handoff.md.`
    : null;
}
