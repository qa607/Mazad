/**
 * Typed test categories for the iOS reports. Every declared test that does not run carries ONE
 * primary `category` annotation (why it is not run, by the precedence below) plus any number of
 * `also` annotations (further blockers), so a report can count the 68 tests instead of parsing
 * free-text skip reasons. A test that runs has no category.
 *
 * Precedence of the primary category (first that applies):
 *   excluded > fixme > pending-implementation > policy-blocked > authorization-blocked
 * "Passed" and "Failed" come from a run, not from annotations.
 */
export const TEST_CATEGORIES = [
  'excluded',
  'fixme',
  'pending-implementation',
  'policy-blocked',
  'authorization-blocked',
] as const;
export type TestCategory = (typeof TEST_CATEGORIES)[number];

/** Further blockers that never become a primary category on their own while another one exists. */
export const SECONDARY_TAGS = [...TEST_CATEGORIES, 'text-gate'] as const;
export type SecondaryTag = (typeof SECONDARY_TAGS)[number];

export const CATEGORY_ANNOTATION = 'category';
export const ALSO_ANNOTATION = 'also';

export interface CategoryAnnotation {
  type: string;
  description: string;
}

export interface Causes {
  excluded?: string;
  fixme?: string;
  pending?: string;
  policy?: string;
  authorization?: string;
  /** The full text and selector gate (IOS_TEXT_VERIFIED). */
  textGate?: string;
}

/**
 * The annotations for a test with these causes: the primary category by the precedence above, and
 * an `also` annotation for each other cause. Returns [] when nothing blocks the test (a runnable
 * test), including when only the text gate applies and it is not set.
 */
export function categoryAnnotations(causes: Causes): CategoryAnnotation[] {
  const present: [SecondaryTag, string][] = [];
  if (causes.excluded) present.push(['excluded', causes.excluded]);
  if (causes.fixme) present.push(['fixme', causes.fixme]);
  if (causes.pending) present.push(['pending-implementation', causes.pending]);
  if (causes.policy) present.push(['policy-blocked', causes.policy]);
  if (causes.authorization) present.push(['authorization-blocked', causes.authorization]);
  if (causes.textGate) present.push(['text-gate', causes.textGate]);
  if (!present.length) return [];
  // A test blocked only by the text gate still needs work before it can run.
  const primary: [SecondaryTag, string] =
    present[0][0] === 'text-gate' ? ['pending-implementation', present[0][1]] : present[0];
  const others = present.filter((entry) => entry !== present[0]);
  return [
    { type: CATEGORY_ANNOTATION, description: `${primary[0]}: ${truncate(primary[1])}` },
    ...others.map(([tag, reason]) => ({
      type: ALSO_ANNOTATION,
      description: `${tag}: ${truncate(reason)}`,
    })),
  ];
}

const truncate = (text: string) => (text.length > 160 ? `${text.slice(0, 157)}...` : text);

/** The category of an annotation list, or undefined for a test that runs. */
export function primaryCategory(
  annotations: readonly CategoryAnnotation[],
): TestCategory | undefined {
  const entry = annotations.find((a) => a.type === CATEGORY_ANNOTATION);
  const name = entry?.description.split(':')[0];
  return (TEST_CATEGORIES as readonly string[]).includes(name ?? '')
    ? (name as TestCategory)
    : undefined;
}

export function secondaryTags(annotations: readonly CategoryAnnotation[]): string[] {
  return annotations
    .filter((a) => a.type === ALSO_ANNOTATION)
    .map((a) => a.description.split(':')[0]);
}
