export async function requireAdmin(context: any) {
  const session = await context.env.KV.get('session');
  if (!session) throw new Response('Forbidden', { status: 403 });
  return session;
}
