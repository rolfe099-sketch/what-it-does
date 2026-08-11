// A registration endpoint. Public by necessity: the caller has no account yet.
// Taken from the shape found repeatedly in the 284-repo corpus.
import { db } from '../../../../lib/db';

export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return new Response('bad email', { status: 400 });
  }
  await db.from('users').insert({ email, password });
  return new Response(null, { status: 201 });
}
