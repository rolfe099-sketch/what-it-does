// The helper shape from the corpus: hasCronSecret / hasPostCronSecret.
export function hasCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('x-cron-secret');
  return !!expected && supplied === expected;
}
