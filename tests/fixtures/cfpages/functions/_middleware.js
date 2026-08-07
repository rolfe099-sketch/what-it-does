// Root middleware. Its position in the tree is its scope — there is no matcher
// config in Cloudflare Pages.
export async function onRequest(context) {
  return context.next();
}
