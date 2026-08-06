import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Defect pages. One Markdown file per defect in src/content/defects/.
 *
 * The filename becomes the URL slug AND the key that links to fixes.json —
 * a file named `stringing.md` collects every fix whose `defect` is "stringing".
 * Rename a file and you must rename the matching fixes.
 *
 * To add a defect: copy an existing file, change the frontmatter, write the
 * prose. Nothing in the code needs to change.
 */
const defects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/defects' }),
  schema: z.object({
    /** Shown as the h1 and in the page title. */
    title: z.string(),
    /** One sentence. Used in listings, meta description and search results. */
    summary: z.string(),
    /** Other names people search for. Helps the diagnostic match symptoms. */
    alsoKnownAs: z.array(z.string()).default([]),
    /** How much it matters: cosmetic, structural, or the print is lost. */
    severity: z.enum(['cosmetic', 'structural', 'print-ending']),
    /**
     * Date of last substantive review. Displayed, because freshness is the moat.
     * Write it unquoted as `updated: 2026-08-06` — YAML turns that into a real
     * date and `coerce` accepts it either way, so you cannot get this wrong.
     */
    updated: z.coerce.date(),
    /** Ordering on the index. Lower is more common, therefore listed first. */
    commonness: z.number().min(1).max(10),
  }),
});

export const collections = { defects };
