import { createClient } from '@supabase/supabase-js';

// One client for the whole app. The service key bypasses row-level security,
// which is why what each route checks for itself matters so much.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);
