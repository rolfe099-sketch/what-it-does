// A contact form endpoint, modelled on a real one. Plain JavaScript, no types,
// no framework imports — which is exactly why the export shape is the only
// thing that identifies it as a route.

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();

  // Config that decides what the code does. Cloudflare hands this over as
  // `context.env`, not `process.env`.
  if (!env.RESEND_API_KEY) {
    return new Response('Not configured', { status: 500 });
  }

  const to = env.CONTACT_TO_EMAIL || 'hello@example.com';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, from: 'site@example.com', subject: 'New enquiry', text: body.message }),
  });

  return new Response(null, { status: response.ok ? 204 : 502 });
}
