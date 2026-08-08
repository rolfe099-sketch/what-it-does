// The current shape from Supabase's own examples: a default export whose
// fetch is wrapped, with auth: 'user' — which IS a check on who is asking.
import { withSupabase } from 'npm:@supabase/server@^1';
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

export default {
  fetch: withSupabase({ auth: 'user' }, async (req: Request) => {
    const { priceId } = await req.json();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
    });
    return Response.json({ url: session.url });
  }),
};
