/**
 * The core model. Everything in this tool is built from these types.
 *
 *   A BEHAVIOUR is a TRIGGER, a PATH, and a set of EFFECTS.
 *
 * If this model is wrong, nothing above it works — so it is deliberately small
 * and deliberately in the user's vocabulary rather than the compiler's. There is
 * no "AST node" or "symbol" in here on purpose.
 */

// ---------------------------------------------------------------------------
// Where something lives
// ---------------------------------------------------------------------------

export interface SourceRef {
  /** Repo-relative, always forward slashes, so output is stable across machines. */
  file: string;
  /** 1-indexed, matching what an editor shows. */
  line: number;
  endLine?: number;
}

// ---------------------------------------------------------------------------
// Effects — what a behaviour changes in the world outside the program.
//
// This list is FIXED and SHORT on purpose. A long taxonomy is one nobody reads,
// and the whole product is a translation layer into language a non-technical
// founder already uses.
// ---------------------------------------------------------------------------

export const EFFECT_KINDS = [
  'reads-data',
  'writes-data',
  'deletes-data',
  'sends-email',
  'takes-payment',
  'changes-access',
  'calls-external',
  'writes-file',
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

/**
 * The three that cost real money or real trust when they go wrong. These sort to
 * the top of every view, always. A founder scanning a map should see money,
 * deletion and permissions before anything else.
 */
export const CONSEQUENTIAL_EFFECTS: ReadonlySet<EffectKind> = new Set([
  'deletes-data',
  'takes-payment',
  'changes-access',
]);

/** Plain-language labels. The UI never shows the raw kind. */
export const EFFECT_LABELS: Record<EffectKind, string> = {
  'reads-data': 'Looks something up',
  'writes-data': 'Saves or changes something',
  'deletes-data': 'Destroys something',
  'sends-email': 'Emails someone',
  'takes-payment': 'Moves money',
  'changes-access': 'Changes who can do what',
  'calls-external': "Talks to another company's service",
  'writes-file': 'Writes a file',
};

/**
 * The thing an effect acts ON — a database table, a storage bucket, an outside
 * service.
 *
 * Captured as structured data at match time rather than parsed back out of the
 * description. The description is prose written for a human; the graph needs a
 * key. Deriving one from the other would mean the day someone rewords a label,
 * every edge in the graph silently moves.
 *
 * This is what makes "what breaks if I change the `users` table?" answerable,
 * and it is the hardest question to get a trustworthy answer to from a model —
 * it needs a complete graph, not a plausible one.
 */
export type ResourceKind = 'table' | 'bucket' | 'service' | 'file' | 'account';

export interface Resource {
  kind: ResourceKind;
  /** As written in the code: "users", "avatars", "Stripe". */
  name: string;
  /** False when the name was a variable, so the graph can say it is unsure. */
  literal: boolean;
}

/** Stable key for graph lookups. */
export const resourceKey = (r: Resource): string => `${r.kind}:${r.name.toLowerCase()}`;

export interface Effect {
  kind: EffectKind;
  /** Specific and human: "Deletes rows from `projects`", not "DELETE detected". */
  description: string;
  /** What it acts on, when we could identify it. */
  resource?: Resource;
  source: SourceRef;
  /**
   * 'certain'  — the call is unambiguous (`supabase.from('x').delete()`)
   * 'likely'   — inferred from naming or partial evidence, and says so in the UI
   */
  confidence: 'certain' | 'likely';
  /** This call establishes who is asking. Used by gap detection. */
  isAuthCheck?: boolean;
}

// ---------------------------------------------------------------------------
// Unknowns — the parts we cannot see into.
//
// Every gap MUST carry a reason. Silently omitting what we cannot analyse is
// worse than showing nothing, because someone will make a decision on the map
// and be burned by it. The reasons mean genuinely different things to the user,
// which is why this is an enum and not a boolean.
// ---------------------------------------------------------------------------

export type UnknownReason =
  /** Path goes into someone else's library. Expected, not a problem. */
  | 'third-party'
  /** Decided at runtime — dynamic dispatch, computed routes, eval. */
  | 'dynamic'
  /** Depends on env vars, feature flags or settings stored elsewhere. */
  | 'config-dependent'
  /** A file type or framework we have no extractor for yet. */
  | 'unsupported'
  /** We failed to read it. That is our bug, and it is reported as ours. */
  | 'parse-failed';

/**
 * What the user should do about each. `config-dependent` is the highest-value
 * category and the one no other tool surfaces — a behaviour that changes with an
 * environment variable is invisible in the code and is what breaks at 2am.
 */
export const UNKNOWN_GUIDANCE: Record<UnknownReason, { severity: 'info' | 'attention' | 'warning'; action: string }> = {
  'third-party': { severity: 'info', action: 'Nothing — this is an expected boundary.' },
  dynamic: { severity: 'attention', action: 'Worth reading this one yourself. It is genuinely opaque.' },
  'config-dependent': { severity: 'warning', action: 'Check your configuration. This may behave differently in production.' },
  unsupported: { severity: 'info', action: 'Nothing you can fix — this is a limitation on our side.' },
  'parse-failed': { severity: 'info', action: 'Nothing — this is our bug. Please report it.' },
};

export interface Unknown {
  reason: UnknownReason;
  /** Plain language, specific: "This goes into Stripe's library." */
  detail: string;
  source: SourceRef;
}

// ---------------------------------------------------------------------------
// Triggers — where the outside world touches the system.
//
// Anchoring on entry points rather than files is the central design choice.
// Entry points are declarative in every modern framework, and they map onto the
// sentence a founder actually says: "what happens when someone signs up?"
// Files map onto nothing anyone thinks about.
// ---------------------------------------------------------------------------

export type TriggerKind =
  /** A page someone visits in a browser. */
  | 'page'
  /** An HTTP endpoint something calls. */
  | 'api-route'
  /** A form submission handled on the server ('use server'). */
  | 'server-action'
  /** Runs on every matching request, before anything else. */
  | 'middleware';

export interface Trigger {
  kind: TriggerKind;
  /** The URL this responds to, e.g. "/dashboard/[id]". Empty for server actions. */
  urlPath: string;
  /** For api-route: which HTTP verbs are handled. */
  methods?: string[];
  /** For server-action: the exported function name. */
  exportName?: string;
  source: SourceRef;
}

// ---------------------------------------------------------------------------
// The behaviour itself
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gaps — where a behaviour does not do what it appears to.
//
// This is the sharpest thing the tool produces and the easiest to get wrong. A
// false accusation that someone's live app has a security hole is worse than
// saying nothing, so every gap carries what would make it a false alarm.
// ---------------------------------------------------------------------------

export type GapKind =
  /** Destroys, charges or grants access with no visible check on who is asking. */
  | 'unprotected-destructive'
  /** The name promises something the code does not appear to do. */
  | 'unfulfilled-promise';

export interface Gap {
  kind: GapKind;
  /** One line, plain language. This is the sentence someone will screenshot. */
  summary: string;
  /** Why we think so, AND what would make us wrong. Never omit the second half. */
  detail: string;
  /**
   * 'likely'   — we traced the behaviour and the thing is genuinely absent
   * 'possible' — consistent with a gap, but there are ordinary explanations
   */
  confidence: 'likely' | 'possible';
  source: SourceRef;
}

/**
 * What a step is doing, which changes how it should be drawn.
 *
 * `guard` is the one that earns its place: a check followed by an early exit is
 * structurally different from an ordinary statement, and it is the shape of
 * every authorisation check ever written. Knowing which steps are guards is what
 * lets the walkthrough say "and it stops here if that fails" instead of listing
 * an `if` like it were any other line.
 */
export type StepKind =
  /** A check with an early exit — throw, error response, or redirect. */
  | 'guard'
  /** A branch that changes what happens next without ending it. */
  | 'branch'
  /** Something is fetched or computed and kept. */
  | 'gets'
  /** Something happens to the outside world. */
  | 'does'
  /** The behaviour ends and answers. */
  | 'responds';

export interface Step {
  kind: StepKind;
  /** Plain language: "Checks the visitor is signed in". */
  label: string;
  source: SourceRef;
  effects: Effect[];
  unknowns: Unknown[];
  /** For a guard: what happens if the check fails. */
  otherwise?: string;
}

export interface Behaviour {
  /** Stable across scans so drift can be diffed. Derived from trigger identity. */
  id: string;
  /** Plain language: "Someone opens the dashboard". */
  title: string;
  trigger: Trigger;
  steps: Step[];
  /** Aggregated from steps, de-duplicated. */
  effects: Effect[];
  unknowns: Unknown[];
  gaps: Gap[];
}

/**
 * Ranking score. The map ranks by CONSEQUENCE, not by size — a twelve-line
 * delete endpoint outranks a four-hundred-line settings page, because that is
 * the order in which a founder needs to see things.
 */
export function consequenceScore(behaviour: Behaviour): number {
  let score = 0;
  for (const effect of behaviour.effects) {
    score += CONSEQUENTIAL_EFFECTS.has(effect.kind) ? 10 : 1;
  }
  for (const unknown of behaviour.unknowns) {
    if (UNKNOWN_GUIDANCE[unknown.reason].severity === 'warning') score += 5;
    if (UNKNOWN_GUIDANCE[unknown.reason].severity === 'attention') score += 2;
  }
  // A suspected gap outranks everything. If the tool thinks something is wrong,
  // that is the first thing a person should see.
  for (const gap of behaviour.gaps) {
    score += gap.confidence === 'likely' ? 40 : 20;
  }
  return score;
}

export interface ScanResult {
  /** Absolute path that was scanned. */
  root: string;
  /** What we detected the project as. */
  framework: string;
  behaviours: Behaviour[];
  /** Files we could not read at all, with the reason. */
  skipped: Unknown[];
  scannedAt: string;
}

/**
 * Countable prose. Lives here because the CLI and the report both need it and
 * both were getting it wrong independently — "1 ways in" in the terminal, and
 * "reached by 1 behaviours" in an aria-label, which is worse: nobody proofreads
 * the text only a screen reader ever says.
 */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
