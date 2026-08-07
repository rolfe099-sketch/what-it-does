/**
 * Report stylesheet. Values live in tokens.ts; this file only uses them.
 *
 * ── Why the caveats moved ──────────────────────────────────────────────────
 *
 * The previous layout put caveats in a parallel right-hand rail. That reads
 * well at 1440px and quietly breaks its own promise everywhere else: below the
 * breakpoint the rail collapses and every caveat drops BELOW the section it
 * qualified, sometimes a screen away.
 *
 * Here a caveat is an inset panel in normal flow, immediately beneath the claim,
 * carrying a coloured edge and a mono label. It is level with its claim at every
 * width, on every device, always. A rule that only holds on a wide desktop is
 * not a rule.
 *
 * ── Why :target and not JavaScript ─────────────────────────────────────────
 *
 * View switching is pure CSS `:target`. The back button works, links are
 * shareable, everything is keyboard reachable, and with scripting disabled the
 * document degrades to every section stacked and readable rather than to a
 * blank page. The only JavaScript in the report is the theme toggle.
 */

export const REPORT_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--canvas);color:var(--ink);
  font-family:var(--font-text);font-size:var(--t-body);line-height:var(--lh-body);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
h1,h2,h3,h4,p,ul,ol,dl,figure,blockquote{margin:0}
ul,ol{padding:0;list-style:none}
a{color:var(--accent);text-underline-offset:.18em;text-decoration-thickness:1px}
code{font-family:var(--font-data);font-size:.9em;
  background:var(--sunk);padding:.08em .32em;border-radius:3px}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:3px}
::selection{background:var(--accent-wash);color:var(--ink)}

.skip{position:absolute;left:var(--s4);top:-4rem;z-index:100;padding:var(--s3) var(--s4);
  background:var(--surface);border:var(--hair) solid var(--rule-strong);
  border-radius:var(--radius);transition:top var(--t-fast) var(--ease)}
.skip:focus{top:var(--s4)}

/* ── layout ─────────────────────────────────────────────────────────────
   One measured column. A readout, not a magazine spread. */
.wrap{width:100%;max-width:var(--spine);margin-inline:auto;padding-inline:var(--gutter)}
.col{max-width:var(--col-main)}
.prose{max-width:var(--measure)}
.stack>*+*{margin-top:var(--s5)}

/* ── type roles ─────────────────────────────────────────────────────── */
.eyebrow{font-family:var(--font-data);font-size:var(--t-tiny);font-weight:500;
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-muted)}
.h1{font-family:var(--font-display);font-size:var(--t-h1);font-weight:500;
  line-height:var(--lh-tight);letter-spacing:var(--track-tight);text-wrap:balance}
.h2{font-family:var(--font-display);font-size:var(--t-h2);font-weight:500;
  line-height:var(--lh-snug);letter-spacing:var(--track-tight)}
.h3{font-family:var(--font-display);font-size:var(--t-h3);font-weight:500;
  line-height:var(--lh-snug)}
.lead{font-size:var(--t-lead);color:var(--ink-muted);max-width:var(--measure-tight);
  text-wrap:pretty}
.meta{font-family:var(--font-data);font-size:var(--t-small);color:var(--ink-faint)}
.num{font-variant-numeric:tabular-nums}

/* ── header ─────────────────────────────────────────────────────────── */
.top{position:sticky;top:0;z-index:20;background:var(--canvas);
  border-bottom:var(--hair) solid var(--rule)}
.top__bar{display:flex;align-items:center;gap:var(--s5);
  padding-block:var(--s3);flex-wrap:wrap}
.mark{display:inline-flex;align-items:center;gap:var(--s2);
  font-family:var(--font-display);font-size:var(--t-h3);font-weight:700;
  letter-spacing:var(--track-tight);color:var(--ink);text-decoration:none}
.mark svg{flex:none}
.top__spacer{flex:1 1 auto}

/* view tabs */
.tabs{display:flex;gap:var(--s1);align-items:center}
.tab{font-family:var(--font-data);font-size:var(--t-tiny);letter-spacing:var(--track-wide);
  text-transform:uppercase;color:var(--ink-muted);text-decoration:none;
  padding:var(--s2) var(--s3);border-radius:var(--radius);
  border:var(--hair) solid transparent}
.tab:hover{color:var(--ink);background:var(--sunk)}
.tab[aria-current="page"]{color:var(--ink);border-color:var(--rule-strong);background:var(--surface)}

.toggle{display:inline-grid;place-items:center;width:2rem;height:2rem;padding:0;
  background:transparent;border:var(--hair) solid var(--rule-strong);
  border-radius:var(--radius);color:var(--ink-muted);cursor:pointer}
.toggle:hover{color:var(--accent);border-color:var(--accent)}

main{padding-block:var(--s8) var(--s10)}

/* ── the readout ────────────────────────────────────────────────────────
   The big number is the artwork. Mono, tabular, with a scale rule beneath
   it so it reads as an instrument value rather than marketing typography. */
.readout{margin-top:var(--s6);display:flex;flex-direction:column;gap:var(--s3)}
.readout__value{font-family:var(--font-data);font-size:var(--t-readout);font-weight:500;
  line-height:.9;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
.readout__scale{display:flex;align-items:flex-end;gap:4px;height:12px}
.readout__scale i{display:block;width:1px;height:5px;background:var(--rule-strong)}
.readout__scale i:nth-child(5n+1){height:11px;background:var(--accent)}
.readout__caption{font-size:var(--t-meta);color:var(--ink-muted);max-width:40ch}

/* ── stat strip ─────────────────────────────────────────────────────── */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));
  gap:var(--hair);background:var(--rule);border:var(--hair) solid var(--rule);
  border-radius:var(--radius);overflow:hidden;margin-top:var(--s6)}
.stat{background:var(--canvas);padding:var(--s4)}
.stat__label{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint)}
.stat__value{font-family:var(--font-data);font-size:var(--t-h2);font-weight:500;
  font-variant-numeric:tabular-nums;line-height:1.2;margin-top:var(--s1)}
.stat--alert .stat__value{color:var(--alert)}
.stat--ok .stat__value{color:var(--ok)}

/* ── caveat: inset, in flow, level with its claim ───────────────────── */
.caveat{border-left:3px solid var(--rule-strong);background:var(--sunk);
  padding:var(--s4) var(--s4) var(--s4) var(--s5);border-radius:0 var(--radius) var(--radius) 0;
  font-size:var(--t-meta);color:var(--ink-muted);max-width:var(--measure);
  margin-top:var(--s4)}
.caveat--alert{border-left-color:var(--alert)}
.caveat--accent{border-left-color:var(--accent)}
.caveat__label{display:block;font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint);
  margin-bottom:var(--s2)}
.caveat strong{color:var(--ink);font-weight:600}

/* ── section rhythm ─────────────────────────────────────────────────── */
.section{margin-top:var(--s9)}
.section__head{border-top:var(--hair) solid var(--rule-strong);padding-top:var(--s4);
  display:flex;align-items:baseline;justify-content:space-between;gap:var(--s4);flex-wrap:wrap}
.section__index{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint)}

/* ── capability bars ────────────────────────────────────────────────── */
.bars{margin-top:var(--s6);display:flex;flex-direction:column;gap:var(--s5);
  max-width:var(--col-main)}
.bar__head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s4)}
.bar__label{display:flex;align-items:center;gap:var(--s3);font-size:var(--t-meta);
  font-weight:500}
.bar__count{font-family:var(--font-data);font-size:var(--t-meta);
  font-variant-numeric:tabular-nums;color:var(--ink-muted)}
.bar__track{height:10px;background:var(--sunk);border-radius:2px;overflow:hidden;
  margin-top:var(--s2);position:relative}
.bar__fill{height:100%;background:var(--bar,var(--ink-faint));border-radius:0 2px 2px 0;
  transform-origin:left center;
  /* No animation-fill-mode. The resting state IS the real width, so if the
     animation never runs the data is still drawn. A chart must never require
     motion in order to be readable. */
  animation:draw var(--t-draw) var(--ease)}
@keyframes draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pip{width:8px;height:8px;border-radius:1px;background:var(--bar,var(--ink-faint));flex:none}

/* ── findings ───────────────────────────────────────────────────────── */
.findings{margin-top:var(--s6);display:flex;flex-direction:column;gap:var(--s4)}
.finding{background:var(--surface);border:var(--hair) solid var(--rule);
  border-left:3px solid var(--alert);border-radius:0 var(--radius) var(--radius) 0;
  padding:var(--s5);max-width:var(--col-main)}
.finding--possible{border-left-color:var(--rule-strong)}
.finding__top{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;
  margin-bottom:var(--s3)}
.finding__where{font-family:var(--font-data);font-size:var(--t-small);color:var(--ink-faint)}
.finding__summary{font-size:var(--t-lead);line-height:var(--lh-snug);color:var(--ink);
  margin-bottom:var(--s3)}
.finding__detail{font-size:var(--t-meta);color:var(--ink-muted);max-width:var(--measure)}
.finding__link{display:inline-block;margin-top:var(--s4);font-family:var(--font-data);
  font-size:var(--t-small);letter-spacing:.04em}

.badge{font-family:var(--font-data);font-size:var(--t-micro);letter-spacing:var(--track-wide);
  text-transform:uppercase;padding:.2em .5em;border-radius:3px;
  border:var(--hair) solid var(--rule-strong);color:var(--ink-muted);white-space:nowrap}
.badge--likely{border-color:var(--alert);color:var(--alert);background:var(--alert-wash)}
.badge--possible{border-color:var(--rule-strong)}

.clear{display:flex;gap:var(--s4);align-items:flex-start;background:var(--surface);
  border:var(--hair) solid var(--rule);border-left:3px solid var(--ok);
  border-radius:0 var(--radius) var(--radius) 0;padding:var(--s5);
  max-width:var(--col-main);margin-top:var(--s5)}
.clear__mark{color:var(--ok);flex:none;margin-top:.15em}
.clear strong{font-weight:600}

/* ── behaviour groups ────────────────────────────────────────────────
   <details> so grouping is keyboard-native and survives JS being off. */
.groups{margin-top:var(--s6);border-top:var(--hair) solid var(--rule)}
.group{border-bottom:var(--hair) solid var(--rule)}
.group>summary{display:flex;align-items:center;gap:var(--s4);cursor:pointer;
  padding-block:var(--s4);list-style:none}
.group>summary::-webkit-details-marker{display:none}
.group__chev{flex:none;color:var(--ink-faint);transition:transform var(--t-fast) var(--ease)}
.group[open] .group__chev{transform:rotate(90deg)}
.group__name{font-family:var(--font-data);font-size:var(--t-meta);font-weight:500;
  color:var(--ink)}
.group__count{font-family:var(--font-data);font-size:var(--t-small);color:var(--ink-faint);
  font-variant-numeric:tabular-nums}
.group__marks{margin-left:auto;display:flex;gap:3px;align-items:center}
.group__body{padding-bottom:var(--s4)}

/* ── behaviour row ──────────────────────────────────────────────────── */
.beh{display:block;text-decoration:none;color:inherit;padding:var(--s4);
  border:var(--hair) solid transparent;border-radius:var(--radius);
  transition:background var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease)}
.beh:hover{background:var(--surface);border-color:var(--rule)}
.beh__top{display:flex;align-items:baseline;gap:var(--s3);justify-content:space-between}
.beh__title{font-family:var(--font-display);font-size:var(--t-h3);font-weight:500;
  line-height:var(--lh-snug);color:var(--ink)}
.beh:hover .beh__title{color:var(--accent)}
.beh__kind{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint);flex:none}
.beh__where{font-family:var(--font-data);font-size:var(--t-small);color:var(--ink-faint);
  margin-top:var(--s1)}
.beh__pips{display:flex;gap:4px;margin-top:var(--s3);flex-wrap:wrap;align-items:center}
.beh__more{font-family:var(--font-data);font-size:var(--t-micro);color:var(--ink-faint)}

.fx{margin-top:var(--s3);display:flex;flex-direction:column;gap:var(--s2)}
.fx__row{display:flex;gap:var(--s3);align-items:flex-start;font-size:var(--t-meta)}
.fx__pip{margin-top:.42em}
.fx--minor{color:var(--ink-muted)}
.hedge{color:var(--ink-faint);font-size:var(--t-small)}

.flag{display:flex;gap:var(--s3);align-items:flex-start;font-size:var(--t-meta);
  color:var(--ink-muted);margin-top:var(--s3);padding:var(--s3);
  background:var(--sunk);border-radius:var(--radius);max-width:var(--measure)}
.flag__mark{color:var(--accent);flex:none;font-family:var(--font-data)}

/* ── views: pure :target switching ──────────────────────────────────── */
.view{display:none}
.view:target{display:block}
/* The map is the default: shown unless some other view is targeted. */
#map{display:block}
body:has(.view:target) #map{display:none}
#map:target{display:block}

/* With scripting or :has() unavailable, every view simply stacks and remains
   readable. Nothing is lost, only the switching. */
@supports not (selector(:has(*))){
  .view{display:block}
}

/* ── walkthrough ────────────────────────────────────────────────────── */
.back{display:inline-flex;align-items:center;gap:var(--s2);font-family:var(--font-data);
  font-size:var(--t-small);letter-spacing:.04em;text-decoration:none;color:var(--ink-muted)}
.back:hover{color:var(--accent)}

.steps{margin-top:var(--s7);position:relative;max-width:var(--col-main)}
/* the spine the steps hang from */
.steps::before{content:"";position:absolute;left:11px;top:8px;bottom:8px;width:1px;
  background:var(--rule)}
.step{position:relative;padding-left:var(--s7);padding-bottom:var(--s6)}
.step:last-child{padding-bottom:0}
.step__node{position:absolute;left:0;top:2px;width:23px;height:23px;border-radius:50%;
  background:var(--canvas);border:var(--hair) solid var(--rule-strong);
  display:grid;place-items:center;font-family:var(--font-data);font-size:var(--t-micro);
  color:var(--ink-muted);font-variant-numeric:tabular-nums}
.step--big .step__node{border-color:var(--accent);color:var(--accent);
  box-shadow:0 0 0 3px var(--accent-wash)}
.step__label{font-size:var(--t-lead);line-height:var(--lh-snug);color:var(--ink)}
.step__where{font-family:var(--font-data);font-size:var(--t-small);color:var(--ink-faint);
  margin-top:var(--s2)}
.step__tag{display:inline-block;font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint);
  margin-bottom:var(--s2)}

.code{margin-top:var(--s3);background:var(--sunk);border:var(--hair) solid var(--rule);
  border-radius:var(--radius);overflow:hidden}
.code__head{display:flex;justify-content:space-between;gap:var(--s4);
  padding:var(--s2) var(--s3);border-bottom:var(--hair) solid var(--rule);
  font-family:var(--font-data);font-size:var(--t-micro);color:var(--ink-faint)}
.code pre{margin:0;padding:var(--s3);overflow-x:auto;font-family:var(--font-data);
  font-size:var(--t-small);line-height:1.65}
 /* ink-muted, not ink-faint: on the highlighted row the line number sits on
    accent-wash rather than the code background, where faint measured 4.43:1 in
    dark mode. Muted clears 4.5 on every background it can land on. */
.code .ln{color:var(--ink-muted);user-select:none;padding-right:var(--s3)}
.code .hit{background:var(--accent-wash);display:inline-block;width:100%}

/* ── drift ──────────────────────────────────────────────────────────── */
.drift{margin-top:var(--s6);display:flex;flex-direction:column;gap:var(--s4);
  max-width:var(--col-main)}
.change{background:var(--surface);border:var(--hair) solid var(--rule);
  border-left:3px solid var(--rule-strong);border-radius:0 var(--radius) var(--radius) 0;
  padding:var(--s5)}
.change--added{border-left-color:var(--accent)}
.change--removed{border-left-color:var(--alert)}
.change--changed{border-left-color:var(--accent)}
.change__op{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;margin-bottom:var(--s2)}
.change--added .change__op{color:var(--accent)}
.change--removed .change__op{color:var(--alert)}
.change__title{font-family:var(--font-display);font-size:var(--t-h3);font-weight:500;
  line-height:var(--lh-snug)}
.change__body{margin-top:var(--s3);font-size:var(--t-meta);color:var(--ink-muted)}
.delta{display:flex;gap:var(--s3);align-items:flex-start;margin-top:var(--s2)}
.delta__sign{font-family:var(--font-data);font-weight:500;flex:none;width:1ch}
.delta--gone .delta__sign{color:var(--alert)}
.delta--new .delta__sign{color:var(--accent)}

/* ── footer ─────────────────────────────────────────────────────────── */
.foot{margin-top:var(--s10);border-top:var(--hair) solid var(--rule);
  padding-block:var(--s6) var(--s8);font-size:var(--t-meta);color:var(--ink-muted)}
.foot strong{color:var(--ink);font-weight:600}
.foot p+p{margin-top:var(--s3)}
.foot__path{font-family:var(--font-data);font-size:var(--t-small);color:var(--ink-faint);
  word-break:break-all}

/* ── responsive ─────────────────────────────────────────────────────── */
@media (max-width:48rem){
  .top__bar{gap:var(--s3)}
  .tabs{order:3;width:100%;overflow-x:auto}
  .step{padding-left:var(--s6)}
  .finding,.clear,.change{padding:var(--s4)}
}
@media (max-width:24rem){
  .readout__value{font-size:2.5rem}
}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
}

@media print{
  .top,.tabs,.toggle,.back{display:none}
  .view{display:block!important}
  body{background:#fff}
}
`;
