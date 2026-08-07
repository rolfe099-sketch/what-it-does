/**
 * The report — what someone actually looks at.
 *
 * A single self-contained HTML file: no server, no network, no sibling assets.
 * Open it from a Downloads folder, attach it to an email, drag it into Slack.
 * That portability is also the privacy position — a report that fetches nothing
 * is a report that reveals nothing.
 *
 * Two rules govern the layout, both inherited from the design direction:
 *
 *   Orientation, not enumeration. A list of 686 routes is a data dump. The job
 *   is to answer "what can this thing do, and what should worry me".
 *
 *   Caveats sit level with the claims they qualify, in the margin rail — not
 *   buried in a footnote nobody scrolls to.
 */

import {
  CONSEQUENTIAL_EFFECTS,
  EFFECT_LABELS,
  consequenceScore,
  type Behaviour,
  type EffectKind,
  type Unknown,
} from '../model.js';
import type { MiddlewareInfo } from '../extract/nextjs/middleware.js';
import { fontFaces } from './assets.js';
import { REPORT_CSS } from './styles.js';

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
}

/** How many behaviours get the full treatment. The rest are summarised. */
const DETAIL_LIMIT = 15;

const escape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** `code` spans in effect descriptions become real markup. */
const withCode = (value: string): string =>
  escape(value).replace(/`([^`]+)`/g, '<code>$1</code>');

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const KIND_LABEL: Record<string, string> = {
  page: 'Page',
  'api-route': 'Endpoint',
  'server-action': 'Form action',
  middleware: 'Every request',
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function capabilityBars(behaviours: Behaviour[]): string {
  const counts = new Map<EffectKind, number>();
  for (const behaviour of behaviours) {
    for (const kind of new Set(behaviour.effects.map((e) => e.kind))) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return '';

  const rows = [...counts.entries()].sort((a, b) => {
    const aBig = CONSEQUENTIAL_EFFECTS.has(a[0]) ? 1 : 0;
    const bBig = CONSEQUENTIAL_EFFECTS.has(b[0]) ? 1 : 0;
    if (aBig !== bBig) return bBig - aBig;
    return b[1] - a[1];
  });

  const max = Math.max(...rows.map(([, n]) => n));

  // Two tones only. The palette carries meaning — consequential or not — rather
  // than giving every category its own hue, which would be decoration.
  const bars = rows
    .map(([kind, count], i) => {
      const big = CONSEQUENTIAL_EFFECTS.has(kind);
      const colour = big ? 'var(--accent)' : 'var(--ink-faint)';
      const width = Math.max(2, Math.round((count / max) * 100));
      return `
      <li>
        <div class="bar__head">
          <span class="bar__label"><span class="dot" style="--bar:${colour}"></span>${escape(EFFECT_LABELS[kind])}</span>
          <span class="bar__count">${count}</span>
        </div>
        <div class="bar__track">
          <div class="bar__fill" style="width:${width}%;--bar:${colour};animation-delay:${i * 60}ms"></div>
        </div>
      </li>`;
    })
    .join('');

  return `<ul class="bars">${bars}</ul>`;
}

function findings(behaviours: Behaviour[]): string {
  const withGaps = behaviours.filter((b) => b.gaps.length > 0);
  const total = withGaps.reduce((n, b) => n + b.gaps.length, 0);

  if (total === 0) {
    return `
      <div class="all-clear">
        <span class="all-clear__mark" aria-hidden="true">✓</span>
        <div>
          <strong>Nothing looked wrong.</strong>
          Every behaviour that deletes data or moves money also establishes who is
          asking. That is the correct result for a well-built application — but it
          is a statement about what we could see, not a guarantee.
        </div>
      </div>`;
  }

  const cards = withGaps
    .flatMap((behaviour) =>
      behaviour.gaps.map(
        (gap) => `
      <div class="finding finding--${gap.confidence}">
        <p class="finding__title">${escape(behaviour.title)}
          <span class="badge badge--${gap.confidence}">${gap.confidence}</span>
        </p>
        <p class="finding__summary">${withCode(gap.summary)}</p>
        <p class="finding__detail">${withCode(gap.detail)}</p>
        <p class="finding__where">${escape(gap.source.file)}:${gap.source.line}</p>
      </div>`,
      ),
    )
    .join('');

  return cards;
}

function behaviourList(behaviours: Behaviour[]): { html: string; shown: number; ranked: number } {
  const ranked = behaviours
    .map((b) => ({ b, score: consequenceScore(b) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const shown = ranked.slice(0, DETAIL_LIMIT);

  const html = shown
    .map(({ b }) => {
      const effects = [...b.effects]
        .sort((x, y) => {
          const a = CONSEQUENTIAL_EFFECTS.has(x.kind) ? 1 : 0;
          const c = CONSEQUENTIAL_EFFECTS.has(y.kind) ? 1 : 0;
          return c - a;
        })
        .map((effect) => {
          const big = CONSEQUENTIAL_EFFECTS.has(effect.kind);
          const colour = big ? 'var(--accent)' : 'var(--ink-faint)';
          const hedge =
            effect.confidence === 'likely' ? ' <span class="hedge">(probably)</span>' : '';
          return `<li class="effect${big ? '' : ' effect--minor'}">
            <span class="dot effect__dot" style="--bar:${colour}"></span>
            <span class="effect__text">${withCode(effect.description)}${hedge}</span>
          </li>`;
        })
        .join('');

      const warnings = b.unknowns
        .filter((u) => u.reason === 'config-dependent')
        .map(
          (u) =>
            `<p class="warn"><span class="warn__mark" aria-hidden="true">▲</span><span>${withCode(u.detail)}</span></p>`,
        )
        .join('');

      return `
      <li class="behaviour">
        <div class="behaviour__head">
          <h3 class="behaviour__title">${escape(b.title)}</h3>
          <span class="behaviour__kind">${escape(KIND_LABEL[b.trigger.kind] ?? '')}</span>
        </div>
        <p class="behaviour__where">${escape(b.trigger.source.file)}:${b.trigger.source.line}</p>
        <ul class="effects">${effects}</ul>
        ${warnings}
      </li>`;
    })
    .join('');

  return { html: `<ul class="behaviours">${html}</ul>`, shown: shown.length, ranked: ranked.length };
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function renderReport(data: ReportData): string {
  const { behaviours, projectName } = data;

  const list = behaviourList(behaviours);
  const silent = behaviours.length - list.ranked;
  const configCount = behaviours.reduce(
    (n, b) => n + b.unknowns.filter((u) => u.reason === 'config-dependent').length,
    0,
  );
  const gapCount = behaviours.reduce((n, b) => n + b.gaps.length, 0);
  const stamp = data.scannedAt.toISOString().slice(0, 16).replace('T', ' ');

  const middlewareNote = !data.middleware.present
    ? 'This project has no middleware, so nothing checks requests before they reach your code.'
    : data.middleware.matchers === null
      ? 'Middleware runs on every request.'
      : `Middleware runs on ${data.middleware.matchers.length} ${plural(data.middleware.matchers.length, 'path pattern', 'path patterns')}.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(projectName)} — what this application does</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#FAF8F3" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#14130F" media="(prefers-color-scheme:dark)">
<style>${fontFaces()}${REPORT_CSS}</style>
</head>
<body>

<header class="site-header">
  <div class="canvas site-header__inner">
    <span class="wordmark">
      <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true" fill="none">
        <path d="M2 2.5h13M2 6.5h13M2 14.5h13M2 17.5h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
        <path d="M7 10.5h13" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      eriksen
    </span>
    <span class="scanned">${escape(stamp)} · ${(data.elapsedMs / 1000).toFixed(1)}s</span>
    <button class="theme-toggle" type="button" id="tt" aria-label="Switch colour theme">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="3.4" stroke="currentColor" stroke-width="1.3"/>
        <path d="M7.5 1v1.6M7.5 12.4V14M14 7.5h-1.6M2.6 7.5H1M12.1 2.9l-1.1 1.1M4 11l-1.1 1.1M12.1 12.1L11 11M4 4L2.9 2.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</header>

<main>
  <div class="canvas">

    <section class="spread">
      <div>
        <p class="eyebrow">${escape(data.framework)} · ${escape(projectName)}</p>
        <h1 class="title" style="margin-top:var(--s4)">Here is what your application can actually do.</h1>
        <div class="hero-figure">
          <span class="hero-figure__value">${behaviours.length}</span>
          <p class="hero-figure__caption">ways in — pages people can open, endpoints anything can call, and actions your forms trigger.</p>
        </div>
      </div>
      <aside class="rail">
        <div class="note">
          <span class="note__label">This scan</span>
          <dl>
            <dt>Ways in</dt><dd>${behaviours.length}</dd>
            <dt>Worth checking</dt><dd>${gapCount}</dd>
            <dt>Config-dependent</dt><dd>${configCount}</dd>
            <dt>Import hops</dt><dd>${data.traceDepth}</dd>
          </dl>
        </div>
        <div class="note note--caveat">
          <span class="note__label">Read this first</span>
          This is read from your code without running it. A path decided at
          runtime is invisible to it, so absence of a finding is not proof of
          absence.
        </div>
      </aside>
    </section>

    <div class="rule" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>

    <section class="spread">
      <div>
        <h2 class="section-heading">What it can do</h2>
        <p class="lead" style="margin-top:var(--s3)">Counted by ways in, with the consequential ones first.</p>
        ${capabilityBars(behaviours)}
      </div>
      <aside class="rail">
        <div class="note">
          <span class="note__label">Why these first</span>
          Deleting data, moving money and changing who has access are the three
          that cost real money or real trust when they go wrong. They sort above
          everything else, always.
        </div>
      </aside>
    </section>

    <div class="rule" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>

    <section class="spread">
      <div>
        <h2 class="section-heading">${gapCount > 0 ? `${gapCount} ${plural(gapCount, 'thing', 'things')} worth checking` : 'Nothing looked wrong'}</h2>
        ${findings(behaviours)}
      </div>
      <aside class="rail">
        <div class="note">
          <span class="note__label">Middleware</span>
          ${escape(middlewareNote)}
        </div>
        <div class="note note--caveat">
          <span class="note__label">Every finding can be wrong</span>
          Each one says what would make it a false alarm. A guard reached through
          code we could not follow would look exactly like a missing guard.
        </div>
      </aside>
    </section>

    <div class="rule" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>

    <section class="spread">
      <div>
        <h2 class="section-heading">Worth looking at first</h2>
        <p class="lead" style="margin-top:var(--s3)">
          ${list.shown === list.ranked
            ? 'Ranked by consequence rather than by size.'
            : `The top ${list.shown} of ${list.ranked}, ranked by consequence rather than by size — a twelve-line delete endpoint outranks a four-hundred-line settings page.`}
        </p>
        ${list.html}
      </div>
      <aside class="rail">
        <div class="note">
          <span class="note__label">Reading this</span>
          A filled dot is consequential. "Probably" means we inferred it from a
          name rather than a known library call.
        </div>
        ${silent > 0
          ? `<div class="note note--caveat">
              <span class="note__label">${silent} not shown</span>
              We found no effects in ${silent} ${plural(silent, 'way in', 'ways in')}. Some genuinely do
              nothing. The rest do their work further than ${data.traceDepth} import hops away, or
              through code we cannot follow.
            </div>`
          : ''}
      </aside>
    </section>

  </div>
</main>

<footer class="site-footer">
  <div class="canvas">
    <p><strong>Everything here was read locally.</strong> Your code was never uploaded, and this file
    contains no scripts that call anywhere. It works offline, forever.</p>
    <p>${data.skipped.length > 0
      ? `${data.skipped.length} ${plural(data.skipped.length, 'file was', 'files were')} unreadable to us — a limitation on our side, not a problem with your code.`
      : 'Every file we found was readable.'}</p>
    <p style="font-family:var(--font-data);font-size:.8125rem;color:var(--ink-faint)">
      ${escape(data.root)}
    </p>
  </div>
</footer>

<script>
(function(){
  var r=document.documentElement,b=document.getElementById('tt');
  try{var t=localStorage.getItem('eriksen-theme');if(t)r.setAttribute('data-theme',t)}catch(e){}
  b.addEventListener('click',function(){
    var dark=(r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'))==='dark';
    var next=dark?'light':'dark';
    r.setAttribute('data-theme',next);
    try{localStorage.setItem('eriksen-theme',next)}catch(e){}
  });
})();
</script>
</body>
</html>`;
}
