import { supabase } from '@/lib/db';

// No authorisation check anywhere in this path.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  await supabase.from('projects').delete().eq('id', params.id);
  return Response.json({ ok: true });
}
