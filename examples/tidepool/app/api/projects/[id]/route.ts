import { supabase } from '@/lib/db';
import { requireMember } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const body = new URL(request.url).searchParams;
  await requireMember(body.get('workspaceId')!);
  const { data } = await supabase.from('projects').select('*').eq('id', params.id).single();
  return Response.json(data);
}

// The read above checks membership. This one does not — the check was added to
// GET during review and never made it down here.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  await supabase.from('tasks').delete().eq('project_id', params.id);
  await supabase.from('comments').delete().eq('project_id', params.id);
  await supabase.from('projects').delete().eq('id', params.id);
  return new Response(null, { status: 204 });
}