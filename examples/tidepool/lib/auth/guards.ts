import { supabase } from '../db';
import { requireUser } from './session';

/** The caller must belong to the workspace they are acting on. */
export async function requireMember(workspaceId: string) {
  const user = await requireUser();
  const { data } = await supabase
    .from('members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!data) throw new Response('Not your workspace', { status: 403 });
  return { user, role: data.role };
}

/** Wraps a handler so it only runs for workspace owners. */
export function withOwner(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const user = await requireUser();
    const { data } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (data?.role !== 'owner') throw new Response('Owners only', { status: 403 });
    return handler(request);
  };
}
