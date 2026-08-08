/**
 * The paid gate.
 *
 * This exists because the gate shipped open. The Action sent `{ key }` to
 * Polar's validate endpoint, which requires `{ key, organization_id }`, so
 * every call came back 422 — and 422 is neither 404 nor 403, so it fell
 * through a branch meaning "our problem, not theirs" and returned valid.
 * Invented keys passed. Nothing anywhere said so, because fail-open and
 * success were the same value.
 *
 * Two kinds of test, and the split is the point:
 *
 *   The stubbed ones fix the DECISION — which HTTP answer means what. They are
 *   deterministic and run offline.
 *
 *   The live one fixes the CONTRACT — that the request we actually send is one
 *   Polar accepts. No stub could have caught the original bug, because a stub
 *   answers whatever it is told to answer. Only the real endpoint knows that a
 *   field is missing. It skips when the network is unreachable and fails when
 *   the contract has moved, so a blip stays quiet and a breakage does not.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkLicence, ORGANISATION, VALIDATE_URL } from '../action/licence.mjs';

/** A fetch that answers with one canned response and records what it was sent. */
function stub(status: number, body: unknown = {}) {
  const sent: { url?: string; body?: any } = {};
  const fn = (async (url: any, init: any) => {
    sent.url = String(url);
    sent.body = JSON.parse(init.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }) as unknown as typeof globalThis.fetch;
  return { fn, sent };
}

describe('what each answer from Polar means', () => {
  test('no key at all is not a licence, and is not an error', async () => {
    const result = await checkLicence('');
    assert.equal(result.verdict, 'absent');
    assert.equal(result.ok, false);
  });

  test('404 is a rejection — the key does not exist', async () => {
    const { fn } = stub(404, { error: 'ResourceNotFound' });
    const result = await checkLicence('nope', { fetch: fn });
    assert.equal(result.verdict, 'rejected');
    assert.equal(result.ok, false);
  });

  test('403 is a rejection', async () => {
    const { fn } = stub(403);
    assert.equal((await checkLicence('nope', { fetch: fn })).verdict, 'rejected');
  });

  test('granted is the only status that licenses anything', async () => {
    const { fn } = stub(200, { status: 'granted' });
    const result = await checkLicence('real', { fetch: fn });
    assert.equal(result.verdict, 'granted');
    assert.equal(result.ok, true);
  });

  test('a revoked key is rejected, not granted', async () => {
    const { fn } = stub(200, { status: 'revoked' });
    const result = await checkLicence('cancelled', { fetch: fn });
    assert.equal(result.verdict, 'rejected');
    assert.equal(result.ok, false);
  });

  test('a disabled key is rejected', async () => {
    const { fn } = stub(200, { status: 'disabled' });
    assert.equal((await checkLicence('off', { fetch: fn })).verdict, 'rejected');
  });

  /**
   * The regression itself. 422 means WE sent a bad request, so the build must
   * not break over it — but it must never be reported as a granted licence,
   * which is exactly what the first version did.
   */
  test('422 does not grant a licence — it means we asked wrongly', async () => {
    const { fn } = stub(422, { error: 'RequestValidationError' });
    const result = await checkLicence('anything', { fetch: fn });
    assert.equal(result.verdict, 'unreachable');
    assert.notEqual(result.verdict, 'granted');
    assert.equal(result.ok, true, 'still fails open — our bug must not break their build');
  });

  test('a network failure fails open', async () => {
    const fn = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.polar.sh');
    }) as unknown as typeof globalThis.fetch;
    const result = await checkLicence('real', { fetch: fn });
    assert.equal(result.verdict, 'unreachable');
    assert.equal(result.ok, true);
  });

  test('the organisation id is actually sent', async () => {
    const { fn, sent } = stub(200, { status: 'granted' });
    await checkLicence('real', { fetch: fn });
    assert.equal(sent.body.organization_id, ORGANISATION);
    assert.equal(sent.body.key, 'real');
  });
});

describe('the contract with Polar', () => {
  /**
   * The only test that could have caught the original bug, because it is the
   * only one that asks the real server whether our request is well formed.
   *
   * An invented key must come back 404 "not found". If it comes back 422, the
   * required fields have changed under us and every paying customer is about
   * to be told their key is fine when nobody checked.
   */
  test('a well-formed request with an invented key is rejected, not malformed', async (t) => {
    let response: Response;
    try {
      response = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'WID-CONTRACT-TEST-NOT-A-REAL-KEY',
          organization_id: ORGANISATION,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      // Offline, or Polar is down. Not a reason to fail somebody's build.
      t.skip(`could not reach Polar: ${String((error as Error)?.message ?? error)}`);
      return;
    }

    if (response.status === 422) {
      const detail = await response.text();
      assert.fail(
        `Polar rejected our request as malformed. The validate call needs fields we are not ` +
          `sending, so no licence is really being checked:\n${detail}`,
      );
    }

    assert.equal(
      response.status,
      404,
      `expected 404 for an invented key, got ${response.status}`,
    );

    // And the wrapper agrees with the raw call.
    const result = await checkLicence('WID-CONTRACT-TEST-NOT-A-REAL-KEY');
    assert.equal(result.verdict, 'rejected');
    assert.equal(result.ok, false);
  });
});
