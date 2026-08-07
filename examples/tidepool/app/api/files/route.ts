import { supabase } from '@/lib/db';
import { requireMember } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json();
  await requireMember(body.workspaceId);
  const { data } = await supabase
    .from('files')
    .insert({ name: body.name, workspace_id: body.workspaceId })
    .select()
    .single();
  return Response.json(data);
}
