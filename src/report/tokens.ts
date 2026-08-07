/**
 * DESIGN TOKENS — the only file with raw values in it.
 *
 * Direction: INSTRUMENT.
 *
 * This tool tells people uncomfortable truths about software they paid for and
 * depend on. It should read like a diagnostic device, not a marketing page:
 * cool, precise, and calm enough that a red mark means something when it
 * appears. Confidence through restraint.
 *
 * Deliberately moved off the previous palette — warm cream paper, vermilion
 * accent, high-contrast serif display. That was a good editorial system but it
 * reads as Anthropic house style, and this product needs its own identity.
 *
 * ── The colour rule that matters most ──────────────────────────────────────
 *
 * THREE LEVELS, AND THEY MEAN DIFFERENT THINGS:
 *
 *   ink       most content. The default.
 *   accent    CONSEQUENTIAL — deletes data, moves money, changes access.
 *             "This matters." Not "this is broken."
 *   alert     SOMETHING LOOKS WRONG. Findings only.
 *
 * The previous design used one accent for both, which quietly taught the reader
 * that a properly-guarded delete endpoint and a genuine finding look the same.
 * They do not. `alert` is reserved: it appears on findings and nowhere else, so
 * that seeing one is informative rather than ambient.
 *
 * ── Contrast, computed not eyeballed ───────────────────────────────────────
 *
 * Ratios are the WORST CASE across every surface a token can land on — canvas,
 * surface and sunk in light; canvas, surface and raised in dark. Measuring only
 * against the canvas is how the first pass shipped caveat labels at 4.23:1: the
 * token cleared 4.63 on the canvas but caveats sit on the sunk surface, which is
 * darker. Verified by measuring the rendered DOM, not by trusting these numbers.
 *
 *   LIGHT   ink 15.9  muted 6.79  faint 4.62  accent 5.08  alert 5.86  ok 5.69
 *   DARK    ink 13.7  muted 6.35  faint 4.76  accent 8.04  alert 6.03  ok 8.02
 *
 * All body text clears AA (4.5) on every surface. `rule-strong`, used for
 * structural borders, clears the 3:1 UI-component threshold in both modes
 * (3.25 / 3.08). `rule` is a decorative hairline and is not held to it.
 *
 * Accent and alert are maximally separated in hue (teal vs crimson) but close in
 * luminance, so colour NEVER carries meaning alone anywhere in this system —
 * every finding also carries a text badge, and every consequential effect also
 * carries its plain-language label.
 */

export const TOKENS = `
:root{
  color-scheme:light;

  /* ── surfaces ─────────────────────────────────────────────────────────
     Cool near-white, like a technical drawing. Not warm, not paper-cream. */
  --canvas:#F6F8FA;
  --surface:#FFFFFF;
  --sunk:#EAEEF3;
  --raised:#FFFFFF;

  /* ── ink ───────────────────────────────────────────────────────────── */
  --ink:#11161D;
  --ink-muted:#49525F;
  --ink-faint:#626B79;

  /* ── signal ────────────────────────────────────────────────────────── */
  --accent:#0E6E7D;          /* consequential — "this matters" */
  --accent-wash:#E2F0F3;
  --alert:#B01B3F;           /* RESERVED: findings only */
  --alert-wash:#FBE9EE;
  --ok:#0F6A45;
  --ok-wash:#E1F1E9;         /* the clean-bill-of-health seal; ok glyph on it: 5.67 / 7.53 dark */
  /* Chart node halo opacity. A halo is hierarchy, not decoration — it scales
     with the node, so the biggest blast radius glows the most. Faint in light
     (paper does not glow), stronger in dark (instruments at night do). */
  --glow:.10;

  /* ── structure ─────────────────────────────────────────────────────── */
  --rule:#DCE2E9;            /* decorative hairline */
  --rule-strong:#7A8492;     /* structural border, clears 3:1 */
  --focus:#1A4FD6;           /* never the accent — a focus ring must not
                                read as decoration */

  --shadow:0 1px 2px rgba(17,22,29,.04), 0 8px 24px rgba(17,22,29,.05);

  /* ── type ──────────────────────────────────────────────────────────────
     Three families, three jobs. Space Grotesk is geometric with slightly
     mechanical letterforms — it labels instruments well and reads nothing
     like an editorial serif. Plex Mono carries every number, because on an
     instrument the digits are the content. */
  --font-display:"Space Grotesk",ui-sans-serif,system-ui,sans-serif;
  --font-text:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;
  --font-data:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;

  --t-micro:.6875rem;   /* 11 — tick labels */
  --t-tiny:.75rem;      /* 12 — badges, eyebrows */
  --t-small:.8125rem;   /* 13 — annotations */
  --t-meta:.875rem;     /* 14 — secondary */
  --t-body:1rem;        /* 16 — body */
  --t-lead:1.125rem;    /* 18 — lead paragraph */
  --t-h3:1.25rem;       /* 20 */
  --t-h2:1.75rem;       /* 28 */
  --t-h1:clamp(2rem,1.3rem + 2.6vw,2.75rem);
  --t-readout:clamp(3rem,1.6rem + 6vw,5rem);   /* the big number */

  --lh-tight:1.1;
  --lh-snug:1.35;
  --lh-body:1.6;
  --track-tight:-.02em;
  --track-wide:.09em;   /* uppercase mono labels */

  /* ── space — 4px base ──────────────────────────────────────────────── */
  --s1:.25rem; --s2:.5rem;  --s3:.75rem; --s4:1rem;   --s5:1.5rem;
  --s6:2rem;   --s7:3rem;   --s8:4rem;   --s9:6rem;   --s10:8rem;

  /* ── measure ───────────────────────────────────────────────────────── */
  --measure:66ch;       /* prose, inside 45–75ch */
  --measure-tight:48ch;
  --col-main:40rem;
  --col-rail:15rem;
  --spine:calc(var(--col-main) + var(--col-rail) + var(--s7));
  --gutter:var(--s5);

  --radius:4px;
  --radius-lg:8px;
  --hair:1px;

  /* ── motion — fast, few, never load-bearing ────────────────────────── */
  --ease:cubic-bezier(.2,0,.13,1);
  --t-fast:110ms;
  --t-base:180ms;
  --t-draw:420ms;
  --t-slow:600ms;    /* the constellation drawing itself */
}

/* ── DARK ───────────────────────────────────────────────────────────────
   Not an inversion. A deep desaturated blue-black, like an instrument read
   at night. The accent brightens because a dark surface eats saturation;
   the alert warms slightly so it still reads as a warning rather than as
   another cool hue. */
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    color-scheme:dark;
    --canvas:#0B0F13;
    --surface:#141A20;
    --sunk:#070A0D;
    --raised:#1A212A;

    --ink:#E7EBF1;
    --ink-muted:#98A3B2;
    --ink-faint:#828C99;

    --accent:#3FC7DC;
    --accent-wash:#0C2A31;
    --alert:#F87389;
    --alert-wash:#2E1119;
    --ok:#3FCF74;
    --ok-wash:#0E2B1B;
    --glow:.22;

    --rule:#222A34;
    --rule-strong:#626D79;
    --focus:#7FA6FF;

    --shadow:0 1px 2px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.4);
  }
}
:root[data-theme="dark"]{
  color-scheme:dark;
  --canvas:#0B0F13;
  --surface:#141A20;
  --sunk:#070A0D;
  --raised:#1A212A;

  --ink:#E7EBF1;
  --ink-muted:#98A3B2;
  --ink-faint:#828C99;

  --accent:#3FC7DC;
  --accent-wash:#0C2A31;
  --alert:#F87389;
  --alert-wash:#2E1119;
  --ok:#3FCF74;
  --ok-wash:#0E2B1B;
  --glow:.22;

  --rule:#222A34;
  --rule-strong:#626D79;
  --focus:#7FA6FF;

  --shadow:0 1px 2px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.4);
}
`;
