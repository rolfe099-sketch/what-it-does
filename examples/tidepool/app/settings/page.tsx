import { supabase } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export default async function Settings() {
  const user = await requireUser();
  const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();
  return <main><pre>{JSON.stringify({ data, subscription })}</pre></main>;
}
