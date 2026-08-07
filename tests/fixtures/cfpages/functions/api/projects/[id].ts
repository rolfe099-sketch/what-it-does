// The three export shapes that are not `export async function`, plus a dynamic
// path segment. A naive implementation catches the first and misses the rest.
import { requireAdmin } from '../../../lib/auth';

const handler = async (context: any) => {
  await requireAdmin(context);
  const supabase = context.env.DB;
  await supabase.from('projects').delete().eq('id', context.params.id);
  return new Response(null, { status: 204 });
};

export { handler as onRequestDelete };

export const onRequestGet = async (context: any) => {
  const supabase = context.env.DB;
  return Response.json(await supabase.from('projects').select('*'));
};
