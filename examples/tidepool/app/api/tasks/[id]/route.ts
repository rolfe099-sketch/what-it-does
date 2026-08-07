import { supabase } from '@/lib/db';
import { requireMember } from '@/lib/auth';
import { record } from '@/lib/audit';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const { user } = await requireMember(body.workspaceId);
  await supabase.from('tasks').update({ status: body.status }).eq('id', params.id);
  await record('task.update', user.id, params.id);
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const { user } = await requireMember(body.workspaceId);
  await supabase.from('tasks').delete().eq('id', params.id);
  await record('task.delete', user.id, params.id);
  return new Response(null, { status: 204 });
}
