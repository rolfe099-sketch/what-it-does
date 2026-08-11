// The control case: genuinely destructive, genuinely unguarded, no auth
// segment anywhere in its path. This one MUST still be reported.
import { db } from '../../../../lib/db';

export async function DELETE(request: Request) {
  const { id } = await request.json();
  await db.from('users').delete().eq('id', id);
  return new Response(null, { status: 204 });
}
