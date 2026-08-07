import { db } from '@/lib/db';
async function handler() { await db.from('logs').insert({}); return Response.json({}); }
export { handler as PUT, handler as DELETE };
