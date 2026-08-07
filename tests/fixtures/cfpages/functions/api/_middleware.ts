// A second middleware, scoped to /api only. Two of these in one project is the
// normal shape, and it is what a single hardcoded id would have collapsed.
export const onRequest = async (context: any) => context.next();
