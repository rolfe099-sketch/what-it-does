'use server';
import { supabase } from '@/lib/db';

export async function sendWelcomeEmail(userId: string) {
  await supabase.from('users').update({ welcomed: true }).eq('id', userId);
}

export async function deleteAccount(userId: string) {
  await supabase.from('users').delete().eq('id', userId);
}

export async function exportProjects(userId: string) {
  const { data } = await supabase.auth.getUser();
  return supabase.from('projects').select('*').eq('owner', userId);
}
