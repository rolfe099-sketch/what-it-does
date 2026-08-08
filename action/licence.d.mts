/**
 * Types for licence.mjs.
 *
 * The Action is deliberately plain JavaScript — it runs in the customer's
 * runner straight from a checkout, with no build step to go wrong. This file
 * is how the test suite still gets to typecheck it.
 */

export declare const VALIDATE_URL: string;
export declare const ORGANISATION: string;

export type LicenceVerdict = 'absent' | 'granted' | 'rejected' | 'unreachable';

export interface LicenceResult {
  /** Whether the Action should proceed as licensed. True for 'unreachable'. */
  ok: boolean;
  verdict: LicenceVerdict;
  detail?: string;
}

export declare function checkLicence(
  key: string,
  options?: { fetch?: typeof globalThis.fetch; timeoutMs?: number },
): Promise<LicenceResult>;
