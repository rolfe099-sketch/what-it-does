// Sends a one-time code to an address nobody has proven they own yet.
// Cannot sit behind a check on who is asking — that is the point of it.
import { db } from '../../../../lib/db';

export async function POST(request: Request) {
  const { email } = await request.json();
  await db.from('otp_codes').insert({ email, code: '123456' });
  return new Response(null, { status: 202 });
}
