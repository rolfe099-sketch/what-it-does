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
  line-height:var(--lh-snug);letter-spacing:var(--track-tight);text-wrap:balance}
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

/* ── reading progress, drawn along the header's bottom rule ──────────────
   Scroll-driven, so it costs nothing and cannot drift. Browsers without
   scroll timelines simply keep the plain hairline. */
@supports (animation-timeline: scroll()){
  .top::after{content:"";position:absolute;left:0;bottom:-1px;height:2px;width:100%;
    background:var(--accent);transform-origin:0 50%;transform:scaleX(0);
    animation:progress linear both;animation-timeline:scroll(root)}
}
@keyframes progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}

/* ── the readout ────────────────────────────────────────────────────────
   The big number is the artwork. Mono, tabular, with a scale rule beneath
   it so it reads as an instrument value rather than marketing typography. */
.readout{margin-top:var(--s6);display:flex;flex-direction:column;gap:var(--s3)}
/* At width the caption sits beside the number, hung from its baseline, and
   the tick scale underlines both — one instrument, not a stack of parts. */
@media (min-width:48rem){
  .readout{display:grid;grid-template-columns:auto 1fr;align-items:end;
    column-gap:var(--s6);grid-template-areas:"value caption" "scale scale"}
  .readout__value{grid-area:value}
  .readout__caption{grid-area:caption;padding-bottom:var(--s2)}
  .readout__scale{grid-area:scale}
}
.readout__value{font-family:var(--font-data);font-size:var(--t-readout);font-weight:500;
  line-height:.9;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
.readout__scale{display:flex;align-items:flex-end;gap:4px;height:12px;
  transform-origin:50% 100%;animation:sweep var(--t-draw) var(--ease)}
@keyframes sweep{from{transform:scaleY(0)}}
.readout__scale i{display:block;width:1px;height:5px;background:var(--rule-strong)}
.readout__scale i:nth-child(5n+1){height:11px;background:var(--accent)}
.readout__caption{font-size:var(--t-meta);color:var(--ink-muted);max-width:40ch}

/* ── stat strip ───────────────────────────────────────────────────────
   Gauge cards. Each cell carries a hairline gauge edge along its top; the
   edge takes the signal colour when the value does, so the strip reads at a
   glance like a row of instruments — and the colour is never alone, because
   the value beneath it is the same colour and the label says what it is. */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));
  gap:var(--hair);background:var(--rule);border:var(--hair) solid var(--rule);
  border-radius:var(--radius);overflow:hidden;margin-top:var(--s6)}
.stat{background:var(--surface);padding:var(--s4);
  border-top:2px solid var(--rule-strong)}
.stat__label{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint)}
.stat__value{font-family:var(--font-data);font-size:var(--t-h2);font-weight:500;
  font-variant-numeric:tabular-nums;line-height:1.2;margin-top:var(--s1)}
.stat--alert{border-top-color:var(--alert)}
.stat--ok{border-top-color:var(--ok)}
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
/* Spec-sheet numbering. Generated with empty alternative text so screen
   readers hear the heading, not the furniture. Counters restart per view. */
.view{counter-reset:sec}
#map{counter-reset:sec}
.section__head::before{counter-increment:sec;
  content:counter(sec,decimal-leading-zero) / "";
  font-family:var(--font-data);font-size:var(--t-micro);color:var(--accent);
  letter-spacing:var(--track-wide);align-self:center;
  border:var(--hair) solid var(--rule-strong);border-radius:var(--radius);
  padding:.2em .5em}
.section__index{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint)}

/* ── the primer ──────────────────────────────────────────────────────────
   A legend for people who build with AI and do not read code. It teaches the
   report's vocabulary once, in plain words, then stays out of the way —
   closed by default, keyboard-native, printable. */
.primer{margin-top:var(--s4);border:var(--hair) solid var(--rule);
  border-radius:var(--radius);background:var(--surface);max-width:var(--col-main)}
.primer>summary{display:flex;align-items:center;gap:var(--s3);cursor:pointer;
  padding:var(--s4);list-style:none;font-family:var(--font-data);
  font-size:var(--t-small);letter-spacing:.04em;color:var(--ink-muted)}
.primer>summary::-webkit-details-marker{display:none}
.primer>summary:hover{color:var(--accent)}
.primer__chev{flex:none;transition:transform var(--t-fast) var(--ease)}
.primer[open] .primer__chev{transform:rotate(90deg)}
.primer__list{display:grid;grid-template-columns:1fr;gap:var(--s4);
  padding:0 var(--s4) var(--s5);margin:0}
@media (min-width:48rem){.primer__list{grid-template-columns:1fr 1fr}}
.primer__list>div{border-top:var(--hair) solid var(--rule);padding-top:var(--s3)}
.primer__list dt{font-family:var(--font-data);font-size:var(--t-tiny);font-weight:500;
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink)}
.primer__list dd{margin:var(--s1) 0 0;font-size:var(--t-meta);color:var(--ink-muted)}

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

/* ── the fix prompt ──────────────────────────────────────────────────────
   The reader of this report builds with an AI assistant. A finding they
   cannot act on is a worry; a finding with a prompt attached is a task. The
   dashed rule marks it as something to TAKE, like a coupon — and the copy
   button is injected by script, so without JavaScript this is simply text
   that can be selected, which still works. */
.prompt{margin-top:var(--s4);border:var(--hair) dashed var(--rule-strong);
  border-radius:var(--radius);background:var(--sunk);overflow:hidden}
.prompt__head{display:flex;align-items:center;justify-content:space-between;gap:var(--s4);
  padding:var(--s2) var(--s3);border-bottom:var(--hair) dashed var(--rule-strong);
  font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-muted)}
.prompt__copy{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;cursor:pointer;
  background:var(--surface);color:var(--ink-muted);
  border:var(--hair) solid var(--rule-strong);border-radius:var(--radius);
  padding:.3em .7em}
.prompt__copy:hover{color:var(--accent);border-color:var(--accent)}
.prompt__copy.is-done{color:var(--ok);border-color:var(--ok)}
.prompt__text{margin:0;padding:var(--s3) var(--s4);overflow-x:auto;
  font-family:var(--font-data);font-size:var(--t-small);line-height:1.65;
  color:var(--ink-muted);white-space:pre-wrap}

.badge{font-family:var(--font-data);font-size:var(--t-micro);letter-spacing:var(--track-wide);
  text-transform:uppercase;padding:.2em .5em;border-radius:3px;
  border:var(--hair) solid var(--rule-strong);color:var(--ink-muted);white-space:nowrap}
.badge--likely{border-color:var(--alert);color:var(--alert);background:var(--alert-wash)}
.badge--possible{border-color:var(--rule-strong)}

.clear{display:flex;gap:var(--s5);align-items:center;background:var(--surface);
  border:var(--hair) solid var(--rule);border-left:3px solid var(--ok);
  border-radius:0 var(--radius) var(--radius) 0;padding:var(--s6) var(--s5);
  max-width:var(--col-main);margin-top:var(--s5);font-size:var(--t-lead);
  line-height:var(--lh-snug)}
.clear__mark{color:var(--ok);flex:none;width:3rem;height:3rem;border-radius:50%;
  background:var(--ok-wash);display:grid;place-items:center}
.clear strong{font-weight:600}

/* ── behaviour groups ────────────────────────────────────────────────
   <details> so grouping is keyboard-native and survives JS being off. */
.groups{margin-top:var(--s6);border-top:var(--hair) solid var(--rule)}
.group{border-bottom:var(--hair) solid var(--rule)}
.group>summary{display:flex;align-items:center;gap:var(--s4);cursor:pointer;
  padding-block:var(--s4);list-style:none}
.group>summary::-webkit-details-marker{display:none}
.group>summary:hover{background:var(--surface)}
/* 801 rows is a scroll problem before it is a reading problem. Above the
   width where two cards fit, the open drawer lays them side by side — the
   rows are self-contained cards, so nothing about reading order is lost and
   the page gets half as long. */
@media (min-width:60rem){
  .group__body{display:grid;grid-template-columns:1fr 1fr;
    gap:var(--s1) var(--s4);align-items:start}
}
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

/* ── views: pure :target switching ────────────────────────────────────
   The map is the default: shown unless some OTHER view is targeted.

   The :not(:target) on the hiding rule is load-bearing, and the bug it fixes
   shipped. Without it the rule reads body:has(.view:target) #map, whose
   specificity is (1,2,1) — :has() contributes its most specific argument —
   which beats #map:target at (1,1,0). So clicking the Map tab set the hash
   to #map, the hiding rule won, and the reader got a blank document with
   every view switched off.

   Written this way the rule cannot apply when the map is the target, because
   the selector no longer matches it. That is a structural fix rather than a
   bigger number in a specificity race, which is what the first version was. */
.view{display:none}
.view:target{display:block}
#map{display:block}
body:has(.view:target) #map:not(:target){display:none}

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
/* A guard is a decision, and decisions are diamonds — the one piece of
   flowchart vocabulary everyone already reads. The number counter-rotates so
   only the frame turns. */
.step--guard .step__node{border-radius:var(--radius);transform:rotate(45deg)}
.step--guard .step__node i{font-style:normal;display:block;transform:rotate(-45deg)}
.step__node i{font-style:normal}
/* The response is the terminus: the one filled node, where the line ends. */
.step--end .step__node{background:var(--ink);border-color:var(--ink);color:var(--canvas)}
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

/* ── resources: what the app depends on ─────────────────────────────────
   Each row carries a blast-radius bar. The bar is comparative, not decorative:
   the table half your application reaches is the one you need to see before
   you touch it. */
.res{display:block;text-decoration:none;color:inherit;padding:var(--s4);
  border-bottom:var(--hair) solid var(--rule);
  transition:background var(--t-fast) var(--ease)}
.res:first-child{border-top:var(--hair) solid var(--rule)}
.res:hover{background:var(--surface)}
.res__top{display:flex;align-items:baseline;gap:var(--s3);justify-content:space-between}
.res__name{font-family:var(--font-data);font-size:var(--t-body);font-weight:500;color:var(--ink)}
.res:hover .res__name{color:var(--accent)}
.res__kind{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint);flex:none}
.res__bar{height:6px;background:var(--sunk);border-radius:2px;margin-top:var(--s3);overflow:hidden}
.res__fill{height:100%;background:var(--accent);border-radius:0 2px 2px 0;
  transform-origin:left center;animation:draw var(--t-draw) var(--ease)}
.res__meta{display:flex;gap:var(--s4);margin-top:var(--s2);font-family:var(--font-data);
  font-size:var(--t-small);color:var(--ink-muted);flex-wrap:wrap}
.res__meta b{font-weight:500;color:var(--ink)}
.res__uncertain{color:var(--ink-faint)}

/* ── impact: what breaks if you change it ───────────────────────────── */
.impact{margin-top:var(--s6);max-width:var(--col-main)}
.impact__list{display:flex;flex-direction:column;gap:var(--s3)}
.consequence{display:flex;gap:var(--s3);align-items:flex-start;
  background:var(--surface);border:var(--hair) solid var(--rule);
  border-left:3px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0;
  padding:var(--s4);font-size:var(--t-meta)}
.consequence:first-child{font-size:var(--t-lead);line-height:var(--lh-snug)}
.consequence--severe{border-left-color:var(--alert)}
.consequence--unsure{border-left-color:var(--rule-strong);color:var(--ink-muted)}
.consequence__mark{font-family:var(--font-data);color:var(--accent);flex:none}
.consequence--severe .consequence__mark{color:var(--alert)}
.consequence--unsure .consequence__mark{color:var(--ink-faint)}

.touches{margin-top:var(--s5)}
.touch{padding:var(--s4);border-top:var(--hair) solid var(--rule);display:block;
  text-decoration:none;color:inherit}
.touch:hover{background:var(--surface)}
.touch__title{font-family:var(--font-display);font-size:var(--t-h3);font-weight:500;
  line-height:var(--lh-snug);color:var(--ink)}
.touch:hover .touch__title{color:var(--accent)}
.touch__how{margin-top:var(--s2);display:flex;flex-direction:column;gap:var(--s1);
  font-size:var(--t-meta);color:var(--ink-muted)}
.touch__how span{display:flex;gap:var(--s3);align-items:flex-start}

/* ── the constellation ──────────────────────────────────────────────────
   Every visual property carries meaning: area is blast radius, a hollow ring
   is a service you do not control, accent means something can delete from it,
   edge opacity is how many behaviours use both ends. Nothing is decorative —
   a picture where size is arbitrary teaches the eye to ignore size. */
.cst{margin-top:var(--s6);border:var(--hair) solid var(--rule);border-radius:var(--radius);
  background:var(--surface);overflow:hidden;position:relative}
.cst__stage{position:relative;background:
  radial-gradient(circle at 50% 45%, var(--sunk) 0%, var(--surface) 70%)}
.cst__svg{display:block;width:100%;height:auto;max-height:76vh;touch-action:none;cursor:grab}
.cst__svg.is-panning{cursor:grabbing}

/* The graticule is a scale reference, like the rings of a range scope. It
   pans and zooms with the map because it is part of the map. */
.cst__grid{stroke:var(--rule);fill:none}
.cst__grid-mark{stroke:var(--rule-strong)}
.cst__edge{stroke:var(--rule-strong);transition:opacity var(--t-fast) var(--ease),
  stroke var(--t-fast) var(--ease);
  /* pathLength=1 in the markup normalises every edge, so one rule draws them
     all in together when the view first opens. The resting state is a solid
     line: if the animation never runs, the map is simply already drawn. */
  stroke-dasharray:1;stroke-dashoffset:0;animation:edgedraw var(--t-slow) var(--ease)}
@keyframes edgedraw{from{stroke-dashoffset:1}}
.cst__dot{fill:var(--ink-faint);transition:fill var(--t-fast) var(--ease),
  r var(--t-base) var(--ease)}
/* The halo scales with the node, so reach glows in proportion to itself. */
.cst__glow{fill:var(--ink-faint);opacity:var(--glow);pointer-events:none;
  transition:opacity var(--t-fast) var(--ease)}
.cst__node.is-destructive .cst__glow{fill:var(--accent)}
.cst__node:hover .cst__glow{opacity:.3}
.cst__hit{fill:transparent}
.cst__node{cursor:pointer;outline:none}
.cst__node.is-destructive .cst__dot{fill:var(--accent)}
/* Hollow = someone else's service. You cannot change its shape, only stop
   calling it, and that is a different kind of dependency. */
.cst__node.is-service .cst__dot{fill:var(--canvas);stroke:var(--ink-faint);stroke-width:2}
.cst__node.is-service.is-destructive .cst__dot{stroke:var(--accent)}
/* paint-order draws the stroke behind the glyphs: a halo, so a label stays
   readable where it crosses an edge instead of dissolving into it. */
.cst__label{fill:var(--ink-muted);font-family:var(--font-data);font-size:13px;
  pointer-events:none;transition:fill var(--t-fast) var(--ease);
  paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round}

/* Isolation on hover. CSS-only so it works with scripting disabled; the script
   adds neighbour highlighting on top. */
.cst__nodes:hover .cst__node:not(:hover){opacity:.22}
.cst__node:hover .cst__dot{fill:var(--accent)}
.cst__node:hover .cst__label{fill:var(--ink)}
.cst__node:focus-visible .cst__dot{stroke:var(--focus);stroke-width:3}

/* Script-driven states. */
.cst.is-isolating .cst__node:not(.is-lit){opacity:.14}
.cst.is-isolating .cst__grid{opacity:.4}
.cst.is-isolating .cst__edge:not(.is-lit){opacity:.05 !important}
.cst.is-isolating .cst__edge.is-lit{stroke:var(--accent);opacity:.9 !important}
.cst__node.is-lit .cst__label{fill:var(--ink)}

.cst__bar{display:flex;align-items:center;gap:var(--s4);flex-wrap:wrap;
  padding:var(--s3) var(--s4);border-top:var(--hair) solid var(--rule);
  background:var(--canvas);font-family:var(--font-data);font-size:var(--t-small);
  color:var(--ink-muted)}
.cst__key{display:flex;align-items:center;gap:var(--s2)}
.cst__swatch{width:11px;height:11px;border-radius:50%;background:var(--ink-faint);flex:none}
.cst__swatch--big{background:var(--accent)}
.cst__swatch--svc{background:var(--canvas);border:2px solid var(--ink-faint)}
.cst__zoom{margin-left:auto;display:flex;gap:var(--s2)}
.cst__zoom button{font-family:var(--font-data);font-size:var(--t-small);
  width:1.9rem;height:1.9rem;display:grid;place-items:center;
  background:var(--surface);color:var(--ink-muted);cursor:pointer;
  border:var(--hair) solid var(--rule-strong);border-radius:var(--radius)}
.cst__zoom button:hover{color:var(--accent);border-color:var(--accent)}

.cst__readout{position:absolute;left:var(--s4);top:var(--s4);pointer-events:none;
  background:var(--surface);border:var(--hair) solid var(--rule-strong);
  border-radius:var(--radius);padding:var(--s3) var(--s4);max-width:22rem;
  opacity:0;transition:opacity var(--t-fast) var(--ease);box-shadow:var(--shadow)}
.cst__readout.is-on{opacity:1}
.cst__readout b{font-family:var(--font-data);font-size:var(--t-body);color:var(--ink);
  display:block}
.cst__readout span{font-size:var(--t-small);color:var(--ink-muted)}

@media (max-width:48rem){
  .cst__svg{max-height:60vh}
  .cst__label{font-size:16px}
  .cst__readout{display:none}
}

/* ── the star chart: same graph, three dimensions ───────────────────────
   Depth is earned, not decorative — a dense graph forced onto one plane pushes
   unrelated clusters into each other for want of anywhere else to go. All the
   depth cues derive from one perspective scale: size, opacity, and paint order. */
.sc{margin-top:var(--s6);border:var(--hair) solid var(--rule);border-radius:var(--radius);
  background:var(--surface);overflow:hidden;position:relative}
.sc__stage{position:relative;background:
  radial-gradient(ellipse at 50% 42%, var(--sunk) 0%, var(--surface) 72%)}
.sc__svg{display:block;width:100%;height:auto;max-height:78vh;touch-action:none;cursor:grab}
.sc__svg.is-turning{cursor:grabbing}

.sc__edge{stroke:var(--rule-strong);stroke-dasharray:1;stroke-dashoffset:0;
  animation:edgedraw var(--t-slow) var(--ease)}
.sc__dot{fill:var(--ink-faint)}
.sc__hit{fill:transparent}
.sc__node{cursor:pointer;outline:none}
.sc__node.is-destructive .sc__dot{fill:var(--accent)}
.sc__node.is-service .sc__dot{fill:var(--canvas);stroke:var(--ink-faint);stroke-width:2}
.sc__node.is-service.is-destructive .sc__dot{stroke:var(--accent)}
.sc__label{fill:var(--ink-muted);font-family:var(--font-data);font-size:12.5px;
  pointer-events:none;
  paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round}
.sc__node:hover .sc__dot,.sc__node:focus-visible .sc__dot{fill:var(--accent);opacity:1 !important}
.sc__node:hover .sc__label{fill:var(--ink);opacity:1 !important}
.sc__node:focus-visible .sc__dot{stroke:var(--focus);stroke-width:3}

.sc.is-isolating .sc__node:not(.is-lit){opacity:.12}
.sc.is-isolating .sc__edge:not(.is-lit){opacity:.04 !important}
.sc.is-isolating .sc__edge.is-lit{stroke:var(--accent);opacity:.85 !important}
.sc__node.is-lit .sc__label{fill:var(--ink);opacity:1 !important}

.sc__hint{position:absolute;right:var(--s4);bottom:var(--s4);font-family:var(--font-data);
  font-size:var(--t-micro);letter-spacing:var(--track-wide);text-transform:uppercase;
  color:var(--ink-faint);pointer-events:none;transition:opacity var(--t-base) var(--ease)}
.sc.is-touched .sc__hint{opacity:0}

/* ── simulation: a change propagating outward ───────────────────────────
   Waves hang off a spine, like the walkthrough steps, because that is what
   they are: an ordered sequence where each step follows from the one above.
   Wave one is drawn as observed fact; everything after it is visibly softer,
   because everything after it is inference. */
.sim{margin-top:var(--s6);max-width:var(--col-main)}
.sim__premise{font-family:var(--font-display);font-size:var(--t-h2);font-weight:500;
  line-height:var(--lh-snug);letter-spacing:var(--track-tight);color:var(--ink)}
.sim__total{font-family:var(--font-data);font-size:var(--t-meta);color:var(--ink-muted);
  margin-top:var(--s2)}
.sim__total b{color:var(--alert);font-weight:500}

.waves{margin-top:var(--s6);position:relative}
.waves::before{content:"";position:absolute;left:13px;top:10px;bottom:10px;width:1px;
  background:var(--rule)}
.wave{position:relative;padding-left:var(--s7);padding-bottom:var(--s6)}
.wave:last-child{padding-bottom:0}
.wave__node{position:absolute;left:0;top:0;width:27px;height:27px;border-radius:50%;
  background:var(--canvas);border:var(--hair) solid var(--rule-strong);
  display:grid;place-items:center;font-family:var(--font-data);font-size:var(--t-small);
  color:var(--ink-muted);font-variant-numeric:tabular-nums}
.wave--direct .wave__node{border-color:var(--alert);color:var(--alert);
  box-shadow:0 0 0 3px var(--alert-wash)}
.wave__top{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap}
.wave__title{font-size:var(--t-lead);font-weight:600;line-height:var(--lh-snug);color:var(--ink)}
.wave--inferred .wave__title{font-weight:500;color:var(--ink-muted)}
.wave__detail{margin-top:var(--s2);font-size:var(--t-meta);color:var(--ink-muted);
  max-width:var(--measure)}
.wave__items{margin-top:var(--s4);display:flex;flex-direction:column;gap:var(--s2)}
.wave__item{display:flex;gap:var(--s3);align-items:baseline;font-size:var(--t-meta);
  padding:var(--s2) var(--s3);background:var(--surface);
  border:var(--hair) solid var(--rule);border-radius:var(--radius);
  text-decoration:none;color:var(--ink)}
a.wave__item:hover{border-color:var(--accent);color:var(--accent)}
.wave__item--res{font-family:var(--font-data)}
.wave__mark{color:var(--ink-faint);flex:none;font-family:var(--font-data)}
.wave--direct .wave__mark{color:var(--alert)}
.wave__more{font-family:var(--font-data);font-size:var(--t-small);color:var(--ink-faint);
  padding-left:var(--s3)}

/* ── timeline: scrubbing through scans ──────────────────────────────────
   Built on radio inputs and :checked, not JavaScript. Scrubbing therefore
   works with scripting disabled, arrow keys move between scans for free, and
   the selected scan survives Back. There is no state to lose because there is
   no state — the document already holds every position. */
.tl{margin-top:var(--s6)}
.tl__inputs{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}

.tl__chart{position:relative;border:var(--hair) solid var(--rule);
  border-radius:var(--radius);background:var(--surface);padding:var(--s5) var(--s5) 0}
.tl__svg{display:block;width:100%;height:auto}
.tl__grid{stroke:var(--rule)}
.tl__line{fill:none;stroke:var(--ink-faint);stroke-width:1.5;
  stroke-linejoin:round;stroke-linecap:round}
.tl__area{fill:var(--accent);opacity:.07}
.tl__gapline{fill:none;stroke:var(--alert);stroke-width:1.5;stroke-dasharray:3 3;
  stroke-linejoin:round}

/* markers sit on the track under the chart */
.tl__track{display:flex;align-items:center;gap:2px;padding:var(--s4) 0 var(--s5)}
.tl__stop{flex:1 1 0;display:block;cursor:pointer;padding-block:var(--s3);
  position:relative;text-align:center}
.tl__pin{display:block;width:11px;height:11px;border-radius:50%;margin:0 auto;
  background:var(--canvas);border:2px solid var(--rule-strong);
  transition:background var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease),
             transform var(--t-fast) var(--ease)}
.tl__stop:hover .tl__pin{border-color:var(--accent)}
.tl__when{display:block;margin-top:var(--s2);font-family:var(--font-data);
  font-size:var(--t-micro);color:var(--ink-faint);white-space:nowrap}
/* a stop that introduced a finding is marked before you ever select it */
.tl__stop.has-gap .tl__pin{border-color:var(--alert)}

.tl__panels{margin-top:var(--s5)}
.tl__panel{display:none}

/* Selection. One rule per stop, generated with the markup. */
.tl__inputs input:focus-visible + .tl__labels .tl__stop{outline:2px solid var(--focus)}

.tl__state{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));
  gap:var(--hair);background:var(--rule);border:var(--hair) solid var(--rule);
  border-radius:var(--radius);overflow:hidden}
.tl__cell{background:var(--surface);padding:var(--s4);
  border-top:2px solid var(--rule-strong)}
.tl__cell--alert{border-top-color:var(--alert)}
.tl__cell dt{font-family:var(--font-data);font-size:var(--t-micro);
  letter-spacing:var(--track-wide);text-transform:uppercase;color:var(--ink-faint)}
.tl__cell dd{margin:0;margin-top:var(--s1);font-family:var(--font-data);
  font-size:var(--t-h2);font-weight:500;font-variant-numeric:tabular-nums;line-height:1.2}
.tl__cell--alert dd{color:var(--alert)}
.tl__delta{font-family:var(--font-data);font-size:var(--t-small);margin-left:var(--s2);
  font-weight:400}
.tl__delta--up{color:var(--accent)}
.tl__delta--down{color:var(--alert)}

.tl__when-big{font-family:var(--font-display);font-size:var(--t-h2);font-weight:500;
  letter-spacing:var(--track-tight);margin-bottom:var(--s4)}

@media (max-width:48rem){
  .tl__when{font-size:9px;transform:rotate(-45deg);transform-origin:center;
    margin-top:var(--s3)}
  .tl__track{padding-bottom:var(--s7)}
}

/* ── fullscreen ─────────────────────────────────────────────────────────
   The charts are the one thing in the report that genuinely wants the whole
   screen: a 69-node graph inside a 40rem column is legible but cramped, and
   reading a constellation is a spatial task. Everything else in the document
   is prose and belongs at a measured width. */
.cst:fullscreen,
.sc:fullscreen{
  display:flex;flex-direction:column;
  background:var(--canvas);border:0;border-radius:0;
  width:100vw;height:100vh;
}
.cst:fullscreen .cst__stage,
.sc:fullscreen .sc__stage{
  flex:1 1 auto;min-height:0;display:grid;place-items:center;
}
.cst:fullscreen .cst__svg,
.sc:fullscreen .sc__svg{
  max-height:none;width:100%;height:100%;
}
/* Labels are sized in SVG user units, so they shrink as the viewBox grows to
   fill a large screen. Nudged up so a wall-sized chart stays readable. */
.cst:fullscreen .cst__label{font-size:11px}
.sc:fullscreen .sc__label{font-size:11px}

.cst__zoom button[data-full]{width:auto;padding-inline:var(--s3)}

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
/* Attribution: set apart by a rule, not by shouting. The link keeps the
   document's default anchor styling — it does not need its own. */
.foot__made{margin-top:var(--s5)!important;padding-top:var(--s4);
  border-top:var(--hair) solid var(--rule)}

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

/* Entry reveals, scroll-driven. Gated twice: on support, because without a
   scroll timeline the animation would fire once at load for content nobody
   has scrolled to yet; and on motion preference, because the global duration
   kill switch cannot stop an animation whose clock is the scroll position. */
@supports (animation-timeline: view()){
  @media (prefers-reduced-motion:no-preference){
    .section,.finding,.clear,.change,.wave{
      animation:rise var(--t-base) var(--ease) both;
      animation-timeline:view();
      animation-range:entry 0% entry 36%}
  }
}
@keyframes rise{from{opacity:.001;transform:translateY(10px)}to{opacity:1;transform:none}}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
}

@media print{
  .top,.tabs,.toggle,.back{display:none}
  .view{display:block!important}
  body{background:#fff}
}
`;
