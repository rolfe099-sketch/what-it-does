import { db } from '@/lib/db';
import { getSessionSomehow } from '@/lib/session';

// An inline guard, with a name no heuristic would recognise.
export async function DELETE(req: Request) {
  const viewer = await getSessionSomehow();
  if (!viewer) {
    return new Response('nope', { status: 401 });
  }
  await db.from('widgets').delete().eq('id', 1);
  return Response.json({ ok: true });
}
