// verify_jwt = false, and nothing in the body checks the caller either.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_KEY')!);
  const { userId } = await req.json();

  await supabase.from('profiles').delete().eq('id', userId);
  await supabase.from('users').delete().eq('id', userId);

  return new Response(null, { status: 204 });
});
