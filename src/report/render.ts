/**
 * The report — what someone actually looks at.
 *
 * A single self-contained HTML file: no server, no network, no sibling assets.
 * Open it from a Downloads folder, attach it to an email, drag it into Slack.
 * That portability is also the privacy position — a report that fetches nothing
 * is a report that reveals nothing.
 *
 * THREE VIEWS, ONE DOCUMENT:
 *
 *   #map          what the application can do, grouped and ranked
 *   #wt-<id>      one behaviour, walked through step by step with its code
 *   #drift        what moved since the last scan
 *
 * Switching is pure CSS `:target`. No router, no framework, no build step. The
 * back button works, every view is linkable, and with scripting off the document
 * degrades to all views stacked and readable rather than to a blank page.
 *
 * Two rules govern the layout:
 *
 *   ORIENTATION, NOT ENUMERATION. 686 rows is a data dump. The job is to answer
 *   "what can this thing do, and what should worry me".
 *
 *   CAVEATS SIT LEVEL WITH THEIR CLAIM. In flow, immediately beneath, at every
 *   breakpoint — never a footnote, never a tooltip, never small grey text at the
 *   bottom of the page.
 */

import {
  CONSEQUENTIAL_EFFECTS,
  EFFECT_LABELS,
  consequenceScore,
  type Behaviour,
  type Effect,
  type EffectKind,
  type Step,
  type Unknown,
  plural,
} from '../model.js';
import type { MiddlewareInfo } from '../extract/nextjs/middleware.js';
import { fontFaces } from './assets.js';
import { TOKENS } from './tokens.js';
import { REPORT_CSS } from './styles.js';
import { SourceReader, dedent } from './source.js';
import {
  buildResourceGraph,
  impactOf,
  neighboursOf,
  resourcesOf,
  type ResourceNode,
} from '../extract/graph.js';
import { simulate } from '../extract/simulate.js';
import { constellation } from './constellation.js';
import { starChart } from './starchart.js';
import type { DriftResult, Timeline } from './drift.js';

export interface ReportData {
  projectName: string;
  root: string;
  framework: string;
  behaviours: Behaviour[];
  skipped: Unknown[];
  middleware: MiddlewareInfo;
  elapsedMs: number;
  scannedAt: Date;
  traceDepth: number;
  /** Present only when a previous scan exists to compare against. */
  drift?: DriftResult;
  /** Present once at least two scans have been recorded. */
  timeline?: Timeline;
  /** Embed source snippets in walkthroughs. Off via --no-code. */
  includeCode: boolean;
}

/** Behaviours that get a full walkthrough page. Everything with a finding is
 *  always included regardless of rank — a finding is the reason to look. */
const WALKTHROUGH_LIMIT = 30;
/** Groups shown before the tail is folded into "Everything else". */
const GROUP_LIMIT = 11;
/**
 * Resources listed on the map, and given their own impact view.
 *
 * dub reaches 376 distinct tables and services. Listing all of them is the same
 * enumeration failure the behaviour grouping exists to avoid — and it doubled
 * the file size. The ones with the widest blast radius are the ones worth
 * seeing; the tail is counted honestly instead.
 */
const RESOURCE_LIMIT = 15;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const escape = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `code` spans inside plain-language strings become real markup. */
const withCode = (v: string): string =>
  escape(v).replace(/`([^`]+)`/g, '<code>$1</code>');


const KIND_LABEL: Record<string, string> = {
  page: 'Page',
  'api-route': 'Endpoint',
  'server-action': 'Form action',
  middleware: 'Every request',
};

const isBig = (kind: EffectKind) => CONSEQUENTIAL_EFFECTS.has(kind);
const tone = (kind: EffectKind) => (isBig(kind) ? 'var(--accent)' : 'var(--ink-faint)');

/** Stable, DOM-safe id for a resource view. */
const resSlug = (key: string) => 'res-' + key.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

/** Stable, DOM-safe id for a behaviour. */
const slug = (id: string) => 'wt-' + id.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

const byConsequence = (a: Behaviour, b: Behaviour) => consequenceScore(b) - consequenceScore(a);

const bigFirst = (a: Effect, b: Effect) => (isBig(b.kind) ? 1 : 0) - (isBig(a.kind) ? 1 : 0);

// ---------------------------------------------------------------------------
// Grouping — how 686 becomes readable
// ---------------------------------------------------------------------------

function groupOf(b: Behaviour): string {
  if (b.trigger.kind === 'server-action') return 'Form actions';
  if (b.trigger.kind === 'middleware') return 'Every request';

  const parts = b.trigger.urlPath.split('/').filter(Boolean);
  if (parts.length === 0) return 'Home';
  if (parts[0] === 'api') return parts[1] ? `API · ${parts[1]}` : 'API';
  return parts[0].replace(/^\(|\)$/g, '');
}

interface Group {
  name: string;
  items: Behaviour[];
  score: number;
}

function grouped(behaviours: Behaviour[]): Group[] {
  const map = new Map<string, Behaviour[]>();
  for (const b of behaviours) {
    const key = groupOf(b);
    (map.get(key) ?? map.set(key, []).get(key)!).push(b);
  }

  const groups: Group[] = [...map.entries()].map(([name, items]) => ({
    name,
    items: [...items].sort(byConsequence),
    score: Math.max(...items.map(consequenceScore)),
  }));

  if (groups.length <= GROUP_LIMIT) {
    return groups.sort((a, b) => b.score - a.score || b.items.length - a.items.length);
  }

  /**
   * A group earns its own row if it is HIGH-CONSEQUENCE or LARGE.
   *
   * Selecting on consequence alone put every API group in the head and swept
   * 413 of dub's 686 behaviours into a single "Everything else" — more than half
   * the application in one drawer, which is the data dump this grouping exists
   * to prevent. Selecting on size alone would bury a small, dangerous group.
   * Taking the union of both lists keeps the dangerous ones and the big ones.
   */
  const half = Math.ceil(GROUP_LIMIT / 2);
  const byRisk = [...groups].sort((a, b) => b.score - a.score).slice(0, half);
  const bySize = [...groups].sort((a, b) => b.items.length - a.items.length).slice(0, GROUP_LIMIT - half);

  const chosen = new Set<string>([...byRisk, ...bySize].map((g) => g.name));
  const head = groups
    .filter((g) => chosen.has(g.name))
    .sort((a, b) => b.score - a.score || b.items.length - a.items.length);
  const tail = groups.filter((g) => !chosen.has(g.name));

  if (tail.length > 0) {
    head.push({
      name: `Everything else (${tail.length} smaller ${plural(tail.length, 'area', 'areas')})`,
      items: tail.flatMap((g) => g.items).sort(byConsequence),
      score: 0,
    });
  }
  return head;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function pip(kind: EffectKind, title?: string): string {
  return `<span class="pip" style="--bar:${tone(kind)}"${title ? ` title="${escape(title)}"` : ''}></span>`;
}

function capabilityBars(behaviours: Behaviour[]): string {
  const counts = new Map<EffectKind, number>();
  for (const b of behaviours) {
    for (const kind of new Set(b.effects.map((e) => e.kind))) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return '';

  const rows = [...counts.entries()].sort((a, b) => {
    const d = (isBig(b[0]) ? 1 : 0) - (isBig(a[0]) ? 1 : 0);
    return d !== 0 ? d : b[1] - a[1];
  });
  const max = Math.max(...rows.map(([, n]) => n));

  return `<ul class="bars">${rows
    .map(([kind, count], i) => {
      const width = Math.max(2, Math.round((count / max) * 100));
      return `<li>
      <div class="bar__head">
        <span class="bar__label">${pip(kind)}${escape(EFFECT_LABELS[kind])}</span>
        <span class="bar__count num">${count}</span>
      </div>
      <div class="bar__track">
        <div class="bar__fill" style="width:${width}%;--bar:${tone(kind)};animation-delay:${i * 55}ms"></div>
      </div>
    </li>`;
    })
    .join('')}</ul>`;
}

function findings(behaviours: Behaviour[], linkable: Set<string>): string {
  const withGaps = behaviours.filter((b) => b.gaps.length > 0);

  if (withGaps.length === 0) {
    return `<div class="clear">
      <svg class="clear__mark" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3.5 9.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div><strong>Nothing looked wrong.</strong> Every behaviour that deletes data or
      moves money also establishes who is asking.</div>
    </div>
    <div class="caveat">
      <span class="caveat__label">What this does and does not mean</span>
      This is the correct result for a well-built application. It is a statement
      about what we could read, not a guarantee — a guard reached through code we
      could not follow and a missing guard look identical from here.
    </div>`;
  }

  return `<div class="findings">${withGaps
    .flatMap((b) =>
      b.gaps.map(
        (gap) => `<div class="finding finding--${gap.confidence}">
        <div class="finding__top">
          <span class="badge badge--${gap.confidence}">${gap.confidence}</span>
          <span class="finding__where">${escape(gap.source.file)}:${gap.source.line}</span>
        </div>
        <p class="finding__summary">${withCode(gap.summary)}</p>
        <p class="finding__detail">${withCode(gap.detail)}</p>
        ${linkable.has(b.id) ? `<a class="finding__link" href="#${slug(b.id)}">Walk through ${escape(b.title)} →</a>` : ''}
      </div>`,
      ),
    )
    .join('')}</div>`;
}

function behaviourRow(b: Behaviour, linkable: boolean): string {
  const effects = [...b.effects].sort(bigFirst);
  const shown = effects.slice(0, 4);
  const rest = effects.length - shown.length;

  const body = `
    <div class="beh__top">
      <span class="beh__title">${escape(b.title)}</span>
      <span class="beh__kind">${escape(KIND_LABEL[b.trigger.kind] ?? '')}</span>
    </div>
    <div class="beh__where">${escape(b.trigger.source.file)}:${b.trigger.source.line}</div>
    ${
      effects.length > 0
        ? `<div class="beh__pips">${shown
            .map((e) => pip(e.kind, EFFECT_LABELS[e.kind]))
            .join('')}${rest > 0 ? `<span class="beh__more">+${rest}</span>` : ''}</div>`
        : ''
    }`;

  return linkable
    ? `<a class="beh" href="#${slug(b.id)}">${body}</a>`
    : `<div class="beh">${body}</div>`;
}

function groupList(groups: Group[], linkable: Set<string>): string {
  return `<div class="groups">${groups
    .map((g, i) => {
      const marks = [
        ...new Set(g.items.flatMap((b) => b.effects.filter((e) => isBig(e.kind)).map((e) => e.kind))),
      ];
      const gaps = g.items.reduce((n, b) => n + b.gaps.length, 0);

      return `<details class="group"${i < 2 ? ' open' : ''}>
      <summary>
        <svg class="group__chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M3 1.5L6.5 5 3 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="group__name">${escape(g.name)}</span>
        <span class="group__count num">${g.items.length}</span>
        <span class="group__marks">
          ${gaps > 0 ? `<span class="badge badge--likely">${gaps} to check</span>` : ''}
          ${marks.map((k) => pip(k, EFFECT_LABELS[k])).join('')}
        </span>
      </summary>
      <div class="group__body">${g.items.map((b) => behaviourRow(b, linkable.has(b.id))).join('')}</div>
    </details>`;
    })
    .join('')}</div>`;
}

function resourceList(graph: ResourceNode[], shown: ResourceNode[]): string {
  if (shown.length === 0) return '';
  const max = Math.max(...graph.map((n) => n.touches.length));

  return `<div class="res-list">${shown
    .map((node) => {
      const width = Math.max(3, Math.round((node.touches.length / max) * 100));
      const n = node.touches.length;
      return `<a class="res" href="#${resSlug(node.key)}">
      <div class="res__top">
        <span class="res__name">${escape(node.resource.name)}</span>
        <span class="res__kind">${escape(node.resource.kind)}</span>
      </div>
      <div class="res__bar"><div class="res__fill" style="width:${width}%"></div></div>
      <div class="res__meta">
        <span><b>${n}</b> ${plural(n, 'behaviour', 'behaviours')}</span>
        ${node.reads > 0 ? `<span><b>${node.reads}</b> read</span>` : ''}
        ${node.writes > 0 ? `<span><b>${node.writes}</b> write</span>` : ''}
        ${node.deletes > 0 ? `<span><b>${node.deletes}</b> delete</span>` : ''}
        ${node.uncertain ? '<span class="res__uncertain">named at runtime</span>' : ''}
      </div>
    </a>`;
    })
    .join('')}</div>`;
}

/** How many items to list per wave before folding the rest into a count. */
const WAVE_ITEM_LIMIT = 8;

function cascade(node: ResourceNode, graph: ResourceNode[], linkable: Set<string>,
                 linkableResources: Set<string>): string {
  const sim = simulate(node, graph);

  const waves = sim.waves
    .map((wave) => {
      const items: string[] = [];

      for (const b of wave.behaviours.slice(0, WAVE_ITEM_LIMIT)) {
        const body = `<span class="wave__mark" aria-hidden="true">→</span><span>${escape(b.title)}</span>`;
        items.push(
          linkable.has(b.id)
            ? `<a class="wave__item" href="#${slug(b.id)}">${body}</a>`
            : `<span class="wave__item">${body}</span>`,
        );
      }

      for (const r of wave.resources.slice(0, WAVE_ITEM_LIMIT)) {
        const body = `<span class="wave__mark" aria-hidden="true">~</span><span>${escape(r.resource.name)}</span>`;
        items.push(
          linkableResources.has(r.key)
            ? `<a class="wave__item wave__item--res" href="#${resSlug(r.key)}">${body}</a>`
            : `<span class="wave__item wave__item--res">${body}</span>`,
        );
      }

      const shown = Math.min(WAVE_ITEM_LIMIT, wave.behaviours.length) +
                    Math.min(WAVE_ITEM_LIMIT, wave.resources.length);
      const total = wave.behaviours.length + wave.resources.length;

      return `<div class="wave wave--${wave.certainty}">
        <span class="wave__node" aria-hidden="true">${wave.order}</span>
        <div class="wave__top">
          <span class="wave__title">${escape(wave.title)}</span>
          <span class="badge${wave.certainty === 'direct' ? ' badge--likely' : ''}">${
            wave.certainty === 'direct' ? 'in the code' : 'worked out'
          }</span>
          <span class="wave__more">${total}</span>
        </div>
        <p class="wave__detail">${escape(wave.detail)}</p>
        <div class="wave__items">${items.join('')}</div>
        ${total > shown ? `<p class="wave__more">and ${total - shown} more</p>` : ''}
      </div>`;
    })
    .join('');

  return `<div class="sim">
    <div class="section__head"><h3 class="h2">What happens next</h3></div>
    <p class="sim__premise" style="margin-top:var(--s5)">${escape(sim.premise)}…</p>
    <p class="sim__total"><b>${sim.totalBehaviours}</b> ${plural(sim.totalBehaviours, 'behaviour', 'behaviours')} affected in total</p>
    <div class="waves">${waves}</div>
    <div class="caveat caveat--alert">
      <span class="caveat__label">How far to trust this</span>
      ${sim.caveats.map((c) => escape(c)).join('<br><br>')}
    </div>
  </div>`;
}

/** One view per resource: what breaks if you change it, and everything that touches it. */
function impactView(
  node: ResourceNode,
  linkable: Set<string>,
  graph: ResourceNode[],
  linkableResources: Set<string>,
): string {
  const impact = impactOf(node);

  return `<section class="view" id="${resSlug(node.key)}" aria-label="Impact: ${escape(node.resource.name)}">
    <div class="wrap">
      <a class="back" href="#map">← All behaviours</a>

      <div class="col" style="margin-top:var(--s5)">
        <p class="eyebrow">${escape(node.resource.kind)}</p>
        <h2 class="h1" style="margin-top:var(--s3);font-family:var(--font-data)">${escape(node.resource.name)}</h2>
      </div>

      <div class="impact">
        <div class="section__head"><h3 class="h2">What breaks if you change it</h3></div>
        <div class="impact__list" style="margin-top:var(--s5)">
          ${impact.consequences
            .map((c, i) => {
              const severe = /delete|gone for everything|cannot undo/i.test(c);
              const unsure = /may be longer|chosen at runtime/i.test(c);
              const cls = unsure ? ' consequence--unsure' : severe ? ' consequence--severe' : '';
              const mark = unsure ? '?' : severe ? '!' : i === 0 ? '→' : '·';
              return `<p class="consequence${cls}">
              <span class="consequence__mark" aria-hidden="true">${mark}</span>
              <span>${withCode(c)}</span>
            </p>`;
            })
            .join('')}
        </div>

        ${cascade(node, graph, linkable, linkableResources)}

        <div class="touches">
          <div class="section__head">
            <h3 class="h2">Everything that reaches it</h3>
            <span class="section__index">${node.touches.length}</span>
          </div>
          ${node.touches
            .map(({ behaviour, effects }) => {
              const body = `<span class="touch__title">${escape(behaviour.title)}</span>
              <span class="touch__how">${effects
                .map(
                  (e) =>
                    `<span>${pip(e.kind)}${withCode(e.description)}</span>`,
                )
                .join('')}</span>`;
              return linkable.has(behaviour.id)
                ? `<a class="touch" href="#${slug(behaviour.id)}">${body}</a>`
                : `<div class="touch">${body}</div>`;
            })
            .join('')}
        </div>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Walkthrough
// ---------------------------------------------------------------------------

/**
 * Order the effects of a behaviour into a readable sequence.
 *
 * IMPORTANT HONESTY POINT: this is SOURCE order, not execution order. Static
 * analysis cannot know what actually runs first — a conditional, an early
 * return or an await changes it. The heading says so, because presenting source
 * order as execution order would be exactly the kind of confident wrongness this
 * tool exists to avoid.
 */
function sequence(b: Behaviour): Effect[] {
  const entry = b.trigger.source.file;
  return [...b.effects].sort((x, y) => {
    if (x.source.file !== y.source.file) {
      if (x.source.file === entry) return -1;
      if (y.source.file === entry) return 1;
      return x.source.file.localeCompare(y.source.file);
    }
    return x.source.line - y.source.line;
  });
}

function codeBlock(reader: SourceReader, file: string, line: number): string {
  const snip = reader.read(file, line);
  if (!snip) return '';
  const lines = dedent(snip.lines);

  return `<div class="code">
    <div class="code__head"><span>${escape(file)}</span><span>line ${line}</span></div>
    <pre><code>${lines
      .map((text, i) => {
        const n = snip.startLine + i;
        const row = `<span class="ln">${String(n).padStart(4, ' ')}</span>${escape(text) || ' '}`;
        return i === snip.hitIndex ? `<span class="hit">${row}</span>` : row;
      })
      .join('\n')}</code></pre>
  </div>`;
}


const STEP_LABEL: Record<string, string> = {
  guard: 'Stops here if this fails',
  branch: 'Branches',
  gets: 'Works something out',
  does: 'Changes something',
  responds: 'Answers',
};

/**
 * One step of a walkthrough.
 *
 * A guard is drawn differently from everything else because it IS different:
 * every step below it is conditional on it passing. Drawing it as just another
 * line would hide the single most important thing about the sequence.
 */
function renderStep(step: Step, index: number, reader: SourceReader | null): string {
  const consequential = step.effects.some((e) => isBig(e.kind));
  const isGuard = step.kind === 'guard';

  const extras = step.effects
    .slice(1)
    .map(
      (e) =>
        `<li class="fx__row${isBig(e.kind) ? '' : ' fx--minor'}">${pip(e.kind)}<span>${withCode(e.description)}</span></li>`,
    )
    .join('');

  const warnings = step.unknowns
    .filter((u) => u.reason === 'config-dependent')
    .map((u) => `<p class="flag"><span class="flag__mark" aria-hidden="true">&#9650;</span><span>${withCode(u.detail)}</span></p>`)
    .join('');

  return `<li class="step${consequential || isGuard ? ' step--big' : ''}">
    <span class="step__node num" aria-hidden="true">${index + 1}</span>
    <span class="step__tag">${escape(STEP_LABEL[step.kind] ?? '')}</span>
    <p class="step__label">${withCode(step.label)}${
      step.otherwise
        ? ` <span class="hedge">&mdash; otherwise it ${escape(step.otherwise)}</span>`
        : ''
    }</p>
    ${extras ? `<ul class="fx">${extras}</ul>` : ''}
    ${warnings}
    <p class="step__where">${escape(step.source.file)}:${step.source.line}</p>
    ${reader ? codeBlock(reader, step.source.file, step.source.line) : ''}
  </li>`;
}

function walkthrough(
  b: Behaviour,
  reader: SourceReader | null,
  graph: ResourceNode[],
  linkableResources: Set<string>,
): string {
  const deps = resourcesOf(b);
  const neighbours = neighboursOf(b, graph);
  /**
   * Prefer the behaviour's REAL statements. Falling back to effects sorted by
   * file and line is still honest, but it cannot show that a check stops
   * everything, so the caveat below changes to match which one is in use.
   */
  const usingRealSteps = b.steps.length > 0;
  const steps: Step[] = usingRealSteps
    ? b.steps
    : sequence(b).map((e) => ({
        kind: 'does' as const,
        label: e.description,
        source: e.source,
        effects: [e],
        unknowns: [],
      }));

  const configs = b.unknowns.filter((u) => u.reason === 'config-dependent');

  return `<section class="view" id="${slug(b.id)}" aria-label="Walkthrough: ${escape(b.title)}">
    <div class="wrap">
      <a class="back" href="#map">← All behaviours</a>

      <div class="col" style="margin-top:var(--s5)">
        <p class="eyebrow">${escape(KIND_LABEL[b.trigger.kind] ?? '')}${
          b.trigger.methods ? ` · ${escape(b.trigger.methods.join(' '))}` : ''
        }</p>
        <h2 class="h1" style="margin-top:var(--s3)">${escape(b.title)}</h2>
        <p class="meta" style="margin-top:var(--s3)">${escape(b.trigger.source.file)}:${b.trigger.source.line}</p>
      </div>

      ${b.gaps
        .map(
          (gap) => `<div class="finding finding--${gap.confidence}" style="margin-top:var(--s6)">
        <div class="finding__top"><span class="badge badge--${gap.confidence}">${gap.confidence}</span></div>
        <p class="finding__summary">${withCode(gap.summary)}</p>
        <p class="finding__detail">${withCode(gap.detail)}</p>
      </div>`,
        )
        .join('')}

      ${
        steps.length === 0
          ? `<div class="caveat" style="margin-top:var(--s6)">
              <span class="caveat__label">Nothing to walk through</span>
              We found no effects here. It may genuinely do nothing, or its work
              may happen further away than we followed.
            </div>`
          : `<div class="section" style="margin-top:var(--s7)">
              <div class="section__head">
                <h3 class="h2">What it does</h3>
                <span class="section__index">${steps.length} ${plural(steps.length, 'step', 'steps')}</span>
              </div>
              ${
                usingRealSteps
                  ? `<div class="caveat">
                      <span class="caveat__label">Read top to bottom</span>
                      These are the statements of this behaviour in the order they are
                      written. A step marked <strong>stops here</strong> ends everything
                      below it when its check fails. Work reached through other files is
                      listed but not placed in sequence — we can see that it happens, not
                      exactly when.
                    </div>`
                  : `<div class="caveat">
                      <span class="caveat__label">Read this as source order, not run order</span>
                      We could not read this behaviour's own body, so these are listed in
                      the order they appear across your files. We read the code without
                      running it, so we cannot know which branch executes first.
                    </div>`
              }
              <ol class="steps">
                ${steps.map((step, i) => renderStep(step, i, reader)).join('')}
              </ol>
            </div>`
      }

      ${
        configs.length > 0
          ? `<div class="section">
              <div class="section__head"><h3 class="h2">Depends on configuration</h3></div>
              ${configs
                .map(
                  (u) => `<div class="caveat caveat--accent">
                <span class="caveat__label">${escape(u.source.file)}:${u.source.line}</span>
                ${withCode(u.detail)}
              </div>`,
                )
                .join('')}
            </div>`
          : ''
      }
    </div>
  </section>`;
}

function spaceView(graph: ResourceNode[]): string {
  const map = constellation(graph, resSlug);
  if (!map.svg) return '';

  const biggest = graph[0];
  const destructive = graph.filter((n) => n.deletes > 0).length;

  return `<section class="view" id="space" aria-label="Dependency map">
    <div class="wrap">
      <a class="back" href="#map">← All behaviours</a>

      <div class="col" style="margin-top:var(--s5)">
        <p class="eyebrow">${map.nodeCount} ${plural(map.nodeCount, 'dependency', 'dependencies')} · ${map.edgeCount} ${plural(map.edgeCount, 'connection', 'connections')}</p>
        <h2 class="h1" style="margin-top:var(--s3)">Everything this application leans on.</h2>
        <p class="lead" style="margin-top:var(--s4)">Two things are joined when some
        behaviour reaches both — so a line means they get changed together, whether
        or not anyone meant them to.</p>
      </div>

      <div class="cst" id="cst">
        <div class="cst__stage">
          ${map.svg}
          <div class="cst__readout" id="cst-readout" aria-hidden="true"></div>
        </div>
        <div class="cst__bar">
          <span class="cst__key"><span class="cst__swatch cst__swatch--big"></span>something can delete from it</span>
          <span class="cst__key"><span class="cst__swatch"></span>read or written only</span>
          <span class="cst__key"><span class="cst__swatch cst__swatch--svc"></span>outside service</span>
          <span class="cst__key">size = how much reaches it</span>
          <span class="cst__zoom">
            <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
            <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
            <button type="button" data-zoom="reset" aria-label="Reset view">⤺</button>
            <button type="button" data-full="cst" aria-label="View full screen">Full screen</button>
          </span>
        </div>
      </div>

      <div class="caveat caveat--accent">
        <span class="caveat__label">How to read it</span>
        <strong>${escape(biggest.resource.name)}</strong> is the centre of gravity —
        ${biggest.touches.length} ${plural(biggest.touches.length, 'behaviour reaches', 'behaviours reach')} it.
        ${destructive > 0
          ? `${destructive} of these ${plural(destructive, 'is one', 'are ones')} something can delete from.`
          : 'Nothing here can be deleted from.'}
        Click any node to see exactly what breaks if you change it.
      </div>

      <div class="caveat">
        <span class="caveat__label">What this picture leaves out</span>
        Only names written literally in the code can be placed. Anything reached
        through a name chosen at runtime is missing from this map entirely — not
        drawn faintly, not drawn at all — so treat it as a floor on how connected
        your application is, never a ceiling.
      </div>
    </div>
  </section>`;
}

function starView(graph: ResourceNode[]): string {
  const chart = starChart(graph, resSlug);
  if (!chart.svg) return '';

  return `<section class="view" id="stars" aria-label="Dependency map in depth">
    <div class="wrap">
      <a class="back" href="#map">← All behaviours</a>

      <div class="col" style="margin-top:var(--s5)">
        <p class="eyebrow">${chart.nodeCount} ${plural(chart.nodeCount, 'dependency', 'dependencies')} · in depth</p>
        <h2 class="h1" style="margin-top:var(--s3)">The same map, with room to breathe.</h2>
        <p class="lead" style="margin-top:var(--s4)">Drag to turn it. Nearer means larger
        and brighter; the clusters are groups of tables your application almost always
        touches together.</p>
        <p style="margin-top:var(--s4)"><a href="#space">See it flat instead →</a></p>
      </div>

      <div class="sc" id="sc">
        <div class="sc__stage">
          ${chart.svg}
          <div class="cst__readout" id="sc-readout" aria-hidden="true"></div>
          <span class="sc__hint">Drag to turn · scroll to zoom</span>
        </div>
        <div class="cst__bar">
          <span class="cst__key"><span class="cst__swatch cst__swatch--big"></span>something can delete from it</span>
          <span class="cst__key"><span class="cst__swatch"></span>read or written only</span>
          <span class="cst__key"><span class="cst__swatch cst__swatch--svc"></span>outside service</span>
          <span class="cst__zoom">
            <button type="button" data-turn="out" aria-label="Zoom out">−</button>
            <button type="button" data-turn="in" aria-label="Zoom in">+</button>
            <button type="button" data-turn="drift" aria-label="Start or stop the slow turn">◐</button>
            <button type="button" data-turn="reset" aria-label="Reset the view">⤺</button>
            <button type="button" data-full="sc" aria-label="View full screen">Full screen</button>
          </span>
        </div>
      </div>

      <div class="caveat">
        <span class="caveat__label">Why depth rather than decoration</span>
        Forced onto one plane, a densely-connected graph presses unrelated clusters
        into each other simply because there is nowhere else for them to go. A third
        axis gives them somewhere, so what you are looking at is closer to the shape
        of the data. Everything here is the same information as the flat map and the
        text list — <strong>no claim is made in this view that is not made in those.</strong>
      </div>

      <div class="caveat">
        <span class="caveat__label">What this picture leaves out</span>
        Only names written literally in the code can be placed. Anything reached
        through a name chosen at runtime is absent entirely, so treat this as a floor
        on how connected your application is, never a ceiling.
      </div>
    </div>
  </section>`;
}


/**
 * The timeline — the system over time, with a playhead you can move.
 *
 * Selection is radio inputs and `:checked`, not script. Scrubbing therefore
 * works with JavaScript disabled, arrow keys move between scans for free, and
 * the choice survives the Back button. There is no state to lose because there
 * is no state: every position is already in the document.
 *
 * The per-stop rules are generated alongside the markup so the two cannot drift
 * apart.
 */
function timelineView(timeline: Timeline): string {
  const points = timeline.points;
  if (points.length < 2) return '';

  const W = 1000;
  const H = 170;
  const PAD_X = 26;
  const PAD_Y = 18;

  const maxBehaviours = Math.max(1, ...points.map((p) => p.behaviours));
  const maxGaps = Math.max(1, ...points.map((p) => p.gaps));

  const xAt = (i: number) => PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
  const yBeh = (v: number) => H - PAD_Y - (v / maxBehaviours) * (H - PAD_Y * 2);
  const yGap = (v: number) => H - PAD_Y - (v / maxGaps) * (H - PAD_Y * 2) * 0.55;

  const behLine = points.map((p, i) => xAt(i).toFixed(1) + ',' + yBeh(p.behaviours).toFixed(1)).join(' ');
  const area = PAD_X + ',' + (H - PAD_Y) + ' ' + behLine + ' ' + (W - PAD_X).toFixed(1) + ',' + (H - PAD_Y);
  const anyGaps = points.some((p) => p.gaps > 0);
  const gapLine = points.map((p, i) => xAt(i).toFixed(1) + ',' + yGap(p.gaps).toFixed(1)).join(' ');

  /**
   * Label the axis at the resolution the data actually has.
   *
   * A fixed format is wrong at both ends. Dates make five scans taken minutes
   * apart read as five identical labels — which looks broken and hides the
   * ordering entirely. Times make scans months apart meaningless. So the
   * resolution follows the span: seconds for a rapid sequence, minutes within a
   * day or so, dates beyond that.
   */
  const spanMs =
    new Date(points[points.length - 1].scannedAt).getTime() -
    new Date(points[0].scannedAt).getTime();

  const MINUTE = 60 * 1000;
  const resolution: 'seconds' | 'minutes' | 'days' =
    spanMs < 45 * MINUTE ? 'seconds' : spanMs < 36 * 60 * MINUTE ? 'minutes' : 'days';

  const short = (iso: string) =>
    resolution === 'seconds'
      ? iso.slice(11, 19) // HH:MM:SS
      : resolution === 'minutes'
        ? iso.slice(11, 16) // HH:MM
        : iso.slice(5, 10).replace('-', '/');

  const full = (iso: string) =>
    resolution === 'seconds' ? iso.slice(0, 19).replace('T', ' ') : iso.slice(0, 16).replace('T', ' ');

  // One block of rules per stop: light the pin, show the panel, show the playhead.
  const rules = points
    .map(
      (_, i) => `
#tl-${i}:checked ~ .tl__track [for="tl-${i}"] .tl__pin{background:var(--accent);border-color:var(--accent);transform:scale(1.35)}
#tl-${i}:checked ~ .tl__track [for="tl-${i}"] .tl__when{color:var(--ink)}
#tl-${i}:checked ~ .tl__panels #tl-panel-${i}{display:block}
#tl-${i}:checked ~ .tl__chart .tl__head-${i}{opacity:1}`,
    )
    .join('');

  const heads = points
    .map(
      (_, i) =>
        `<g class="tl__head-${i}" style="opacity:0"><line x1="${xAt(i).toFixed(1)}" y1="${PAD_Y - 8}" x2="${xAt(i).toFixed(1)}" y2="${H - PAD_Y}" stroke="var(--accent)" stroke-width="1.5"/><circle cx="${xAt(i).toFixed(1)}" cy="${yBeh(points[i].behaviours).toFixed(1)}" r="4.5" fill="var(--accent)"/></g>`,
    )
    .join('');

  const stops = points
    .map(
      (p, i) =>
        `<label class="tl__stop${p.gaps > 0 ? ' has-gap' : ''}" for="tl-${i}" title="${escape(full(p.scannedAt))}">
        <span class="tl__pin"></span>
        <span class="tl__when">${escape(short(p.scannedAt))}</span>
      </label>`,
    )
    .join('');

  const delta = (now: number, before: number | null, invert = false) => {
    if (before === null || now === before) return '';
    const up = now > before;
    const good = invert ? !up : up;
    return `<span class="tl__delta tl__delta--${good ? 'up' : 'down'}">${up ? '+' : ''}${now - before}</span>`;
  };

  const panels = points
    .map((p, i) => {
      const prev = i > 0 ? points[i - 1] : null;
      const moved = p.changes.length;

      const changeList = p.changes
        .slice(0, 10)
        .map(
          (c) => `<div class="change change--${c.kind}">
        <p class="change__op">${c.kind === 'added' ? 'New' : c.kind === 'removed' ? 'Gone' : 'Changed'}</p>
        <p class="change__title">${escape(c.title)}</p>
        <div class="change__body">
          ${c.lost.map((l) => `<div class="delta delta--gone"><span class="delta__sign">−</span><span>No longer: ${withCode(l)}</span></div>`).join('')}
          ${c.gained.map((g) => `<div class="delta delta--new"><span class="delta__sign">+</span><span>Now also: ${withCode(g)}</span></div>`).join('')}
          ${c.gapDelta > 0 ? `<div class="delta delta--gone"><span class="delta__sign">!</span><span>${c.gapDelta} new ${plural(c.gapDelta, 'thing', 'things')} worth checking</span></div>` : ''}
        </div>
      </div>`,
        )
        .join('');

      const firstNote = `<div class="caveat"><span class="caveat__label">Where the record starts</span>
             This is the first scan we have. There is nothing before it to compare against, so
             nothing is marked as changed — that is an absence of history, not an absence of
             change.</div>`;

      const stillNote = `<div class="clear" style="margin-top:var(--s5)">
               <svg class="clear__mark" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                 <path d="M3.5 9.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
               <div><strong>Nothing moved.</strong> All ${p.unchanged} behaviours did exactly
               what they did at the scan before.</div>
             </div>`;

      const movedNote = `<div class="drift" style="margin-top:var(--s5)">${changeList}</div>
             ${moved > 10 ? `<p class="wave__more">and ${moved - 10} more</p>` : ''}`;

      return `<div class="tl__panel" id="tl-panel-${i}">
      <p class="tl__when-big">${escape(full(p.scannedAt))}</p>
      <dl class="tl__state">
        <div class="tl__cell"><dt>Ways in</dt><dd>${p.behaviours}${delta(p.behaviours, prev ? prev.behaviours : null)}</dd></div>
        <div class="tl__cell"><dt>Things it does</dt><dd>${p.effects}${delta(p.effects, prev ? prev.effects : null)}</dd></div>
        <div class="tl__cell${p.gaps > 0 ? ' tl__cell--alert' : ''}"><dt>Worth checking</dt><dd>${p.gaps}${delta(p.gaps, prev ? prev.gaps : null, true)}</dd></div>
        <div class="tl__cell"><dt>Moved</dt><dd>${moved}</dd></div>
      </dl>
      ${i === 0 ? firstNote : moved === 0 ? stillNote : movedNote}
    </div>`;
    })
    .join('');

  const last = points.length - 1;

  return `<section class="view" id="timeline" aria-label="Timeline">
    <div class="wrap">
      <a class="back" href="#map">← All behaviours</a>

      <div class="col" style="margin-top:var(--s5)">
        <p class="eyebrow">${points.length} scans · ${escape(short(points[0].scannedAt))} to ${escape(short(points[last].scannedAt))}</p>
        <h2 class="h1" style="margin-top:var(--s3)">Your application, over time.</h2>
        <p class="lead" style="margin-top:var(--s4)">Move along the track to see what the
        system looked like at each scan, and what moved to get there.</p>
      </div>

      <style>${rules}</style>
      <div class="tl">
        ${points.map((_, i) => `<input class="tl__inputs" type="radio" name="tl" id="tl-${i}"${i === last ? ' checked' : ''}>`).join('')}

        <div class="tl__chart">
          <svg class="tl__svg" viewBox="0 0 ${W} ${H}" role="img"
               aria-label="Ways into the application at each scan, oldest on the left.">
            <polygon class="tl__area" points="${area}" />
            <polyline class="tl__line" points="${behLine}" />
            ${anyGaps ? `<polyline class="tl__gapline" points="${gapLine}" />` : ''}
            ${heads}
          </svg>
        </div>

        <div class="tl__track">${stops}</div>
        <div class="tl__panels">${panels}</div>
      </div>

      <div class="caveat">
        <span class="caveat__label">What the line is</span>
        The solid line is how many ways into the application there were at each scan.
        ${anyGaps ? 'The dashed line is how many things were worth checking. ' : ''}
        Only the most recent scans are kept — history is pruned so the file cannot grow
        without limit.
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Drift
// ---------------------------------------------------------------------------

function driftView(drift: DriftResult): string {
  const since = drift.since.slice(0, 16).replace('T', ' ');

  return `<section class="view" id="drift" aria-label="What changed">
    <div class="wrap">
      <a class="back" href="#map">← All behaviours</a>

      <div class="col" style="margin-top:var(--s5)">
        <p class="eyebrow">Compared with ${escape(since)}</p>
        <h2 class="h1" style="margin-top:var(--s3)">What moved since the last scan</h2>
      </div>

      ${
        drift.changes.length === 0
          ? `<div class="clear" style="margin-top:var(--s6)">
              <svg class="clear__mark" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M3.5 9.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div><strong>Nothing moved.</strong> All ${drift.unchanged} behaviours do
              exactly what they did before.</div>
            </div>`
          : `<div class="drift">${drift.changes
              .map(
                (c) => `<div class="change change--${c.kind}">
          <p class="change__op">${c.kind === 'added' ? 'New' : c.kind === 'removed' ? 'Gone' : 'Changed'}</p>
          <p class="change__title">${escape(c.title)}</p>
          <div class="change__body">
            ${c.lost
              .map(
                (l) =>
                  `<div class="delta delta--gone"><span class="delta__sign">−</span><span>No longer: ${withCode(l)}</span></div>`,
              )
              .join('')}
            ${c.gained
              .map(
                (g) =>
                  `<div class="delta delta--new"><span class="delta__sign">+</span><span>Now also: ${withCode(g)}</span></div>`,
              )
              .join('')}
            ${
              c.gapDelta > 0
                ? `<div class="delta delta--gone"><span class="delta__sign">!</span><span>${c.gapDelta} new ${plural(c.gapDelta, 'thing', 'things')} worth checking</span></div>`
                : ''
            }
          </div>
        </div>`,
              )
              .join('')}</div>
          <div class="caveat">
            <span class="caveat__label">${drift.unchanged} unchanged, not listed</span>
            Only what moved is shown. A behaviour losing an effect is ranked above
            one gaining a new one — an email that quietly stopped sending is the
            failure you cannot otherwise detect.
          </div>`
      }
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function renderReport(data: ReportData): string {
  const { behaviours } = data;

  const ranked = [...behaviours].sort(byConsequence);
  const linkable = new Set<string>([
    ...ranked.slice(0, WALKTHROUGH_LIMIT).map((b) => b.id),
    ...behaviours.filter((b) => b.gaps.length > 0).map((b) => b.id),
  ]);

  const reader = data.includeCode ? new SourceReader(data.root) : null;
  const groups = grouped(behaviours);
  const graph = buildResourceGraph(behaviours);
  const topResources = graph.slice(0, RESOURCE_LIMIT);
  const linkableResources = new Set(topResources.map((n) => n.key));

  const gapCount = behaviours.reduce((n, b) => n + b.gaps.length, 0);
  const configCount = behaviours.reduce(
    (n, b) => n + b.unknowns.filter((u) => u.reason === 'config-dependent').length,
    0,
  );
  const silent = behaviours.filter((b) => b.effects.length === 0).length;
  const stamp = data.scannedAt.toISOString().slice(0, 16).replace('T', ' ');

  const middlewareNote = !data.middleware.present
    ? 'This project has no middleware, so nothing checks a request before it reaches your code.'
    : data.middleware.matchers === null
      ? 'Middleware runs on every request, so it may be checking things we cannot see from the route itself.'
      : `Middleware runs on ${data.middleware.matchers.length} ${plural(data.middleware.matchers.length, 'path pattern', 'path patterns')}. Findings on paths it does not cover are stronger.`;

  // A tick scale under the readout: one tick per behaviour, capped so it stays a
  // scale rather than becoming a barcode.
  const ticks = Math.min(behaviours.length, 60);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(data.projectName)} — what this application does</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#F6F8FA" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#0B0F13" media="(prefers-color-scheme:dark)">
<style>${fontFaces()}${TOKENS}${REPORT_CSS}</style>
</head>
<body>
<a class="skip" href="#map">Skip to report</a>

<header class="top">
  <div class="wrap top__bar">
    <a class="mark" href="#map">
      <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true" fill="none">
        <path d="M2 2.5h13M2 6.5h13M2 14.5h13M2 17.5h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".4"/>
        <path d="M7 10.5h13" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      what it does
    </a>
    <span class="top__spacer"></span>
    <nav class="tabs" aria-label="Views">
      <a class="tab" href="#map" aria-current="page">Map</a>
      ${graph.length > 0 ? '<a class="tab" href="#space">Dependencies</a>' : ''}
      ${graph.length > 2 ? '<a class="tab" href="#stars">In depth</a>' : ''}
      ${data.timeline ? '<a class="tab" href="#timeline">Timeline</a>' : ''}
      ${data.drift ? '<a class="tab" href="#drift">Drift</a>' : ''}
    </nav>
    <span class="meta">${escape(stamp)}</span>
    <button class="toggle" type="button" id="tt" aria-label="Switch colour theme">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="3.4" stroke="currentColor" stroke-width="1.3"/>
        <path d="M7.5 1v1.6M7.5 12.4V14M14 7.5h-1.6M2.6 7.5H1M12.1 2.9l-1.1 1.1M4 11l-1.1 1.1M12.1 12.1L11 11M4 4L2.9 2.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</header>

<main>

<!-- ══ MAP ══════════════════════════════════════════════════════════════ -->
<section class="view" id="map" aria-label="Overview">
  <div class="wrap">

    <div class="col">
      <p class="eyebrow">${escape(data.framework)} · ${escape(data.projectName)}</p>
      <h1 class="h1" style="margin-top:var(--s4)">Here is what your application can actually do.</h1>

      <div class="readout">
        <span class="readout__value">${behaviours.length}</span>
        <span class="readout__scale" aria-hidden="true">${'<i></i>'.repeat(ticks)}</span>
        <p class="readout__caption">${plural(behaviours.length, 'way in', 'ways in')} — pages
        people can open, endpoints anything can call, and actions your forms trigger.</p>
      </div>
    </div>

    <div class="stats">
      <div class="stat${gapCount > 0 ? ' stat--alert' : ' stat--ok'}">
        <div class="stat__label">Worth checking</div>
        <div class="stat__value">${gapCount}</div>
      </div>
      <div class="stat">
        <div class="stat__label">Config-dependent</div>
        <div class="stat__value">${configCount}</div>
      </div>
      <div class="stat">
        <div class="stat__label">Import hops read</div>
        <div class="stat__value">${data.traceDepth}</div>
      </div>
      <div class="stat">
        <div class="stat__label">Scan time</div>
        <div class="stat__value">${data.elapsedMs < 1000 ? `${data.elapsedMs}ms` : `${(data.elapsedMs / 1000).toFixed(1)}s`}</div>
      </div>
    </div>

    <div class="caveat caveat--accent">
      <span class="caveat__label">Read this first</span>
      This was read from your code <strong>without running it</strong>. A path chosen at
      runtime is invisible to it, so the absence of a finding is not proof that
      nothing is there.
    </div>

    <!-- what it can do -->
    <section class="section">
      <div class="section__head">
        <h2 class="h2">What it can do</h2>
        <span class="section__index">by ways in</span>
      </div>
      ${capabilityBars(behaviours)}
      <div class="caveat">
        <span class="caveat__label">Why these three come first</span>
        Deleting data, moving money and changing who has access are the ones that
        cost real money or real trust when they go wrong. They sort above
        everything else on every screen. A filled mark means consequential — it
        does not mean broken.
      </div>
    </section>

    <!-- what it depends on -->
    ${
      graph.length > 0
        ? `<section class="section">
            <div class="section__head">
              <h2 class="h2">What it depends on</h2>
              <span class="section__index">${
                graph.length > topResources.length
                  ? `${topResources.length} of ${graph.length}`
                  : `${graph.length} ${plural(graph.length, 'thing', 'things')}`
              } · widest reach first</span>
            </div>
            <p class="lead" style="margin-top:var(--s4)">Every table and outside service
            this application touches, and how much of it would notice if one changed.</p>
            <p style="margin-top:var(--s4)"><a href="#space">See them as a map →</a>
            ${graph.length > 2 ? ' &nbsp;·&nbsp; <a href="#stars">or in depth →</a>' : ''}</p>
            ${resourceList(graph, topResources)}
            <div class="caveat">
              <span class="caveat__label">This is the question behind "I'm afraid to touch it"</span>
              Open any of these to see exactly what breaks if you rename it, change
              its shape, or lose it. The list is complete for names written literally
              in the code — anything reached through a name chosen at runtime is
              marked, because we cannot follow it.
              ${
                graph.length > topResources.length
                  ? `<br><br><strong>${graph.length - topResources.length} more</strong> are reached by
                     fewer behaviours and are not listed here.`
                  : ''
              }
            </div>
          </section>`
        : ''
    }

    <!-- findings -->
    <section class="section">
      <div class="section__head">
        <h2 class="h2">${gapCount > 0 ? `${gapCount} ${plural(gapCount, 'thing', 'things')} worth checking` : 'Nothing looked wrong'}</h2>
        ${gapCount > 0 ? '<span class="section__index">most serious first</span>' : ''}
      </div>
      ${findings(behaviours, linkable)}
      <div class="caveat">
        <span class="caveat__label">Middleware</span>
        ${escape(middlewareNote)}
      </div>
    </section>

    <!-- everything, grouped -->
    <section class="section">
      <div class="section__head">
        <h2 class="h2">Every way in</h2>
        <span class="section__index">${groups.length} ${plural(groups.length, 'group', 'groups')} · ranked by consequence</span>
      </div>
      <p class="lead" style="margin-top:var(--s4)">Grouped, and ranked by what a
      behaviour can do rather than by how big it is — a twelve-line delete endpoint
      outranks a four-hundred-line settings page.</p>
      ${groupList(groups, linkable)}
      ${
        silent > 0
          ? `<div class="caveat">
              <span class="caveat__label">${silent} with nothing found</span>
              We found no effects in ${silent} of these. Some genuinely do nothing — a
              static page is just a page. The rest do their work further than
              ${data.traceDepth} import hops away, or through code we cannot follow.
              Nothing found is not the same as nothing there.
            </div>`
          : ''
      }
    </section>

  </div>
</section>

<!-- ══ WALKTHROUGHS ═════════════════════════════════════════════════════ -->
${ranked
  .filter((b) => linkable.has(b.id))
  .map((b) => walkthrough(b, reader, graph, linkableResources))
  .join('')}

<!-- ══ IMPACT ═══════════════════════════════════════════════════════════ -->
${topResources.map((node) => impactView(node, linkable, graph, linkableResources)).join('')}

<!-- ══ CONSTELLATION ════════════════════════════════════════════════════ -->
${spaceView(graph)}

<!-- ══ STAR CHART ═══════════════════════════════════════════════════════ -->
${starView(graph)}

<!-- ══ TIMELINE ═════════════════════════════════════════════════════════ -->
${data.timeline ? timelineView(data.timeline) : ''}

<!-- ══ DRIFT ════════════════════════════════════════════════════════════ -->
${data.drift ? driftView(data.drift) : ''}

</main>

<footer class="foot">
  <div class="wrap">
    <p><strong>Everything here was read locally.</strong> Your code was never uploaded, and
    this file makes no network requests of any kind. Disconnect and it still works.</p>
    ${
      data.includeCode
        ? '<p>Walkthroughs include short excerpts of your source so each step can be read in context. That makes this file <strong>shareable but not public</strong> — run with <code>--no-code</code> if you intend to send it to someone.</p>'
        : '<p>Source excerpts were omitted (<code>--no-code</code>).</p>'
    }
    <p>${
      data.skipped.length > 0
        ? `${data.skipped.length} ${plural(data.skipped.length, 'file was', 'files were')} unreadable to us — a limitation on our side, not a problem with your code.`
        : 'Every file we found was readable.'
    }</p>
    <p class="foot__path">${escape(data.root)}</p>
  </div>
</footer>

<script>
/* The only script in this document. Everything else is CSS. */
(function(){
  var r=document.documentElement,b=document.getElementById('tt');
  try{var t=localStorage.getItem('wid-theme');if(t)r.setAttribute('data-theme',t)}catch(e){}
  b.addEventListener('click',function(){
    var dark=(r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))==='dark';
    var next=dark?'light':'dark';
    r.setAttribute('data-theme',next);
    try{localStorage.setItem('wid-theme',next)}catch(e){}
  });
  /* Keep the tab highlight honest as the hash changes. */
  function sync(){
    var h=location.hash||'#map';
    document.querySelectorAll('.tab').forEach(function(t){
      if(t.getAttribute('href')===h)t.setAttribute('aria-current','page');
      else t.removeAttribute('aria-current');
    });
    if(h.indexOf('#wt-')===0){
      var m=document.querySelector('.tab[href="#map"]');
      if(m)m.setAttribute('aria-current','page');
    }
  }
  addEventListener('hashchange',sync);sync();

  /* ── constellation: isolation + pan/zoom ──────────────────────────────
     Progressive enhancement only. Without this the map still draws, every
     node is still a keyboard-reachable link to its impact view, and CSS
     alone still dims the others on hover. */
  var cst=document.getElementById('cst');
  if(!cst) return;
  var svg=cst.querySelector('.cst__svg');
  var readout=document.getElementById('cst-readout');
  var nodes=[].slice.call(cst.querySelectorAll('.cst__node'));
  var edges=[].slice.call(cst.querySelectorAll('.cst__edge'));
  var byKey={}; nodes.forEach(function(n){byKey[n.dataset.key]=n;});

  function light(node){
    var key=node.dataset.key;
    var near=(node.dataset.near||'').split(' ').filter(Boolean);
    cst.classList.add('is-isolating');
    node.classList.add('is-lit');
    near.forEach(function(k){ if(byKey[k]) byKey[k].classList.add('is-lit'); });
    edges.forEach(function(e){
      if(e.dataset.a===key||e.dataset.b===key) e.classList.add('is-lit');
    });
    if(readout){
      readout.innerHTML='<b></b><span></span>';
      readout.querySelector('b').textContent=node.dataset.name||'';
      readout.querySelector('span').textContent=node.dataset.note||'';
      readout.classList.add('is-on');
    }
  }
  function clear(){
    cst.classList.remove('is-isolating');
    nodes.forEach(function(n){n.classList.remove('is-lit');});
    edges.forEach(function(e){e.classList.remove('is-lit');});
    if(readout) readout.classList.remove('is-on');
  }
  nodes.forEach(function(n){
    n.addEventListener('mouseenter',function(){light(n);});
    n.addEventListener('focus',function(){light(n);});
    n.addEventListener('mouseleave',clear);
    n.addEventListener('blur',clear);
  });

  /* pan + zoom by moving the viewBox, so it stays crisp at any scale */
  var base=svg.getAttribute('viewBox').split(' ').map(Number);
  var view=base.slice();
  function apply(){ svg.setAttribute('viewBox',view.join(' ')); }
  function zoom2d(factor,cx,cy){
    if(!isFinite(cx)||!isFinite(cy)) return;
    var nw=Math.min(base[2]*3,Math.max(base[2]*0.15,view[2]*factor));
    var nh=nw*(base[3]/base[2]);
    var nx=cx-(cx-view[0])*(nw/view[2]);
    var ny=cy-(cy-view[1])*(nh/view[3]);
    if(!isFinite(nx)||!isFinite(ny)||!isFinite(nw)||!isFinite(nh)) return;
    view[0]=nx; view[1]=ny; view[2]=nw; view[3]=nh; apply();
  }
  /* A zero-sized element divides by zero and puts NaN in the viewBox, which is
     unrecoverable: the chart blanks and never comes back. That happens whenever
     the element is not laid out — hidden, collapsed, printing. Returning null
     and bailing is two lines and removes the whole class of failure. */
  function toSvg(ev){
    var r=svg.getBoundingClientRect();
    if(!r.width||!r.height) return null;
    return [view[0]+((ev.clientX-r.left)/r.width)*view[2],
            view[1]+((ev.clientY-r.top)/r.height)*view[3]];
  }
  svg.addEventListener('wheel',function(ev){
    ev.preventDefault(); var p=toSvg(ev);
    if(!p) return;
    zoom2d(ev.deltaY>0?1.12:0.89,p[0],p[1]);
  },{passive:false});

  var dragging=false,last=null;
  svg.addEventListener('pointerdown',function(ev){
    if(ev.target.closest('.cst__node')) return;   /* let clicks through to links */
    dragging=true; last=[ev.clientX,ev.clientY];
    svg.classList.add('is-panning');
    /* Capture can throw if the pointer has already been released. It is a
       convenience, not a requirement — dragging still works without it — so it
       must never abort the rest of this handler. */
    try{ svg.setPointerCapture(ev.pointerId); }catch(e){}
  });
  svg.addEventListener('pointermove',function(ev){
    if(!dragging) return;
    var r=svg.getBoundingClientRect();
    if(!r.width||!r.height) return;
    view[0]-=((ev.clientX-last[0])/r.width)*view[2];
    view[1]-=((ev.clientY-last[1])/r.height)*view[3];
    last=[ev.clientX,ev.clientY]; apply();
  });
  function endPan(){ dragging=false; svg.classList.remove('is-panning'); }
  svg.addEventListener('pointerup',endPan);
  svg.addEventListener('pointercancel',endPan);

  cst.querySelectorAll('[data-zoom]').forEach(function(b){
    b.addEventListener('click',function(){
      var mode=b.dataset.zoom;
      if(mode==='reset'){ view=base.slice(); apply(); return; }
      zoom2d(mode==='in'?0.8:1.25,view[0]+view[2]/2,view[1]+view[3]/2);
    });
  });

  /* ── star chart: rotation ─────────────────────────────────────────────
     The projection below is the same maths as project() in layout.ts, which
     produced the static SVG. It is written twice because this script cannot
     import from the build. A mismatch is self-detecting: the nodes would jump
     the instant you started dragging. */
  var sc=document.getElementById('sc');
  if(!sc) return;
  var scSvg=sc.querySelector('.sc__svg');
  var scRead=document.getElementById('sc-readout');
  var scNodes=[].slice.call(sc.querySelectorAll('.sc__node'));
  var scEdges=[].slice.call(sc.querySelectorAll('.sc__edge'));
  var nodeGroup=sc.querySelector('.sc__nodes');

  var dist=parseFloat(scSvg.dataset.distance);
  var yaw0=parseFloat(scSvg.dataset.yaw), pitch0=parseFloat(scSvg.dataset.pitch);
  var fit=parseFloat(scSvg.dataset.fit)||1;
  /* Zoom SCALES the projection rather than moving the camera. Dollying in
     changes how strong the perspective is as you go, and far enough in it puts
     the camera inside the model and everything inverts. Scaling cannot do
     either — the shape you are looking at stays the shape you were looking at. */
  var zoom=1;
  var ZOOM_MIN=0.4, ZOOM_MAX=6;
  var yaw=yaw0, pitch=pitch0, CENTRE=500;

  var pts=scNodes.map(function(n){
    return { el:n, key:n.dataset.key,
      x:parseFloat(n.dataset.x), y:parseFloat(n.dataset.y), z:parseFloat(n.dataset.z),
      r:parseFloat(n.dataset.r),
      hit:n.querySelector('.sc__hit'), dot:n.querySelector('.sc__dot'),
      label:n.querySelector('.sc__label') };
  });
  var scByKey={}; pts.forEach(function(p){scByKey[p.key]=p;});

  function project(p){
    var cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    var x1=p.x*cy - p.z*sy;
    var z1=p.x*sy + p.z*cy;
    var y1=p.y*cp - z1*sp;
    var z2=p.y*sp + z1*cp;
    var scale=dist/(dist+z2);
    var k=scale*fit*zoom;
    return { x:CENTRE + x1*k, y:CENTRE + y1*k, scale:scale, depth:z2 };
  }

  function draw(){
    pts.forEach(function(p){
      var q=project(p); p.proj=q;
      var r=p.r*q.scale*fit*zoom;
      var op=Math.max(0.32,Math.min(1,q.scale*0.95));
      p.dot.setAttribute('cx',q.x.toFixed(1)); p.dot.setAttribute('cy',q.y.toFixed(1));
      p.dot.setAttribute('r',r.toFixed(1)); p.dot.setAttribute('opacity',op.toFixed(2));
      p.hit.setAttribute('cx',q.x.toFixed(1)); p.hit.setAttribute('cy',q.y.toFixed(1));
      p.hit.setAttribute('r',Math.max(r+6,13).toFixed(1));
      if(p.label){
        p.label.setAttribute('x',q.x.toFixed(1));
        p.label.setAttribute('y',(q.y+r+13).toFixed(1));
        p.label.setAttribute('opacity',op.toFixed(2));
      }
    });
    scEdges.forEach(function(e){
      var a=scByKey[e.dataset.a],b=scByKey[e.dataset.b];
      if(!a||!b) return;
      e.setAttribute('x1',a.proj.x.toFixed(1)); e.setAttribute('y1',a.proj.y.toFixed(1));
      e.setAttribute('x2',b.proj.x.toFixed(1)); e.setAttribute('y2',b.proj.y.toFixed(1));
    });
    /* painter's algorithm — farthest first so near nodes overlap far ones */
    pts.slice().sort(function(a,b){return b.proj.depth-a.proj.depth;})
       .forEach(function(p){ nodeGroup.appendChild(p.el); });
  }

  var queued=false;
  function schedule(){ if(queued) return; queued=true;
    requestAnimationFrame(function(){ queued=false; draw(); }); }

  var turning=false, from=null;
  scSvg.addEventListener('pointerdown',function(ev){
    if(ev.target.closest('.sc__node')) return;
    turning=true; from=[ev.clientX,ev.clientY]; drift=false;
    sc.classList.add('is-touched');
    scSvg.classList.add('is-turning');
    try{ scSvg.setPointerCapture(ev.pointerId); }catch(e){}
  });
  scSvg.addEventListener('pointermove',function(ev){
    if(!turning) return;
    yaw += (ev.clientX-from[0])*0.008;
    pitch = Math.max(-1.2,Math.min(1.2, pitch + (ev.clientY-from[1])*0.006));
    from=[ev.clientX,ev.clientY]; schedule();
  });
  function endTurn(){ turning=false; scSvg.classList.remove('is-turning'); }
  scSvg.addEventListener('pointerup',endTurn);
  scSvg.addEventListener('pointercancel',endTurn);

  /* A slow drift, because a star chart that never moves looks like a picture of
     one. Off entirely when the visitor has asked for reduced motion — this is
     ornament, and ornament is the first thing that should go. */
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var drift = !reduced;
  (function loop(){
    if(drift && !turning && !sc.matches(':hover')){ yaw += 0.0016; schedule(); }
    requestAnimationFrame(loop);
  })();

  function setZoom(next){
    if(!isFinite(next)) return;
    zoom=Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,next));
    sc.classList.add('is-touched'); schedule();
  }
  scSvg.addEventListener('wheel',function(ev){
    ev.preventDefault(); setZoom(zoom*(ev.deltaY>0?0.9:1.11));
  },{passive:false});

  sc.querySelectorAll('[data-turn]').forEach(function(b){
    b.addEventListener('click',function(){
      var mode=b.dataset.turn;
      if(mode==='reset'){ yaw=yaw0; pitch=pitch0; zoom=1; schedule(); return; }
      if(mode==='in'){ setZoom(zoom*1.3); return; }
      if(mode==='out'){ setZoom(zoom/1.3); return; }
      drift=!drift; sc.classList.add('is-touched');
    });
  });

  /* Pinch. Without it the charts are unusable full screen on a tablet, which is
     the one place a full-screen chart is most worth having. */
  function pinch(el, onScale){
    var points=new Map(), start=0;
    var spread=function(){
      var p=[...points.values()];
      return Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
    };
    el.addEventListener('pointerdown',function(ev){
      points.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      if(points.size===2) start=spread();
    });
    el.addEventListener('pointermove',function(ev){
      if(!points.has(ev.pointerId)) return;
      points.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      if(points.size!==2||!start) return;
      ev.preventDefault();
      var now=spread();
      if(now>0){ onScale(now/start); start=now; }
    });
    var drop=function(ev){ points.delete(ev.pointerId); start=0; };
    el.addEventListener('pointerup',drop);
    el.addEventListener('pointercancel',drop);
  }
  pinch(scSvg,function(factor){ setZoom(zoom*factor); });
  pinch(svg,function(factor){
    zoom2d(factor>1?0.92:1.08, view[0]+view[2]/2, view[1]+view[3]/2);
  });

  /* ── full screen ──────────────────────────────────────────────────────
     The charts are the one part of this document that wants the whole screen.
     Everything else is prose and belongs at a measured width. */
  document.querySelectorAll('[data-full]').forEach(function(b){
    var target=document.getElementById(b.dataset.full);
    if(!target||!target.requestFullscreen){ b.style.display='none'; return; }
    b.addEventListener('click',function(){
      if(document.fullscreenElement===target) document.exitFullscreen();
      else target.requestFullscreen().catch(function(){ b.style.display='none'; });
    });
  });
  document.addEventListener('fullscreenchange',function(){
    document.querySelectorAll('[data-full]').forEach(function(b){
      var on=document.fullscreenElement===document.getElementById(b.dataset.full);
      b.textContent=on?'Exit full screen':'Full screen';
      b.setAttribute('aria-label',on?'Exit full screen':'View full screen');
    });
  });

  function scLight(node){
    var key=node.dataset.key;
    sc.classList.add('is-isolating'); node.classList.add('is-lit');
    scEdges.forEach(function(e){
      if(e.dataset.a===key||e.dataset.b===key){
        e.classList.add('is-lit');
        var other=e.dataset.a===key?e.dataset.b:e.dataset.a;
        if(scByKey[other]) scByKey[other].el.classList.add('is-lit');
      }
    });
    if(scRead){
      scRead.innerHTML='<b></b><span></span>';
      scRead.querySelector('b').textContent=node.dataset.name||'';
      scRead.querySelector('span').textContent=node.dataset.note||'';
      scRead.classList.add('is-on');
    }
  }
  function scClear(){
    sc.classList.remove('is-isolating');
    scNodes.forEach(function(n){n.classList.remove('is-lit');});
    scEdges.forEach(function(e){e.classList.remove('is-lit');});
    if(scRead) scRead.classList.remove('is-on');
  }
  scNodes.forEach(function(n){
    n.addEventListener('mouseenter',function(){scLight(n);});
    n.addEventListener('focus',function(){scLight(n);});
    n.addEventListener('mouseleave',scClear);
    n.addEventListener('blur',scClear);
  });
})();
</script>
</body>
</html>`;
}
