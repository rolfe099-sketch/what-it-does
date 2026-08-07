import { supabase } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function GET() {
  const user = await requireUser();
  const { data } = await supabase.from('projects').select('*').eq('owner_id', user.id);
  return Response.json(data);
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json();
  const { data } = await supabase
    .from('projects')
    .insert({ name: body.name, owner_id: user.id })
    .select()
    .single();
  return Response.json(data);
}
