import { supabase } from '../db';

export async function getSession() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function requireUser() {
  const user = await getSession();
  if (!user) throw new Response('Sign in first', { status: 401 });
  return user;
}
