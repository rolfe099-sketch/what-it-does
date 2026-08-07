import { supabase } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export default async function Dashboard() {
  const user = await requireUser();
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', user.id);

  return <main><h1>Your projects</h1><pre>{JSON.stringify(projects)}</pre></main>;
}
