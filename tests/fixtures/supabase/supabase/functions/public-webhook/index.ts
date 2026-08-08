// verify_jwt = false on purpose — a third party calls this — and the signature
// check is what authorises it instead.
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

export default {
  fetch: async (req: Request) => {
    const signature = req.headers.get('stripe-signature');
    const raw = await req.text();
    stripe.webhooks.constructEvent(raw, signature!, Deno.env.get('WEBHOOK_SECRET')!);
    return Response.json({ received: true });
  },
};
