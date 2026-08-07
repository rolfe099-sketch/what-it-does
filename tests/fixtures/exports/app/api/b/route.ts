import { withGuard } from '@/lib/auth';
import { db } from '@/lib/db';
export const POST = withGuard(async () => {
  await db.from('widgets').delete().eq('id', 1);
  return Response.json({ ok: true });
});
