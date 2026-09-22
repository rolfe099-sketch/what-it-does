// Guarded inline: bearer header against an environment secret, constant-time
// compare, early 401. The /api/cron/gdpr shape from the corpus.
import { timingSafeEqual } from 'node:crypto';
import { db } from '../../../../lib/db';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET ?? '';
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const supplied = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    return new Response('Unauthorized', { status: 401 });
  }
  await db.from('audit_log').delete().lt('created_at', '2020-01-01');
  return new Response(null, { status: 204 });
}
