import { serve } from '@/lib/db';
export const { PATCH } = serve<{ x: number }>({ name: 'd' });
