import { getServerSession } from 'next-auth';
export const withGuard = (handler: any) => async (req: any) => {
  const session = await getServerSession();
  if (!session) throw new Error('unauthorised');
  return handler(req);
};
