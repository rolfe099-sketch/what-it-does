export const supabase: any = {};
export async function getProjects() {
  return supabase.from('projects').select('*');
}
