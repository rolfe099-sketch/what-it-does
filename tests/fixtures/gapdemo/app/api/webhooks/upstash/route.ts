// Guarded by a signature verifier called `.verify()` on a receiver object —
// the /api/cron/domains shape. The name pattern only sees the last segment.
import { Receiver } from '@upstash/qstash';
import { db } from '../../../../lib/db';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  const body = await request.text();
  const ok = await receiver.verify({
    signature: request.headers.get('upstash-signature') ?? '',
    body,
  });
  if (!ok) {
    return new Response('Unauthorized', { status: 401 });
  }
  await db.from('jobs').delete().eq('id', JSON.parse(body).id);
  return new Response(null, { status: 204 });
}
