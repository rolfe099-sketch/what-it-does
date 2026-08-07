import { stripe, PRICE_ID } from '@/lib/billing';
import { supabase } from '@/lib/db';

export async function POST(request: Request) {
  const body = await request.json();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    customer_email: body.email,
    success_url: process.env.APP_URL + '/settings',
  });

  await supabase.from('subscriptions').insert({
    user_id: body.userId,
    status: 'pending',
  });

  return Response.json({ url: session.url });
}
