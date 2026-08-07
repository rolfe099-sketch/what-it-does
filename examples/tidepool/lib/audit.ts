import { supabase } from './db';

/** Everything consequential is supposed to land here. */
export async function record(action: string, actorId: string, detail: string) {
  await supabase.from('audit_log').insert({ action, actor_id: actorId, detail });
}
