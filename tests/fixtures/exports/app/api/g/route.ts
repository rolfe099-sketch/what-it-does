import { db } from '@/lib/db';

// An early exit that is INPUT VALIDATION, not authorisation.
// It has exactly the shape of a guard and must not be mistaken for one.
export async function DELETE(req: Request) {
  const body = await req.json();
  if (!body.email) {
    return new Response('bad request', { status: 400 });
  }
  await db.from('widgets').delete().eq('email', body.email);
  return Response.json({ ok: true });
}
