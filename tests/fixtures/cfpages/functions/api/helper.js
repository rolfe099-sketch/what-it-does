// Exports no handler, so it is a helper and not a route. Reporting it as
// unreadable would be noise; reporting it as a route would be a lie.
export function formatDate(value) {
  return new Date(value).toISOString();
}
