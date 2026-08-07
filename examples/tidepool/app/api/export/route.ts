import { supabase } from '@/lib/db';

// Debug switch left in. In development it skips the ownership filter entirely.
export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspace');

  const query = supabase.from('files').select('*');
  const { data } =
    process.env.NODE_ENV === 'development'
      ? await query
      : await query.eq('workspace_id', workspaceId);

  return Response.json(data);
}
