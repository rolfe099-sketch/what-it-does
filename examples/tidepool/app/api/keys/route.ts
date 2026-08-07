import { supabase } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json();
  const { data } = await supabase
    .from('api_keys')
    .insert({ user_id: user.id, label: body.label, scope: body.scope })
    .select()
    .single();
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const body = await request.json();
  await supabase.from('api_keys').delete().eq('id', body.id);
  return new Response(null, { status: 204 });
}
