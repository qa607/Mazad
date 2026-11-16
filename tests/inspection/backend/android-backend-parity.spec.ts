import { expect, test } from '@fixtures/inspection.fixture';

/**
 * Android-to-backend field parity check: for a vehicle created and sent through the physical
 * Inspector Android app (see tests/inspection/android/vehicle-lifecycle.spec.ts, which prints each
 * run's exact `enteredFields` to stdout), confirms the staging backend's own Waiting for QC record
 * shows a matching VIN, status, Basic Info fields, inspection-point conditions and a non-zero
 * uploaded-photo count — not just that the mobile app's own UI considered the send successful.
 *
 * VINs below are from real automated vehicle-lifecycle.spec.ts runs on 2026-11-14 (stg-224-inspection):
 *   B2B:          ZQA00179467832201
 *   Photography:  ZQA00179467846603
 *   Salvage:      ZQA00179467864201
 * Read-only: never edits or deletes these records. No new synthetic data is created here.
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const VINS_UNDER_TEST = [
  { type: 'B2B', vin: 'ZQA00179467832201' },
  { type: 'Photography', vin: 'ZQA00179467846603' },
  { type: 'Salvage', vin: 'ZQA00179467864201' },
  { type: 'B2B', vin: 'ZQA00179468690201' },
  { type: 'Photography', vin: 'ZQA00179468710501' },
  { type: 'Salvage', vin: 'ZQA00179468723401' },
] as const;

/** Exact Android input snapshots captured from three successful live device lifecycles. */
const ANDROID_INPUT_SNAPSHOTS: Record<string, Record<string, string>> = {
  ZQA00179468690201: {
    'Vehicle Description': 'QA-AUTO synthetic B2B vehicle 690702 (automation, safe to ignore)',
    Usage: 'Private',
    City: 'Abha',
    Location: 'QA-AUTO location 690702',
    Grade: 'QA-AUTO-GRADE-690702',
    Mileage: '50000',
    'Plate Number': 'ABJ 6907',
    'Number of Keys': '2',
    Supplier: 'البنك الاهلي السعودي',
    Company: 'National Bank of Saudi Arabia',
    Warehouse: 'Jeddah - Ewwa Huda Al Sham',
    Make: 'ABARTH',
    Model: '695',
    Year: '1990',
    'Body Color': 'Beige',
    'Interior Color': 'Black',
    Transmission: 'Automatic',
    'Engine Type': 'Diesel',
    Cylinders: '0',
    'Engine Size': '2000',
    'Body Type': ' Equipment- Sweeper',
    Roof: 'Carbon Fiber Roof',
    'Number of Doors': '1',
    'Number of Seats': '2',
  },
  ZQA00179468710501: {
    'Vehicle Description':
      'QA-AUTO synthetic Photography vehicle 711002 (automation, safe to ignore)',
    Transporter: 'QA-AUTO transporter 711002',
    Grade: 'QA-AUTO-GRADE-711002',
    'Plate Number': 'ABJ 7110',
    'Number of Keys': '2',
    'Claim Number': 'QA-AUTO-CLAIM-711002',
    Note: 'QA-AUTO note 711002',
    'Vehicle Condition': 'Damaged',
    'Transferred From': 'Abha',
    'Transferred To': 'Jeddah',
    Supplier: 'البنك الاهلي السعودي',
    Company: 'National Bank of Saudi Arabia',
    Warehouse: 'Jeddah - Ewwa Huda Al Sham',
    Make: 'ABARTH',
    Model: '695',
    Year: '1990',
  },
  ZQA00179468723401: {
    'Vehicle Description': 'QA-AUTO synthetic Salvage vehicle 723902 (automation, safe to ignore)',
    Usage: 'Private',
    City: 'Abha',
    Location: 'QA-AUTO location 723902',
    Grade: 'QA-AUTO-GRADE-723902',
    Mileage: '50000',
    'Plate Number': 'ABJ 7239',
    'Number of Keys': '2',
    Supplier: 'البنك الاهلي السعودي',
    Company: 'National Bank of Saudi Arabia',
    Warehouse: 'Jeddah - Ewwa Huda Al Sham',
    Make: 'ABARTH',
    Model: '695',
    Year: '1990',
    'Body Color': 'Beige',
    'Interior Color': 'Black',
    Transmission: 'Automatic',
    'Engine Type': 'Diesel',
    Cylinders: '0',
    'Engine Size': '2000',
    'Body Type': ' Equipment- Sweeper',
    Roof: 'Carbon Fiber Roof',
    'Number of Doors': '1',
    'Number of Seats': '2',
  },
};

const BACKEND_FIELD_LABELS: Record<string, string> = {
  'Vehicle Description': 'Sub Title En',
  'Plate Number': 'Plate Number En',
  'Vehicle Condition': 'Car Condition',
  Usage: 'Usage ID',
  Mileage: 'Odometer (km)',
  'Number of Keys': 'No Of Keys',
  Transmission: 'Transmission Type',
  'Engine Type': 'Fuel Type',
  Cylinders: 'No. of cylinders',
  'Engine Size': 'Engine Size (ccm)',
  Roof: 'Roof Type',
  'Number of Doors': 'No. of Doors',
  'Number of Seats': 'No of Seats',
  Grade: 'Grade En',
};

const RECENT_DEVICE_VINS = Object.keys(ANDROID_INPUT_SNAPSHOTS);
const FRONT_PHOTO_NOTES: Record<string, { arabic: string; english: string }> = {
  ZQA00179468690201: {
    arabic: 'ملاحظة QA-AUTO لصورة B2B',
    english: 'QA-AUTO B2B Front photo note',
  },
  ZQA00179468710501: {
    arabic: 'ملاحظة QA-AUTO لصورة Photography',
    english: 'QA-AUTO Photography Front photo note',
  },
  ZQA00179468723401: {
    arabic: 'ملاحظة QA-AUTO لصورة Salvage',
    english: 'QA-AUTO Salvage Front photo note',
  },
};

/**
 * Android-side values independently recoverable from checked-in test data and the recorded
 * investigation notes for these existing runs. The remaining entered values are generated at
 * runtime (random suffixes and the first available dropdown option) and the lifecycle stdout was
 * not preserved in this checkout; reading those values back from the backend would be circular,
 * so they are reported as unavailable instead of being treated as parity evidence.
 */
const INDEPENDENT_ANDROID_EXPECTATIONS: Record<
  string,
  Record<string, { backendLabel: string; value: string }>
> = {
  B2B: {
    Usage: { backendLabel: 'Usage ID', value: 'Private' },
    City: { backendLabel: 'City', value: 'Abha' },
    Mileage: { backendLabel: 'Odometer (km)', value: '50000' },
    'Number of Keys': { backendLabel: 'No Of Keys', value: '2' },
  },
  Photography: {
    'Transferred From': { backendLabel: 'Transferred From', value: 'Abha' },
    'Transferred To': { backendLabel: 'Transferred To', value: 'Jeddah' },
    'Number of Keys': { backendLabel: 'No Of Keys', value: '2' },
  },
  Salvage: {
    Usage: { backendLabel: 'Usage ID', value: 'Private' },
    City: { backendLabel: 'City', value: 'Abha' },
    Mileage: { backendLabel: 'Odometer (km)', value: '50000' },
    'Number of Keys': { backendLabel: 'No Of Keys', value: '2' },
  },
};

function backendExpectationsFor(vin: string, type: string) {
  const snapshot = ANDROID_INPUT_SNAPSHOTS[vin];
  if (!snapshot) return INDEPENDENT_ANDROID_EXPECTATIONS[type];
  return Object.fromEntries(
    Object.entries(snapshot)
      .filter(([androidLabel]) => androidLabel !== 'Model')
      .map(([androidLabel, value]) => [
        androidLabel,
        { backendLabel: BACKEND_FIELD_LABELS[androidLabel] ?? androidLabel, value: value.trim() },
      ]),
  ) as Record<string, { backendLabel: string; value: string }>;
}

/** Reads persisted values from the backend edit form, including selects hidden by Select2. */
async function readPersistedEditFields(
  page: import('@playwright/test').Page,
): Promise<Record<string, string>> {
  return page.locator('.form-group').evaluateAll((groups) => {
    const fields: Record<string, string> = {};
    for (const group of groups) {
      const label = group.querySelector('label')?.textContent?.trim();
      const control = group.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('input, select, textarea');
      if (!label || !control) continue;
      fields[label] =
        control instanceof HTMLSelectElement
          ? (control.selectedOptions[0]?.textContent?.trim() ?? '')
          : control.value.trim();
    }
    return fields;
  });
}

test.describe('Inspection Backend - Android-to-backend parity', { tag: ['@regression'] }, () => {
  for (const { type, vin } of VINS_UNDER_TEST) {
    test(`${type} vehicle ${vin}: compare independently known Android values and backend record`, async ({
      qcSession,
      inspectionPagesOn,
    }) => {
      const {
        waitingForQcListPage: list,
        vehicleViewPage: view,
        vehicleEditPage: edit,
        vehicleInspectionPage: inspection,
      } = inspectionPagesOn(qcSession);
      await list.goto();
      await list.vinInput.fill(vin);
      await list.search();

      const counts = await list.summaryCounts();
      test
        .info()
        .annotations.push({ type: 'backend-row-count', description: String(counts.total) });
      expect(
        counts.total,
        `exactly one backend row for VIN ${vin} (no missing/duplicate record)`,
      ).toBe(1);

      const row = list.rows.first();
      const id = await row.getAttribute('data-key');
      expect(id, 'row has a record id').not.toBeNull();
      test.info().annotations.push({ type: 'backend-id', description: String(id) });

      await view.goto(id!);
      await expect(view.vinValue).toHaveText(vin);
      await expect(view.statusValue).toHaveText('WAITING FOR QC');

      const fields = await view.readAllFields();
      test.info().annotations.push({ type: 'backend-fields', description: JSON.stringify(fields) });
      await edit.goto(id!);
      const persisted = await readPersistedEditFields(qcSession);
      const expected = backendExpectationsFor(vin, type);
      const unavailable = Object.keys(persisted).filter(
        (label) =>
          !Object.values(expected).some((field) => field.backendLabel === label) &&
          label !== 'VIN' &&
          label !== 'Status',
      );
      const notDirectlyComparable = RECENT_DEVICE_VINS.includes(vin)
        ? [
            'Model (backend Edit form shows the placeholder “Loading …”; its actual selected text is unavailable)',
          ]
        : [];
      test.info().annotations.push({
        type: 'android-values-unavailable',
        description:
          (RECENT_DEVICE_VINS.includes(vin)
            ? 'Exact Android snapshot is attached to the successful device lifecycle run. Backend ' +
              'fields without a corresponding Android-entered value are excluded: '
            : 'Original enteredFields output was not retained for this VIN. These backend fields are ' +
              'not independently comparable: ') +
          unavailable.join(', ') +
          (notDirectlyComparable.length
            ? `; Android fields: ${notDirectlyComparable.join(', ')}`
            : ''),
      });
      console.log(
        `[backend-parity] ${type} ${vin} id=${id} independentlyComparable=${JSON.stringify(expected)} ` +
          `backendPersisted=${JSON.stringify(persisted)} unavailableAndroidSource=${JSON.stringify(unavailable)} ` +
          `notDirectlyComparable=${JSON.stringify(notDirectlyComparable)}`,
      );
      expect
        .soft(persisted['Inspection Type'], `${vin} is stored as the Android-selected ${type} type`)
        .toBe(type);
      for (const [label, { backendLabel, value }] of Object.entries(expected)) {
        expect
          .soft(
            persisted[backendLabel],
            `${type} Android-entered ${label} matches persisted backend field ${backendLabel}`,
          )
          .toBe(value.trim());
      }

      await inspection.goto(id!);
      const names = await inspection.pointNames();
      const inspectionPointValues = await Promise.all(
        names.map(async (name) => ({ name, selected: await inspection.selectedOptions(name) })),
      );
      // Business rule (confirmed): Essentials & Body exists ONLY for B2B - Photography and
      // Salvage have no such tab on the mobile side at all (see createVehicleThroughPhotos's own
      // `if (type === 'B2B')` guard around fillMinimalEssentialsBody() in vehicle-creation.flow.ts).
      // Only B2B's automated run ever submits a Hood condition; Photography and Salvage correctly
      // submit none, so zero inspection points on the backend is the EXPECTED outcome for both.
      if (type === 'B2B') {
        expect
          .soft(names, 'B2B backend exposes the known set of 21 inspection-point rows')
          .toHaveLength(21);
        const expectedPoints = names.map((name) => ({
          name,
          selected: name === 'Hood' ? ['Normal'] : [],
        }));
        expect
          .soft(
            inspectionPointValues,
            'B2B backend inspection points contain Hood: Normal and no other Android selections',
          )
          .toEqual(expectedPoints);
      } else {
        expect
          .soft(names, `${type} has no inspection points because Essentials & Body is B2B-only`)
          .toEqual([]);
      }
      console.log(
        `[backend-parity] ${type} ${vin} inspectionPoints=${JSON.stringify(inspectionPointValues)}`,
      );

      await view.goto(id!);
      await view.photosLink.click();
      await qcSession.waitForURL((url) => url.pathname === '/car/viewphotos');
      const backendPhotoRecords = await qcSession
        .locator('a[data-fancybox="photos-section"]')
        .evaluateAll((anchors) =>
          anchors.map((anchor) => ({
            angle: anchor.getAttribute('data-title') ?? '',
            src: anchor.getAttribute('data-src') ?? '',
            arabicNote: anchor.getAttribute('data-caption') ?? '',
            englishNote: anchor.getAttribute('data-captionen') ?? '',
          })),
        );
      const photoEvidence = await qcSession.locator('img').evaluateAll((images) =>
        images.map((image) => ({
          src: (image as HTMLImageElement).getAttribute('src') ?? '',
          alt: (image as HTMLImageElement).getAttribute('alt') ?? '',
          parentText: image.parentElement?.parentElement?.textContent?.trim() ?? '',
          parentHtml: image.parentElement?.parentElement?.outerHTML.slice(0, 1_500) ?? '',
        })),
      );
      const renderedPhotoPageText = await qcSession.locator('body').innerText();
      const expectedPhotoNotes = FRONT_PHOTO_NOTES[vin];
      const displayedPhotoNotes = expectedPhotoNotes
        ? Object.fromEntries(
            Object.entries(expectedPhotoNotes).map(([language, note]) => [
              language,
              renderedPhotoPageText.includes(note),
            ]),
          )
        : undefined;
      const photoSources = [
        ...new Set(
          photoEvidence
            .map((photo) => photo.src)
            .filter((src) =>
              /^https:\/\/s3\.eu-central-1\.amazonaws\.com\/app-auctions\.motory\.com\//i.test(src),
            ),
        ),
      ];
      const angleNames = ['Front', 'Left Side', 'Back', 'Right Side'];
      const photoAssociationHints = photoEvidence
        .filter((photo) => photoSources.includes(photo.src))
        .map((photo) => ({
          src: photo.src,
          candidateLabels: angleNames.filter((angle) =>
            `${photo.alt} ${photo.parentText} ${photo.parentHtml}`
              .toLowerCase()
              .includes(angle.toLowerCase()),
          ),
        }));
      expect(qcSession.url(), 'backend photo collection belongs to the matched record').toContain(
        `id=${id}`,
      );
      expect(
        backendPhotoRecords.map((photo) => photo.angle),
        'backend photo links preserve the Android capture angle association in order',
      ).toEqual(['Front', 'Left Side', 'Back', 'Right Side']);
      expect(
        new Set(backendPhotoRecords.map((photo) => photo.src)).size,
        'backend exposes four unique photo assets on angle-associated links',
      ).toBe(4);
      console.log(
        `[backend-parity] ${type} ${vin} photoPage=${qcSession.url()} ` +
          `photoEvidence=${JSON.stringify(photoEvidence)}`,
      );
      test.info().annotations.push({
        type: 'backend-photo-evidence',
        description: JSON.stringify({ photoEvidence, photoAssociationHints }),
      });
      test.info().annotations.push({
        type: 'backend-photo-association-comparison',
        description: JSON.stringify({
          records: backendPhotoRecords.map(({ angle, src }) => ({ angle, src })),
          comparison: 'compared: each distinct backend asset is linked to its captured angle',
        }),
      });
      if (expectedPhotoNotes) {
        const frontPhotoRecord = backendPhotoRecords.find((photo) => photo.angle === 'Front');
        console.log(
          `[backend-photo-notes] ${vin} expected=${JSON.stringify(expectedPhotoNotes)} ` +
            `persisted=${JSON.stringify({ arabic: frontPhotoRecord?.arabicNote, english: frontPhotoRecord?.englishNote })}`,
        );
        expect(frontPhotoRecord, 'backend exposes the Android Front photo').toBeDefined();
        expect
          .soft(
            frontPhotoRecord?.arabicNote,
            'backend persists the exact Arabic note entered on the Front photo',
          )
          .toBe(expectedPhotoNotes.arabic);
        expect
          .soft(
            frontPhotoRecord?.englishNote,
            'backend persists the exact English note entered on the Front photo',
          )
          .toBe(expectedPhotoNotes.english);
        test.info().annotations.push({
          type: 'backend-photo-note-comparison',
          description: JSON.stringify({
            expectedAndroidNotes: expectedPhotoNotes,
            backendFrontPhotoNotes: {
              arabic: backendPhotoRecords.find((photo) => photo.angle === 'Front')?.arabicNote,
              english: backendPhotoRecords.find((photo) => photo.angle === 'Front')?.englishNote,
            },
            pageTextAlsoContainsNotes: displayedPhotoNotes,
            comparison: 'compared against the backend photo caption fields',
          }),
        });
      }
      // We can count vehicle-photo candidates from the rendered Photos page, but the current
      // page exposes no stable section label, note field, or vehicle-id association on each image.
      // The URL itself binds this rendered collection to the uniquely identified record.
      expect
        .soft(
          photoSources.length,
          `${type}'s existing backend Photos page has 4 unique vehicle photos`,
        )
        .toBe(4);
      test.info().annotations.push({
        type: 'photo-association-and-notes-limitations',
        description:
          'The rendered image markup is recorded. The collection is bound to the uniquely matched ' +
          'record by the URL; per-angle associations are only compared when the backend supplies a label.',
      });
    });
  }
});

/**
 * Photography's "Transferred From" field (confirmed business requirement, not optional): traced
 * 2026-11-14 for vehicle id 22883 (VIN ZQA00179467846603, Transferred From entered as "Abha" on
 * the mobile side - see this file's own `enteredFields` log above).
 *
 * Root cause, confirmed via direct HTML evidence (not inferred):
 *   - The Edit form (`/car/update?id=22883`) DOES correctly persist and display it: its
 *     `CarCreateForm[origin_city_id]` <select>, labelled "Transferred From", has
 *     `<option value="29" selected>Abha</option>` - the submitted value reached the backend and
 *     was saved correctly, and "Transferred To" (`CarCreateForm[city_id]`, a separate field) is
 *     independently preserved as "Jeddah" - the two are NOT conflated or overwriting each other.
 *   - The read-only View page (`/car/view?id=22883`) has ZERO occurrences of "Transferred",
 *     "origin_city" or "Abha" anywhere in its rendered HTML - the field is simply missing from that
 *     page's own template, not mislabeled or hidden behind a tooltip.
 *   - This is Scenario C (a backend display/template gap), not a mobile/API submission issue
 *     (Scenario A), not a persistence issue (Scenario B), and not a field-mapping conflation
 *     (Scenario D) - all three of those are ruled out by the Edit form's own correct, independent
 *     values for both fields.
 *
 * This is an external backend application (stg-224-inspection, not part of this repo) - its
 * template cannot be fixed from here. This test documents the confirmed defect as failing
 * (`@known-bug`), not masked or skipped, so it stays visible until the backend's own View template
 * is updated to render Photography's `origin_city_id` field.
 */
test.describe('Inspection Backend - Photography Transferred From', { tag: ['@regression'] }, () => {
  test(
    'Transferred From persists correctly but is missing from the read-only View page',
    { tag: ['@known-bug'] },
    async ({ qcSession, inspectionPagesOn }) => {
      // The View-page assertion below is a confirmed, currently-failing backend defect (see this
      // describe block's own doc comment) - expected to fail until the backend's View template is
      // updated, not masked or skipped.
      test.fail();

      const { vehicleEditPage: edit, vehicleViewPage: view } = inspectionPagesOn(qcSession);
      const id = '22883';

      // Persistence is correct: proves this is a display gap, not data loss, not a mapping
      // conflation between Transferred From and Transferred To.
      await edit.goto(id);
      const transferredFrom = await edit.selectedOptionText('origin_city_id');
      const transferredTo = await edit.selectedOptionTextOf(edit.transferredToSelect);
      expect(transferredFrom, 'Transferred From is persisted on the Edit form').toBe('Abha');
      expect(transferredTo, 'Transferred To is independently preserved, not overwritten').toBe(
        'Jeddah',
      );

      // The View page omits the field entirely - this is the actual confirmed defect.
      await view.goto(id);
      const fields = await view.readAllFields();
      expect(
        fields['Transferred From'],
        'Known backend defect: the read-only View page has no "Transferred From" field at all, ' +
          'even though the Edit form confirms the value ("Abha") is correctly persisted.',
      ).toBe('Abha');
    },
  );
});
