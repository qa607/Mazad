/**
 * Deletes exactly one anonymous Firebase auth user, using its OWN ID token (the Identity Toolkit
 * API lets a user delete itself this way; no admin/service-account credential is needed or held
 * anywhere in this repo). This never goes through the browser's network guard: it is a plain
 * server-side call from the test process, not a request the guarded page makes, so it needs no
 * exception in src/network/request-guard.ts and cannot reach any other Firebase or Mazad endpoint.
 *
 * Used only by the Web registration spec, for anonymous sessions ITS OWN tests created (captured
 * via installGuestGuard's onFirebaseSignup callback). Never deletes any other account.
 */
export interface FirebaseAnonymousSession {
  localId: string;
  idToken: string;
  apiKey: string;
}

export interface FirebaseCleanupResult {
  /** Never the token: only enough to say which session this was (first 8 chars of its uid). */
  localIdPrefix: string;
  ok: boolean;
  /** Present only when ok is false; never contains the ID token. */
  error?: string;
}

export async function deleteFirebaseAnonymousUser(
  session: FirebaseAnonymousSession,
): Promise<FirebaseCleanupResult> {
  const localIdPrefix = session.localId.slice(0, 8);
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(session.apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: session.idToken }),
      },
    );
    if (!response.ok) {
      return { localIdPrefix, ok: false, error: `HTTP ${response.status}` };
    }
    return { localIdPrefix, ok: true };
  } catch (err) {
    return { localIdPrefix, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
