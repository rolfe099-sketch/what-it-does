import { stripe } from '@/lib/billing';
import { supabase } from '@/lib/db';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const raw = await request.text();

  // Verifying the signature IS the authorisation here: it proves the request
  // came from Stripe and not from someone who guessed the URL.
  const event = stripe.webhooks.constructEvent(
    raw,
    signature!,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );

  if (event.type === 'checkout.session.completed') {
    await supabase.from('subscriptions').upsert({ status: 'active' });
    await supabase.from('invoices').insert({ amount: 0 });
  }

  return Response.json({ received: true });
}
