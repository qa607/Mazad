/**
 * Mazad Inspection backend > Waiting for QC (/car/waitingforqc, stg-224-inspection). Confirmed
 * live 2026-11-11, signed in as the dedicated QC test account (id 5480).
 *
 * There is no working way to create a disposable test vehicle (/car/create returns a real
 * server error — `Undefined variable: allow_change_inspection_only` — and there is no Admin UI
 * link to it either; vehicles only originate from the main Mazad backend + a physical Inspector
 * app inspection). Per explicit user direction, these specs instead use one designated, real,
 * pre-existing vehicle and treat any edits to it as acceptable test activity — never a second
 * vehicle, to keep the blast radius to exactly one real record.
 */
export const designatedVehicle = {
  id: '22865',
  vin: 'MHKEF8CF9NK010384',
  titleEn: 'Toyota Rush 2022',
  /** As shown in the grid; the plain row text does not include the double space the title link
   * sometimes renders with ("Toyota Rush  2022"). */
  make: 'Toyota',
};

export const waitingForQcText = {
  pageTitle: 'Cars : Waiting for QC',
  pageHeading: 'Cars : Waiting for QC',
  resetLinkText: 'Reset',
} as const;

export const waitingForQcUrls = {
  list: '/car/waitingforqc',
  qcCompletedList: '/car/qccompleted',
  view: (id: string) => `/car/view?id=${id}`,
  edit: (id: string) => `/car/update?id=${id}`,
  inspection: (id: string) => `/car/viewinspection?id=${id}`,
  photos: (id: string) => `/car/viewphotos?id=${id}`,
  markQcCompleted: (id: string) => `/car/markasqccompleted?id=${id}`,
};

/**
 * A free-text field on the Basic Info edit form (`CarCreateForm[sub_title_en]`) that is empty on
 * the designated vehicle and carries no business meaning beyond a descriptive subtitle — the
 * safest available field to prove edit + persistence without touching anything that affects
 * pricing, identity, or matching (VIN, title, supplier, status, etc). `note` was considered
 * first, but it is inside a `#photography-fields` section the app itself hides (`display:none`)
 * for this vehicle's inspection type — confirmed live, not a test bug.
 */
export const safeEditField = {
  modelAttribute: 'sub_title_en',
  testValue: 'QA-AUTO edit check (automation, safe to ignore)',
};
