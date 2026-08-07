import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { supabase } from '@/lib/db';
import { requireMember } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json();
  await requireMember(body.workspaceId);

  const { data: comments } = await supabase
    .from('comments')
    .select('body')
    .eq('project_id', body.projectId);

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini'),
    prompt: `Summarise this discussion:\n${(comments ?? []).map((c) => c.body).join('\n')}`,
  });

  return result.toTextStreamResponse();
}
