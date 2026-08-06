"""
Builds design/review.html — a single self-contained file showing the design
direction and all three page samples, with fonts and CSS inlined as data URIs
so it renders identically anywhere with no server and no network.

Run:  python design/build-review.py
"""
import base64
import pathlib
import re

HERE = pathlib.Path(__file__).parent
FONTS = HERE / "fonts"

# --- 1. Inline the stylesheets, replacing font URLs with base64 data URIs ----
css = (HERE / "tokens.css").read_text(encoding="utf-8") + "\n" + \
      (HERE / "base.css").read_text(encoding="utf-8")


def inline_font(match):
    name = match.group(1)
    data = base64.b64encode((FONTS / name).read_bytes()).decode("ascii")
    return f'url("data:font/woff2;base64,{data}") format("woff2")'


css = re.sub(r'url\("\./fonts/([^"]+)"\)\s*format\("woff2"\)', inline_font, css)

# --- 2. Pull the <body> content out of each sample, minus the theme script ---
SAMPLES = [
    ("index.html",   "Home",    "The front door. States the question, leads with the finding, indexes the studies."),
    ("study.html",   "Study",   "Where the value lives. Method and limitations sit level with the claim, in the margin."),
    ("harness.html", "Harness", "The free tool. Credibility proof and distribution channel in one page."),
]

sections = []
for filename, label, blurb in SAMPLES:
    html = (HERE / filename).read_text(encoding="utf-8")
    body = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
    body = re.sub(r"<script.*?</script>", "", body, flags=re.S)
    body = body.replace('<a class="skip-link" href="#main">Skip to content</a>', "")
    # ids must stay unique once three pages share one document
    body = body.replace('id="theme-toggle"', f'id="theme-toggle-{label.lower()}"')
    body = body.replace('id="main"', f'id="main-{label.lower()}"')
    sections.append(f"""
<div class="sample-label">
  <div class="canvas">
    <p class="eyebrow">Page type — {label}</p>
    <p>{blurb}</p>
  </div>
</div>
<div class="sample-frame">{body}</div>
""")

# --- 3. Assemble -------------------------------------------------------------
out = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentmetrics.org — design direction</title>
<style>
{css}

/* Review-document chrome. Not part of the site. */
.sample-label {{
  background: var(--surface-sunk);
  border-top: var(--border-hair) solid var(--rule-strong);
  border-bottom: var(--border-hair) solid var(--rule);
  padding-block: var(--space-5);
  font-size: var(--size-s);
  color: var(--ink-muted);
}}
.sample-label p:last-child {{ margin-top: var(--space-2); max-width: var(--measure); }}
.sample-frame {{ padding-bottom: var(--space-9); }}
.sample-frame .site-footer {{ margin-top: var(--space-8); }}
.review-head {{ padding-block: var(--space-9) var(--space-7); }}
.theme-note {{
  position: sticky; top: 0; z-index: 50;
  background: var(--accent); color: #fff;
  font-family: var(--font-data); font-size: var(--size-2xs);
  letter-spacing: var(--tracking-wide); text-transform: uppercase;
  padding: var(--space-2) var(--space-4); text-align: center;
}}
</style>
</head>
<body>

<p class="theme-note">Switch your OS between light and dark — both themes are designed</p>

<div class="canvas review-head">
  <p class="eyebrow">Phase 2 · Design direction</p>
  <h1 class="title" style="margin-top: var(--space-4);">The Measurement Record</h1>
  <p class="lead" style="margin-top: var(--space-4);">
    Three page types, real content, real numbers. Light and dark both designed.
    Scroll to review; nothing below is a placeholder.
  </p>
</div>

{"".join(sections)}

</body>
</html>
"""

(HERE / "review.html").write_text(out, encoding="utf-8")
size_kb = round(len((HERE / "review.html").read_bytes()) / 1024, 1)
print(f"wrote design/review.html  ({size_kb} KB, fonts inlined)")
