/**
 * Whether a licence key is real.
 *
 * This lives in its own file for one reason: it shipped broken, and it shipped
 * broken because it was welded into a script that could not be imported and so
 * was never tested. The money path is now the one piece of the Action with a
 * test that talks to the real API.
 *
 * ── The bug, since it is worth not repeating ──────────────────────────────
 *
 * The first version sent `{ key }`. Polar requires `{ key, organization_id }`,
 * so every call returned 422. The code checked for 404 and 403, treated
 * anything else that was not ok as "our problem, not theirs", and returned
 * true. Every key validated — including ones nobody had ever bought.
 *
 * Fail-open is still the rule here and it is not the culprit. The culprit was
 * that fail-open and success were the same value, so nothing downstream could
 * tell "Polar said yes" from "we never managed to ask". Hence a named verdict.
 */

export const VALIDATE_URL = 'https://api.polar.sh/v1/customer-portal/license-keys/validate';

/**
 * Eriksen ENK on Polar. A public identifier, not a secret: it is served in the
 * HTML of our own checkout page and sits in the URL of our avatar. It has to
 * be public, because this check runs inside the customer's CI runner where we
 * can hold no credential of ours — which is also why this uses the customer
 * portal endpoint, documented as safe for public clients.
 */
export const ORGANISATION = '861292a7-8a09-48da-9787-bfe36d5be720';

/**
 * @param {string} key
 * @param {{ fetch?: typeof globalThis.fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, verdict: 'absent'|'granted'|'rejected'|'unreachable', detail?: string }>}
 *   `ok` is whether the Action should proceed as licensed. It is true for
 *   'unreachable' on purpose: a network blip must never look like piracy.
 */
export async function checkLicence(key, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;

  if (!key) return { ok: false, verdict: 'absent' };

  try {
    const response = await doFetch(VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, organization_id: ORGANISATION }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    // The only two answers that mean "this key is not good".
    if (response.status === 404 || response.status === 403) {
      return { ok: false, verdict: 'rejected' };
    }
    if (!response.ok) {
      return { ok: true, verdict: 'unreachable', detail: `Polar answered HTTP ${response.status}` };
    }

    const body = await response.json();
    // granted | revoked | disabled
    if (body?.status && body.status !== 'granted') {
      return { ok: false, verdict: 'rejected', detail: `key is ${body.status}` };
    }
    return { ok: true, verdict: 'granted' };
  } catch (error) {
    return { ok: true, verdict: 'unreachable', detail: String(error?.message || error) };
  }
}
