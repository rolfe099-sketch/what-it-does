// THE CONTROL. Lives under /cron/, reads process.env, and checks nothing
// about who is asking. Widening auth detection must not silence this one —
// a rule that stays quiet here has traded a false positive for a false
// negative, which is the worse direction.
import { db } from '../../../../lib/db';

export async function POST(request: Request) {
  const batch = Number(process.env.CRON_BATCH_SIZE ?? 100);
  const { before } = await request.json();
  await db.from('events').delete().lt('created_at', before).limit(batch);
  return new Response(null, { status: 204 });
}
