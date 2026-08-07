#!/usr/bin/env bash
# Build a real multi-scan history for the demo fixture by actually changing the
# code between scans. Every point on the timeline is a genuine scan of genuinely
# different source — nothing here is fabricated.
set -e
cd "$(dirname "$0")"
F=tests/fixtures/gapdemo/app/actions.ts
rm -rf tests/fixtures/gapdemo/.what-it-does

scan() { npx tsx src/cli.ts scan tests/fixtures/gapdemo --no-open --no-report > /dev/null 2>&1; }

# ── 1. the starting point ────────────────────────────────────────────────
cat > "$F" <<'EOF'
'use server';
import { supabase } from '@/lib/db';

export async function sendWelcomeEmail(userId: string) {
  await supabase.from('users').update({ welcomed: true }).eq('id', userId);
}

export async function deleteAccount(userId: string) {
  const { data: session } = await supabase.auth.getUser();
  await supabase.from('users').delete().eq('id', userId);
}
EOF
scan; echo "1. baseline"

# ── 2. the email gets wired up ───────────────────────────────────────────
cat > "$F" <<'EOF'
'use server';
import { supabase } from '@/lib/db';
import { mailer } from '@/lib/mail';

export async function sendWelcomeEmail(userId: string) {
  await supabase.from('users').update({ welcomed: true }).eq('id', userId);
  await mailer.emails.send({ to: userId, subject: 'Welcome' });
}

export async function deleteAccount(userId: string) {
  const { data: session } = await supabase.auth.getUser();
  await supabase.from('users').delete().eq('id', userId);
}
EOF
scan; echo "2. welcome email wired up"

# ── 3. someone removes the auth check ────────────────────────────────────
cat > "$F" <<'EOF'
'use server';
import { supabase } from '@/lib/db';
import { mailer } from '@/lib/mail';

export async function sendWelcomeEmail(userId: string) {
  await supabase.from('users').update({ welcomed: true }).eq('id', userId);
  await mailer.emails.send({ to: userId, subject: 'Welcome' });
}

export async function deleteAccount(userId: string) {
  await supabase.from('users').delete().eq('id', userId);
}
EOF
scan; echo "3. auth check removed from deleteAccount"

# ── 4. a new action appears ──────────────────────────────────────────────
cat > "$F" <<'EOF'
'use server';
import { supabase } from '@/lib/db';
import { mailer } from '@/lib/mail';

export async function sendWelcomeEmail(userId: string) {
  await supabase.from('users').update({ welcomed: true }).eq('id', userId);
  await mailer.emails.send({ to: userId, subject: 'Welcome' });
}

export async function deleteAccount(userId: string) {
  await supabase.from('users').delete().eq('id', userId);
}

export async function exportProjects(userId: string) {
  const { data } = await supabase.auth.getUser();
  return supabase.from('projects').select('*').eq('owner', userId);
}
EOF
scan; echo "4. exportProjects added"

# ── 5. the email quietly stops being sent ────────────────────────────────
cat > "$F" <<'EOF'
'use server';
import { supabase } from '@/lib/db';

export async function sendWelcomeEmail(userId: string) {
  await supabase.from('users').update({ welcomed: true }).eq('id', userId);
}

export async function deleteAccount(userId: string) {
  await supabase.from('users').delete().eq('id', userId);
}

export async function exportProjects(userId: string) {
  const { data } = await supabase.auth.getUser();
  return supabase.from('projects').select('*').eq('owner', userId);
}
EOF
echo "5. welcome email quietly removed  (final scan writes the report)"
