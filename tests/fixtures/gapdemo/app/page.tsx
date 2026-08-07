import { getProjects } from '@/lib/db';
export default async function Home() {
  const projects = await getProjects();
  return <main>{projects.length}</main>;
}
