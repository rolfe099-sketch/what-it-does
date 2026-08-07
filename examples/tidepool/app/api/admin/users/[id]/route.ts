import { supabase } from '@/lib/db';

// Under /api, so the middleware matcher does not run here — it covers
// /admin/:path* but not /api/admin/:path*.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  await supabase.from('members').delete().eq('user_id', params.id);
  await supabase.from('users').delete().eq('id', params.id);
  return new Response(null, { status: 204 });
}
