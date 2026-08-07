import { supabase } from '@/lib/db';
import { requireMember } from '@/lib/auth';

export default async function ProjectPage({ params }: { params: { id: string } }) {
  await requireMember(params.id);
  const { data: tasks } = await supabase.from('tasks').select('*').eq('project_id', params.id);
  const { data: comments } = await supabase.from('comments').select('*').eq('project_id', params.id);
  return <main><pre>{JSON.stringify({ tasks, comments })}</pre></main>;
}
