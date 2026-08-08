# what it does

**Shows you what software you didn't write actually does — and tells you when that changes.**

You built something with Cursor, Claude Code or Lovable. It's live. It has users.
And you can no longer say with confidence what happens when someone signs up, or
what breaks if you rename a table.

```bash
npx what-it-does
```

It reads your code without running it, and opens a single HTML file: everything
your application can do, what it depends on, what looks wrong, and what moved
since last time.

Nothing is uploaded. The report makes no network requests of any kind — you can
pull your network cable and it still works.

---

## What you get

**Map** — every way into the application, grouped and ranked by consequence
rather than by size. A twelve-line delete endpoint outranks a four-hundred-line
settings page.

**Walkthrough** — click any behaviour and read what it does, step by step, in
plain language, with the relevant code beside each step.

**Dependencies** — every table and outside service you touch, and how much of the
app would notice if one changed. Open any of them for *"rename this and 5
behaviours break"*, plus a cascade: what fails immediately, what is left with
nothing writing to it, and what carries on running on data nobody maintains.

**In depth** — the same dependency graph as a rotating star chart. Drag to turn
it. Size is blast radius; a hollow ring is a service you don't control.

**Timeline** — scrub through past scans. Watch an auth check disappear between
two of them, with no test failing and no commit saying so.

---

## What it cannot see

This section is not a disclaimer. It is the reason to trust the rest.

**It reads your code; it does not run it.** Anything decided at runtime is
invisible. `supabase.from(tableName)` produces a real edge to an unknown target,
and the report says so rather than guessing.

**Names must be literal.** A table reached through a variable is missing from the
dependency map entirely — not drawn faintly, absent. Every number here is a floor
on how connected your application is, never a ceiling.

**Imports are followed three hops.** Work further away than that is not
attributed. The report tells you how many behaviours came back empty and why —
*absence of findings is not proof of absence.*

**Findings can be wrong, and each one says how.** A guard reached through code we
couldn't follow looks exactly like a missing guard. Every finding states what
would make it a false alarm, in the same breath as the accusation.

**The cascade past the first wave is inference.** Wave one is what your code
literally references. Everything after it is worked out from the graph and
labelled *worked out*, not *in the code*.

---

## Supported today

| | |
|---|---|
| Frameworks | Next.js **App Router**, Cloudflare **Pages Functions** |
| Data | Supabase, Prisma, Drizzle |
| Auth | Supabase Auth, NextAuth / Auth.js, Clerk |
| Payments | Stripe |
| Email | Resend, Nodemailer, common `sendEmail` helpers |
| Models | Vercel AI SDK, Anthropic, OpenAI |

Calls made with a plain `fetch` are read too, when the URL is written out: the
hostname says what an SDK name would have. `api.stripe.com` moves money whether
or not you imported the library — which matters most on edge runtimes, where
there often is no library.

Pages Router, Express, Remix, SvelteKit, Rails and FastAPI are not supported.
The core model — *a behaviour is a trigger, a path and a set of effects* — is
framework-agnostic; only the extractor is specific. Adding a framework means
adding an extractor, not rewriting anything.

Cloudflare Pages Functions was the test of that claim. It is one file,
`src/extract/cloudflare/entrypoints.ts`, and nothing below the entry-point layer
changed to accommodate it — the effects, guards, graph, cascade and all five
views worked on the first run.

Point it at a directory we cannot read and it says what it found rather than
what it isn't: the framework by name if it recognises one, or the application
one level down if you aimed at a monorepo root.

If your project uses something not on this list, its calls simply won't appear.
The scan won't fail and it won't warn you loudly, which is worth knowing.

---

## Usage

```bash
npx what-it-does                   # read here, open the report
npx what-it-does ../my-app         # read somewhere else
npx what-it-does --no-open         # write the report, don't open it
npx what-it-does --no-code         # omit source excerpts
npx what-it-does --no-report       # terminal output only
npx what-it-does --json            # the snapshot as JSON, nothing else
```

Writes `what-it-does-report.html` to the current directory.

### Tell your AI assistant to use it

```bash
npx what-it-does agent
```

Adds a block to your `CLAUDE.md`, `AGENTS.md` or `.cursorrules` — whichever you
already keep — instructing the assistant to record behaviour before it edits
server-side code, compare afterwards, and tell you what moved.

This is where the tool is most useful, because drift is worth most at the
instant code changes. The assistant checks its own work and surfaces anything
it flags rather than quietly acting on it, since a finding can be wrong and the
report says what would make it one.

Re-run any time; the block is replaced, never duplicated, and nothing else in
the file is touched.

### Comparing two scans

`--json` prints a snapshot and nothing else, so two of them can be compared —
including across branches, which is the useful case:

```bash
git switch main       && npx what-it-does --json > /tmp/before.json
git switch my-branch  && npx what-it-does --json > /tmp/after.json
npx what-it-does diff /tmp/before.json /tmp/after.json
```

The comparison is in behaviour language, not file language. Git already told you
`utils/auth.ts` changed; this tells you the endpoint that used to check who was
asking has stopped.

```bash
npx what-it-does diff a.json b.json --markdown        # as a PR comment
npx what-it-does diff a.json b.json --json            # as data
npx what-it-does diff a.json b.json --fail-on-new     # exit 1 on a new finding
```

`--fail-on-new` exits `1` only when the comparison surfaces a finding that was
not there before. A finding that merely moved down the file is not new — code
shifts constantly, and a check that cries wolf on unrelated edits is a check
people turn off.

Neither side of a `diff` ever sees the other's source. Both are JSON, which is
why this works in CI without anything leaving the runner.

### Sharing a report

Walkthroughs include short excerpts of your source so each step can be read in
context. That makes a report **shareable but not public**. Use `--no-code` for
anything you intend to send.

### History

Each scan appends to `.what-it-does/history.json` inside the scanned project, capped
at 20. That file is what the Timeline reads. Delete it to start over; add it to
`.gitignore` if you'd rather not commit it.

---

## Why it exists

Asking a model what your code does gets you a plausible answer assembled from
whatever it happened to read. That is genuinely useful, and for a single file it
is probably better than this tool.

What a model cannot do is give you a **complete** graph, the same answer twice,
or tell you what changed since last week — because it wasn't there last week.
That is what this is for.

---

## Development

```bash
npm install
npm run dev -- scan ../some-nextjs-app   # run from source
npm run check                            # typecheck + tests
npm run build
```

Requires Node 18+.

MIT.
