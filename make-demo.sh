#!/usr/bin/env bash
# Build the hosted demo reports.
#
# The tidepool history is made by actually editing the sample app between
# scans, so every point on its timeline is a real scan of really different
# source and the drift view is a real comparison. Nothing on those charts is
# drawn from numbers we invented.
#
# The LAST scan is the one that writes the report, and it is the state that
# lives in the repo — so the drift view opens on the regression rather than on
# "nothing moved", and the files are left exactly as they were found.
set -e
cd "$(dirname "$0")"
mkdir -p demo

ROUTE='examples/tidepool/app/api/projects/[id]/route.ts'
ACTIONS='examples/tidepool/app/actions.ts'

ROUTE_REPO=$(cat "$ROUTE")
ACTIONS_REPO=$(cat "$ACTIONS")

# Whatever happens, put the working tree back.
restore() {
  printf '%s' "$ROUTE_REPO" > "$ROUTE"
  printf '%s' "$ACTIONS_REPO" > "$ACTIONS"
}
trap restore EXIT

scan() { npx tsx src/cli.ts examples/tidepool --no-open --no-report >/dev/null 2>&1; }

rm -rf examples/tidepool/.what-it-does

# ── 1. the healthy state ──────────────────────────────────────────────────
# DELETE checks membership exactly like GET does, and the onboarding mail is
# actually sent.
cat > "$ROUTE" <<'EOF'
import { supabase } from '@/lib/db';
import { requireMember } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const body = new URL(request.url).searchParams;
  await requireMember(body.get('workspaceId')!);
  const { data } = await supabase.from('projects').select('*').eq('id', params.id).single();
  return Response.json(data);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const body = new URL(request.url).searchParams;
  await requireMember(body.get('workspaceId')!);
  await supabase.from('tasks').delete().eq('project_id', params.id);
  await supabase.from('comments').delete().eq('project_id', params.id);
  await supabase.from('projects').delete().eq('id', params.id);
  return new Response(null, { status: 204 });
}
EOF

printf '%s' "$ACTIONS_REPO" \
  | sed 's|  return user;|  await sendMail(user!.email, "Welcome to Tidepool", "Here is how to get started.");\n  return user;|' \
  > "$ACTIONS"

scan; echo "1. healthy — delete is guarded, onboarding mail is sent"

# ── 2. the send is quietly dropped ────────────────────────────────────────
printf '%s' "$ACTIONS_REPO" > "$ACTIONS"
scan; echo "2. sendOnboardingEmail stops sending"

# ── 3. the membership check is dropped from DELETE ────────────────────────
# The report is written HERE, so drift opens on this regression.
printf '%s' "$ROUTE_REPO" > "$ROUTE"
npx tsx src/cli.ts examples/tidepool --no-open >/dev/null 2>&1
mv what-it-does-report.html demo/tidepool.html
echo "3. DELETE loses its membership check — wrote demo/tidepool.html"

# ── dub: the other half of the story — real, large, and clean ─────────────
if [ -d fixtures/dub/apps/web ]; then
  rm -rf fixtures/dub/apps/web/.what-it-does
  npx tsx src/cli.ts fixtures/dub/apps/web --no-open --no-code >/dev/null 2>&1
  mv what-it-does-report.html demo/dub.html
  echo "4. wrote demo/dub.html"
fi
