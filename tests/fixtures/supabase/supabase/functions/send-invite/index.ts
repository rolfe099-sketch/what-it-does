// Classic shape, and verify_jwt defaults to true because config.toml says
// nothing about this function — the platform checks the caller.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_KEY')!);
  const { email } = await req.json();

  await supabase.from('invitations').insert({ email });
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    body: JSON.stringify({ to: email, subject: 'You are invited' }),
  });

  return new Response(null, { status: 204 });
});
