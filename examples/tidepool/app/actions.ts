'use server';

import { supabase } from '@/lib/db';
import { requireUser, requireMember } from '@/lib/auth';
import { sendMail } from '@/lib/mail';
import { record } from '@/lib/audit';

export async function archiveProject(projectId: string, workspaceId: string) {
  const { user } = await requireMember(workspaceId);
  await supabase.from('projects').update({ archived: true }).eq('id', projectId);
  await record('project.archive', user.id, projectId);
}

export async function deleteWorkspace(workspaceId: string) {
  const { user, role } = await requireMember(workspaceId);
  if (role !== 'owner') throw new Error('Only the owner can do that');

  await supabase.from('members').delete().eq('workspace_id', workspaceId);
  await supabase.from('projects').delete().eq('workspace_id', workspaceId);
  await supabase.from('workspaces').delete().eq('id', workspaceId);
  await record('workspace.delete', user.id, workspaceId);
}

// Named for something it does not do. The template was written, the send was
// left for later, and the name never changed.
export async function sendOnboardingEmail(userId: string) {
  const { data: user } = await supabase.from('users').select('email').eq('id', userId).single();
  await supabase.from('users').update({ onboarded_at: new Date().toISOString() }).eq('id', userId);
  return user;
}

export async function inviteTeammate(email: string, workspaceId: string) {
  const { user } = await requireMember(workspaceId);
  await supabase.from('invitations').insert({ email, workspace_id: workspaceId, invited_by: user.id });
  await sendMail(email, 'Join the workspace', 'You have been invited to Tidepool.');
}

export async function rotateApiKey(keyId: string) {
  const user = await requireUser();
  await supabase.from('api_keys').update({ secret: crypto.randomUUID() }).eq('id', keyId);
  await record('key.rotate', user.id, keyId);
}