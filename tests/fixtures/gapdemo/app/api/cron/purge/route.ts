// Guarded by a named predicate. Two of the five real false positives were
// exactly this: `if (!hasCronSecret(request)) return 401`.
import { db } from '../../../../lib/db';
import { hasCronSecret } from '../../../../lib/cron';

export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 });
  }
  await db.from('sessions').delete().lt('expires_at', new Date().toISOString());
  return new Response(null, { status: 204 });
}
