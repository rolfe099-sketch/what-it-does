import { stripe } from '@/lib/billing';
import { requireUser } from '@/lib/auth';
import { supabase } from '@/lib/db';

export async function POST() {
  const user = await requireUser();
  const { data } = await supabase
    .from('subscriptions')
    .select('customer_id')
    .eq('user_id', user.id)
    .single();

  const session = await stripe.billingPortal.sessions.create({
    customer: data!.customer_id,
    return_url: process.env.APP_URL + '/settings',
  });

  return Response.json({ url: session.url });
}
