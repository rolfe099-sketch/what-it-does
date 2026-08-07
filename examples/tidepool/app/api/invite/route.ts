import { supabase } from '@/lib/db';
import { requireMember } from '@/lib/auth';
import { sendMail } from '@/lib/mail';

export async function POST(request: Request) {
  const body = await request.json();
  const { user } = await requireMember(body.workspaceId);

  const { data: invitation } = await supabase
    .from('invitations')
    .insert({ email: body.email, workspace_id: body.workspaceId, invited_by: user.id })
    .select()
    .single();

  await sendMail(body.email, 'You have been invited', 'Come and join us on Tidepool.');
  return Response.json(invitation);
}
