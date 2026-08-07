// A directory called `functions` holding ordinary source code — which is what
// dub's packages/utils has, and why the folder name is not evidence.
export const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);
