/**
 * Report assets — fonts inlined so a report is a single portable file.
 *
 * A report must work with no network, no server and no sibling files: opened
 * from a Downloads folder, attached to an email, dragged into a Slack message.
 * That rules out linked stylesheets and font CDNs, and it is also the privacy
 * position — a report that fetches anything is a report that phones home.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from this module until the package root is found. */
function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const FONT_FILES = {
  display: 'instrument-serif-latin-400-normal.woff2',
  sans: 'ibm-plex-sans-latin-400-normal.woff2',
  sansMedium: 'ibm-plex-sans-latin-500-normal.woff2',
  sansSemi: 'ibm-plex-sans-latin-600-normal.woff2',
  mono: 'ibm-plex-mono-latin-400-normal.woff2',
  monoMedium: 'ibm-plex-mono-latin-500-normal.woff2',
} as const;

function dataUri(file: string): string | null {
  const full = path.join(packageRoot(), 'design', 'fonts', file);
  try {
    return `data:font/woff2;base64,${fs.readFileSync(full).toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * @font-face rules with the files embedded.
 *
 * If a font is missing the rule is skipped rather than emitted with a broken
 * URL — the report then falls back to the system stack and still reads fine.
 */
export function fontFaces(): string {
  const face = (family: string, weight: number, file: string) => {
    const uri = dataUri(file);
    if (!uri) return '';
    return `@font-face{font-family:"${family}";src:url("${uri}") format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`;
  };

  return [
    face('Instrument Serif', 400, FONT_FILES.display),
    face('IBM Plex Sans', 400, FONT_FILES.sans),
    face('IBM Plex Sans', 500, FONT_FILES.sansMedium),
    face('IBM Plex Sans', 600, FONT_FILES.sansSemi),
    face('IBM Plex Mono', 400, FONT_FILES.mono),
    face('IBM Plex Mono', 500, FONT_FILES.monoMedium),
  ].join('');
}
