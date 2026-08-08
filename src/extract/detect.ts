/**
 * Which framework is this, and what do we do when it is none of them?
 *
 * Two jobs, and the second one matters more than it looks. Supporting a new
 * framework is a bounded piece of work — write an extractor, emit Triggers,
 * everything downstream already works. But *not* supporting one is the most
 * common first experience anyone will have with this tool, and until now that
 * experience was a single line saying "not a Next.js project" followed by
 * exit(1).
 *
 * That is a dead end pretending to be an answer. The person ran the tool on a
 * real codebase with real endpoints in it; telling them only what we are not
 * teaches them nothing and gives them nothing to do. So when we cannot read a
 * project, we survey it instead: say what we found, name the framework if we
 * recognise its fingerprint, and be specific about the difference between
 * "nobody has written this extractor" and "there is nothing here to read".
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Trigger, Unknown } from '../model.js';
import { NO_MIDDLEWARE, type MiddlewareInfo } from './nextjs/middleware.js';
import {
  detectNextJs,
  findAppDir,
  findEntryPoints as findNextEntryPoints,
} from './nextjs/entrypoints.js';
import {
  detectCloudflarePages,
  findEntryPoints as findCloudflareEntryPoints,
} from './cloudflare/entrypoints.js';
import {
  detectSupabase,
  findEntryPoints as findSupabaseEntryPoints,
} from './supabase/entrypoints.js';

export interface FrameworkScan {
  /** Shown in the report header, e.g. "Next.js 15.1.0". */
  framework: string;
  /** Where the entry points were found, e.g. "app router at src/app". */
  where: string;
  triggers: Trigger[];
  skipped: Unknown[];
  middleware: MiddlewareInfo;
}

// ---------------------------------------------------------------------------
// Recognising what we cannot yet read
// ---------------------------------------------------------------------------

/**
 * Fingerprints for frameworks we can identify but not analyse.
 *
 * Being able to say "this is a SvelteKit project" while admitting we cannot
 * read it is a much better answer than silence. It tells the person the tool
 * looked, understood, and came up short — which is a missing extractor, not a
 * broken install. `entryHint` is what the extractor would have to key on, kept
 * here because it is the honest answer to "how hard would that be?"
 */
interface Fingerprint {
  name: string;
  /** A dependency in package.json that identifies it. */
  dependency?: string;
  /** A file or directory whose presence identifies it. */
  marker?: string;
  /** Where its entry points live, if someone wanted to write the extractor. */
  entryHint: string;
  /**
   * Everything runs in the browser, so there are no server-side entry points
   * to find — not now, and not after someone writes an extractor.
   *
   * The distinction matters because the honest answer is completely different.
   * "Nobody has written that extractor yet" invites you to come back later.
   * "There is no server here" is a finished answer about your architecture,
   * and saying the first when the second is true wastes the reader's time.
   */
  clientOnly?: boolean;
}

const FINGERPRINTS: Fingerprint[] = [
  /**
   * Vite comes first because it is what the tools this scanner exists for
   * actually emit. Lovable and Bolt generate Vite + React single-page apps,
   * so a person who built their product by describing it to an assistant is
   * more likely to be holding one of these than anything else on this list —
   * and telling them "we could not identify a framework here" is the worst
   * possible answer for exactly the audience we are built for.
   *
   * Ordered before the React entry so a Vite React app is called Vite.
   */
  {
    name: 'a Vite single-page app',
    dependency: 'vite',
    entryHint: 'nothing on a server — the browser runs all of it',
    clientOnly: true,
  },
  {
    name: 'a React single-page app',
    dependency: 'react-scripts',
    entryHint: 'nothing on a server — the browser runs all of it',
    clientOnly: true,
  },
  { name: 'SvelteKit', dependency: '@sveltejs/kit', entryHint: 'src/routes/**/+server.ts' },
  { name: 'Nuxt', dependency: 'nuxt', entryHint: 'server/api/**' },
  { name: 'Remix', dependency: '@remix-run/node', entryHint: 'app/routes/**/*.tsx loaders and actions' },
  { name: 'Astro', dependency: 'astro', entryHint: 'src/pages/**/*.ts endpoints' },
  { name: 'Hono', dependency: 'hono', entryHint: 'app.get() / app.post() calls' },
  { name: 'Express', dependency: 'express', entryHint: 'app.get() / router.post() calls' },
  { name: 'Fastify', dependency: 'fastify', entryHint: 'fastify.route() registrations' },
  { name: 'NestJS', dependency: '@nestjs/core', entryHint: '@Controller and @Get decorators' },
  { name: 'Netlify Functions', marker: 'netlify/functions', entryHint: 'netlify/functions/**/handler' },
  { name: 'Vercel Serverless Functions', marker: 'api', entryHint: 'api/**/*.ts default exports' },
  { name: 'Django', marker: 'manage.py', entryHint: 'urls.py route tables' },
  { name: 'Rails', marker: 'config/routes.rb', entryHint: 'config/routes.rb' },
  { name: 'Laravel', marker: 'artisan', entryHint: 'routes/web.php and routes/api.php' },
];

export interface Survey {
  /** The framework we recognised but cannot read, if any. */
  recognised?: { name: string; entryHint: string; clientOnly?: boolean };
  /** JavaScript or TypeScript files we can see but have no route model for. */
  codeFiles: number;
  /**
   * Code in languages we do not read at all, biggest first. Naming the
   * language is the difference between a useful limit and a wrong claim.
   */
  otherLanguages: { name: string; files: number }[];
  /** True when the count above hit its budget, so it is a floor and not a total. */
  codeFilesCapped: boolean;
  /** True when there is no code of ANY language we can recognise. */
  staticOnly: boolean;
  /**
   * Readable applications sitting one level down. The single most useful thing
   * we can say about a monorepo, whose root is a workspace manifest and nothing
   * else — "we could not identify a framework here" is technically true of that
   * directory and completely unhelpful.
   */
  scannableChildren: { dir: string; framework: string }[];
  /** Reason from the Next.js check, kept because it is usually the right one. */
  nextReason?: string;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * Languages we cannot read, so that we can at least say which one it is.
 *
 * "There is no server-side code here" was computed from the count of
 * JavaScript files alone, which meant a 41-file Python application was told
 * it was a static site whose HTML said everything. Confidently wrong about
 * somebody's whole codebase is the single worst thing this tool can say, and
 * it was saying it on the path most strangers arrive at first.
 */
const OTHER_LANGUAGES: { name: string; extensions: string[] }[] = [
  { name: 'Python', extensions: ['.py'] },
  { name: 'Go', extensions: ['.go'] },
  { name: 'Rust', extensions: ['.rs'] },
  { name: 'Ruby', extensions: ['.rb'] },
  { name: 'PHP', extensions: ['.php'] },
  { name: 'Java', extensions: ['.java', '.kt'] },
  { name: 'C#', extensions: ['.cs'] },
  { name: 'Elixir', extensions: ['.ex', '.exs'] },
  { name: 'Swift', extensions: ['.swift'] },
  { name: 'Dart', extensions: ['.dart'] },
];
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.wrangler', 'coverage', 'vendor',
]);

const FILE_BUDGET = 4000;

interface FileCensus {
  /** JavaScript and TypeScript — the only thing we can actually read. */
  readable: number;
  /** Whatever else is here, biggest first. */
  others: { name: string; files: number }[];
}

function census(dir: string, budget = FILE_BUDGET): FileCensus {
  let readable = 0;
  let seen = 0;
  const byLanguage = new Map<string, number>();
  const stack = [dir];

  while (stack.length > 0 && seen < budget) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(stack.pop()!, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(entry.parentPath ?? dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(full);
        continue;
      }
      const extension = path.extname(entry.name);
      if (SOURCE_EXTENSIONS.has(extension)) {
        readable++;
        seen++;
        continue;
      }
      const language = OTHER_LANGUAGES.find((l) => l.extensions.includes(extension));
      if (language) {
        byLanguage.set(language.name, (byLanguage.get(language.name) ?? 0) + 1);
        seen++;
      }
    }
  }

  const others = [...byLanguage.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files - a.files);

  return { readable, others };
}

function surveyUnsupported(root: string, nextReason?: string): Survey {
  let dependencies: Record<string, string> = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    /* No package.json is itself a signal, handled by the marker fingerprints. */
  }

  let recognised: Survey['recognised'];
  for (const print of FINGERPRINTS) {
    const byDependency = print.dependency !== undefined && print.dependency in dependencies;
    const byMarker =
      print.marker !== undefined && fs.existsSync(path.join(root, ...print.marker.split('/')));
    if (byDependency || byMarker) {
      recognised = { name: print.name, entryHint: print.entryHint, clientOnly: print.clientOnly };
      break;
    }
  }

  const counted = census(root);
  return {
    recognised,
    codeFiles: counted.readable,
    codeFilesCapped: counted.readable >= FILE_BUDGET,
    otherLanguages: counted.others,
    // Only a project with no recognisable code in ANY language is static.
    staticOnly: counted.readable === 0 && counted.others.length === 0,
    scannableChildren: findScannableChildren(root),
    nextReason,
  };
}

/**
 * Applications one level down that we COULD read.
 *
 * Deliberately shallow. A workspace layout puts them under apps/ or packages/,
 * or directly at the root; going deeper than that turns a helpful hint into a
 * full crawl of node_modules-adjacent directories for no extra accuracy. Only
 * the cheap detectors run — no parsing, no tracing — so this stays a hint.
 */
function findScannableChildren(root: string): { dir: string; framework: string }[] {
  const found: { dir: string; framework: string }[] = [];

  const consider = (relative: string) => {
    if (found.length >= 8) return;
    const full = path.join(root, relative);
    try {
      if (!fs.statSync(full).isDirectory()) return;
    } catch {
      return;
    }
    // The `next` dependency alone is not enough. A component library in the
    // same workspace lists it too, and pointing someone at packages/ui — where
    // the very next thing they see is "no app directory found" — is worse than
    // saying nothing. Offer it only if it would actually scan.
    if (detectNextJs(full).isNext && findAppDir(full)) {
      found.push({ dir: relative.split(path.sep).join('/'), framework: 'Next.js' });
      return;
    }
    // A Vite front end with a Supabase backend beside it is the shape Lovable
    // and Bolt produce, so this is the child most worth pointing at.
    if (detectSupabase(full).found && findSupabaseEntryPoints(full).triggers.length > 0) {
      found.push({ dir: relative.split(path.sep).join('/'), framework: 'Supabase Edge Functions' });
      return;
    }

    // Same rule as the top-level detector: a directory called `functions` is a
    // popular name for ordinary source code, so the evidence is handlers, not
    // the folder. dub has a packages/utils/functions that means nothing.
    if (
      detectCloudflarePages(full).found &&
      findCloudflareEntryPoints(full).triggers.length > 0
    ) {
      found.push({ dir: relative.split(path.sep).join('/'), framework: 'Cloudflare Pages' });
    }
  };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
    consider(entry.name);
    // apps/web is the layout every monorepo tool scaffolds.
    if (entry.name === 'apps' || entry.name === 'packages') {
      let children: fs.Dirent[];
      try {
        children = fs.readdirSync(path.join(root, entry.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) {
        if (child.isDirectory()) consider(path.join(entry.name, child.name));
      }
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

export type Detection =
  | { supported: true; scan: FrameworkScan }
  | { supported: false; survey: Survey };

/**
 * Frameworks are tried in order of specificity. Next.js first because a
 * Next.js project deployed to Cloudflare can have both a `functions/` directory
 * and an app router, and the app router is the one that describes the product.
 */
export function detectFramework(root: string): Detection {
  const next = detectNextJs(root);
  if (next.isNext) {
    const { appDir, triggers, skipped, middleware } = findNextEntryPoints(root);
    if (appDir) {
      return {
        supported: true,
        scan: {
          framework: `Next.js ${next.version ?? ''}`.trim(),
          where: `app router at ${appDir}`,
          triggers,
          skipped,
          middleware,
        },
      };
    }
    // A Next.js project with no app/ is Pages Router. Fall through rather than
    // exit: if it also has functions/, that part is still readable.
  }

  /**
   * Supabase before Cloudflare, because a project can plausibly carry both and
   * the functions directory holds the application's own logic.
   */
  const supabase = detectSupabase(root);
  if (supabase.found) {
    const { functionsDir, triggers, skipped, middleware } = findSupabaseEntryPoints(root);
    if (triggers.length > 0) {
      return {
        supported: true,
        scan: {
          framework: 'Supabase Edge Functions',
          where: `functions at ${functionsDir}`,
          triggers,
          skipped,
          middleware,
        },
      };
    }
  }

  const cloudflare = detectCloudflarePages(root);
  if (cloudflare.found) {
    const { functionsDir, triggers, skipped, middleware } = findCloudflareEntryPoints(root);
    if (triggers.length > 0) {
      return {
        supported: true,
        scan: {
          framework: 'Cloudflare Pages Functions',
          where: `functions at ${functionsDir}`,
          triggers,
          skipped,
          middleware,
        },
      };
    }
  }

  return { supported: false, survey: surveyUnsupported(root, next.reason) };
}

export { NO_MIDDLEWARE };
