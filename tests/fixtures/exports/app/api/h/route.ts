import { streamText } from 'ai';

// The stack AI-built products are actually made of. Missing this meant a route
// whose entire purpose was calling a model reported no effects at all.
export async function POST(req: Request) {
  const { prompt } = await req.json();
  const result = streamText({ model: 'gpt-5', prompt });
  return result.toTextStreamResponse();
}
