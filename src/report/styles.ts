/**
 * Report stylesheet.
 *
 * Same design language as the rest of the project — "The Measurement Record":
 * typography-led, warm paper and ink, one vermilion accent, generous space, and
 * a margin rail where the caveats live level with the claims they qualify.
 *
 * Every colour is a token. Contrast pairs were computed, not eyeballed:
 * light ink 16.7:1, muted 7.2:1, accent 5.6:1; dark 16.1 / 6.3 / 6.8. All clear
 * WCAG 2.2 AA and most reach AAA.
 */

export const REPORT_CSS = `
:root{
  color-scheme:light;
  --paper:#FAF8F3; --surface:#FFFFFF; --sunk:#F2EFE7;
  --ink:#1A1815; --ink-muted:#57534A; --ink-faint:#8A8478;
  --accent:#B33A15; --accent-wash:#F6E9E2;
  --rule:#E0DBD0; --rule-strong:#A79F8E; --focus:#1A4FD6;
  --ok:#2E7D1E;
  --font-display:"Instrument Serif",Georgia,serif;
  --font-text:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;
  --font-data:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  --s1:.25rem; --s2:.5rem; --s3:.75rem; --s4:1rem; --s5:1.5rem;
  --s6:2rem; --s7:3rem; --s8:4rem; --s9:6rem;
  --measure:68ch; --spine:60rem;
  --radius:5px; --hair:1px;
  --ease:cubic-bezier(.2,0,.13,1);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    color-scheme:dark;
    --paper:#14130F; --surface:#1C1A16; --sunk:#100F0C;
    --ink:#F2EEE5; --ink-muted:#9C968A; --ink-faint:#6E6759;
    --accent:#FF7043; --accent-wash:#2A1C15;
    --rule:#302D26; --rule-strong:#4A4539; --focus:#7FA0FF;
    --ok:#4CA83A;
  }
}
:root[data-theme="dark"]{
  color-scheme:dark;
  --paper:#14130F; --surface:#1C1A16; --sunk:#100F0C;
  --ink:#F2EEE5; --ink-muted:#9C968A; --ink-faint:#6E6759;
  --accent:#FF7043; --accent-wash:#2A1C15;
  --rule:#302D26; --rule-strong:#4A4539; --focus:#7FA0FF;
  --ok:#4CA83A;
}

*,*::before,*::after{box-sizing:border-box}
body{
  margin:0;background:var(--paper);color:var(--ink);
  font-family:var(--font-text);font-size:1.0625rem;line-height:1.65;
  -webkit-font-smoothing:antialiased;
}
h1,h2,h3,p,ul,ol,figure{margin:0}
ul,ol{padding:0;list-style:none}
a{color:var(--accent);text-underline-offset:.18em}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:3px}

.canvas{width:100%;max-width:calc(var(--spine) + 3rem);margin-inline:auto;padding-inline:var(--s5)}
.spread{display:grid;grid-template-columns:1fr;gap:var(--s5)}
@media(min-width:64rem){
  .spread{grid-template-columns:minmax(0,42rem) 15rem;gap:var(--s7);align-items:start;
          max-width:var(--spine);margin-inline:auto}
  .spread>.rail{grid-column:2}
  .spread>*:not(.rail){grid-column:1}
}

.eyebrow{
  font-family:var(--font-data);font-size:.75rem;font-weight:500;
  letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);
}
.title{font-family:var(--font-display);font-size:clamp(2.25rem,1.4rem + 3.4vw,3.25rem);
  font-weight:400;line-height:1.08;letter-spacing:-.02em;text-wrap:balance}
.section-heading{font-family:var(--font-display);font-size:2rem;font-weight:400;
  line-height:1.3;letter-spacing:-.02em}
.lead{font-size:1.1875rem;color:var(--ink-muted);max-width:54ch;text-wrap:pretty}
.prose{max-width:var(--measure)}
.prose>*+*{margin-top:var(--s5)}

/* ---- header ---------------------------------------------------------- */
.site-header{border-bottom:var(--hair) solid var(--rule);background:var(--paper);
  position:sticky;top:0;z-index:10}
.site-header__inner{display:flex;align-items:center;justify-content:space-between;
  gap:var(--s5);padding-block:var(--s4)}
.wordmark{display:inline-flex;align-items:center;gap:var(--s2);
  font-family:var(--font-display);font-size:1.5rem;line-height:1;letter-spacing:-.02em}
.scanned{font-family:var(--font-data);font-size:.75rem;color:var(--ink-faint);
  letter-spacing:.06em;text-transform:uppercase}
.theme-toggle{display:inline-grid;place-items:center;width:2rem;height:2rem;padding:0;
  background:transparent;border:var(--hair) solid var(--rule-strong);border-radius:var(--radius);
  color:var(--ink-muted);cursor:pointer}
.theme-toggle:hover{color:var(--accent);border-color:var(--accent)}

main{padding-block:var(--s8) var(--s9)}

/* ---- the number as artwork ------------------------------------------- */
.hero-figure{display:flex;flex-direction:column;gap:var(--s2);margin-top:var(--s5)}
.hero-figure__value{font-family:var(--font-display);font-size:clamp(3.5rem,1.5rem + 8vw,6.5rem);
  line-height:.85;letter-spacing:-.02em;color:var(--accent)}
.hero-figure__caption{font-size:.9375rem;color:var(--ink-muted);max-width:34ch}

/* ---- margin rail ----------------------------------------------------- */
.rail{display:flex;flex-direction:column;gap:var(--s5)}
.note{font-size:.8125rem;line-height:1.55;color:var(--ink-muted);
  border-left:3px solid var(--rule);padding-left:var(--s3)}
.note--caveat{border-left-color:var(--accent)}
.note__label{display:block;font-family:var(--font-data);font-size:.6875rem;
  letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:var(--s1)}
.note dl{display:grid;grid-template-columns:auto 1fr;gap:var(--s1) var(--s3);margin:0}
.note dt{color:var(--ink-faint)}
.note dd{margin:0;font-family:var(--font-data);font-variant-numeric:tabular-nums;color:var(--ink)}
@media(max-width:63.999rem){
  .note{background:var(--sunk);padding:var(--s3);border-radius:var(--radius)}
}

/* ---- divider: layer lines, one displaced ----------------------------- */
.rule{display:flex;align-items:center;gap:3px;height:1rem;margin-block:var(--s7);
  max-width:var(--spine);margin-inline:auto}
.rule::before,.rule::after{content:"";flex:1;height:1px;background:var(--rule)}
.rule i{display:block;width:14px;height:1.5px;background:var(--rule-strong);border-radius:1px}
.rule i:nth-child(3){background:var(--accent);transform:translateX(5px)}

/* ---- capability bars ------------------------------------------------- */
.bars{margin-top:var(--s6);display:flex;flex-direction:column;gap:var(--s5)}
.bar__head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s4)}
.bar__label{font-size:.9375rem;font-weight:500;display:flex;align-items:center;gap:var(--s2)}
.bar__count{font-family:var(--font-data);font-size:.9375rem;font-variant-numeric:tabular-nums;
  color:var(--ink-muted)}
.bar__track{height:14px;background:var(--sunk);border-radius:4px;overflow:hidden;margin-top:var(--s2)}
.bar__fill{height:100%;border-radius:0 4px 4px 0;background:var(--bar,var(--ink-faint));
  transform-origin:left center;
  /* No fill-mode: the resting state is the real width, so if the animation
     never runs the data is still drawn. A chart must not need motion to exist. */
  animation:grow .5s var(--ease)}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.dot{width:9px;height:9px;border-radius:50%;background:var(--bar,var(--ink-faint));flex:none}

/* ---- findings -------------------------------------------------------- */
.finding{border:var(--hair) solid var(--rule);border-left:3px solid var(--accent);
  border-radius:var(--radius);background:var(--surface);padding:var(--s5);margin-top:var(--s4)}
.finding__title{font-size:1.0625rem;font-weight:600;margin-bottom:var(--s2)}
.finding__summary{color:var(--ink);margin-bottom:var(--s3)}
.finding__detail{font-size:.9375rem;color:var(--ink-muted)}
.finding__where{font-family:var(--font-data);font-size:.8125rem;color:var(--ink-faint);
  margin-top:var(--s3)}
.finding--possible{border-left-color:var(--rule-strong)}
.badge{display:inline-block;font-family:var(--font-data);font-size:.6875rem;
  letter-spacing:.08em;text-transform:uppercase;padding:.15em .5em;
  border:var(--hair) solid var(--rule-strong);border-radius:3px;color:var(--ink-muted)}
.badge--likely{border-color:var(--accent);color:var(--accent)}

.all-clear{display:flex;align-items:flex-start;gap:var(--s3);padding:var(--s5);
  background:var(--sunk);border-radius:var(--radius);margin-top:var(--s4);max-width:var(--measure)}
.all-clear__mark{color:var(--ok);font-size:1.25rem;line-height:1.2;flex:none}

/* ---- behaviours ------------------------------------------------------ */
.behaviours{margin-top:var(--s6)}
.behaviour{border-top:var(--hair) solid var(--rule);padding-block:var(--s5)}
.behaviour:last-child{border-bottom:var(--hair) solid var(--rule)}
.behaviour__head{display:flex;align-items:baseline;gap:var(--s4);justify-content:space-between}
.behaviour__title{font-family:var(--font-display);font-size:1.5rem;line-height:1.3;
  letter-spacing:-.02em}
.behaviour__kind{font-family:var(--font-data);font-size:.6875rem;letter-spacing:.08em;
  text-transform:uppercase;color:var(--ink-faint);flex:none}
.behaviour__where{font-family:var(--font-data);font-size:.8125rem;color:var(--ink-faint);
  margin-top:var(--s1)}
.effects{margin-top:var(--s4);display:flex;flex-direction:column;gap:var(--s2)}
.effect{display:flex;align-items:flex-start;gap:var(--s3);font-size:.9375rem}
.effect__dot{margin-top:.45em}
.effect__text{color:var(--ink)}
.effect--minor .effect__text{color:var(--ink-muted)}
.hedge{color:var(--ink-faint);font-size:.8125rem}
.warn{display:flex;align-items:flex-start;gap:var(--s3);font-size:.875rem;
  color:var(--ink-muted);margin-top:var(--s2)}
.warn__mark{color:var(--accent);flex:none}

/* ---- footer ---------------------------------------------------------- */
.site-footer{margin-top:var(--s9);border-top:var(--hair) solid var(--rule);
  padding-block:var(--s7) var(--s8);font-size:.9375rem;color:var(--ink-muted)}
.site-footer strong{color:var(--ink);font-weight:600}
.site-footer p+p{margin-top:var(--s3)}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}
}
`;
