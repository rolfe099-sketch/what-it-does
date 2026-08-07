import { stripe } from '@/lib/payments';

export async function POST(req: Request) {
  const session = await stripe.checkout.sessions.create({
    mode: process.env.STRIPE_MODE === 'live' ? 'subscription' : 'payment',
  });
  return Response.json({ url: session.url });
}
