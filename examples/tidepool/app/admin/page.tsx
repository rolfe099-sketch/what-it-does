import { supabase } from '@/lib/db';

export default async function AdminPage() {
  // Reached only through middleware, which does cover /admin.
  const { data: users } = await supabase.from('users').select('*');
  const { data: invoices } = await supabase.from('invoices').select('*');
  return <main><pre>{JSON.stringify({ users, invoices })}</pre></main>;
}
