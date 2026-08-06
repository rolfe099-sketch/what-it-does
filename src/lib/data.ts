/**
 * Data access. The only file that knows the shape of the JSON in src/data/.
 *
 * Everything here is pure reads over static imports — there is no database and
 * no fetching. The whole dataset ships inside the build, which is why the site
 * works with JavaScript disabled and why it can be hosted for nothing.
 */

import fixesFile from '../data/fixes.json';
import materialsFile from '../data/materials.json';
import printersFile from '../data/printers.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Confidence = 'established' | 'likely' | 'situational';

export interface Fix {
  id: string;
  defect: string;
  setting: string;
  direction: string;
  amount: string;
  title: string;
  why: string;
  order: number;
  confidence: Confidence;
  appliesTo: { materials: string[]; printerClasses: string[] };
  evidence: { verified: number };
}

export interface Material {
  name: string;
  fullName: string;
  summary: string;
  nozzle: { min: number; max: number; typical: number };
  bed: { min: number; max: number; typical: number };
  chamber: { min: number; max: number } | null;
  enclosure: 'required' | 'helpful' | 'harmful' | 'optional';
  enclosureNote: string;
  cooling: { min: number; max: number };
  drying: { required: boolean; temp: number; hours: number };
  shrinkage: number;
  warpTendency: 'low' | 'medium' | 'high';
  retractionSensitivity: 'low' | 'medium' | 'high';
  stringingTendency: 'low' | 'medium' | 'high';
  abrasive: boolean;
  glassTransition: number | null;
  adhesion: string[];
  watchFor: string[];
}

export interface PrinterClass {
  name: string;
  shortName: string;
  examples: string[];
  motion: string;
  extruder: 'direct' | 'bowden';
  enclosed: boolean;
  maxNozzle: number;
  maxBed: number;
  partCooling: string;
  quirks: string[];
}

// ---------------------------------------------------------------------------
// Loading
//
// The JSON files carry a leading "_comment" key so a human editing them knows
// the rules. It is stripped here rather than in the files, so the guidance
// stays where the person editing will actually see it.
// ---------------------------------------------------------------------------

const stripComments = <T>(obj: Record<string, unknown>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => !key.startsWith('_')),
  ) as Record<string, T>;

export const materials = stripComments<Material>(materialsFile as Record<string, unknown>);
export const printerClasses = stripComments<PrinterClass>(printersFile as Record<string, unknown>);
export const allFixes = fixesFile.fixes as Fix[];
export const confidenceLevels = fixesFile.confidenceLevels as Record<Confidence, string>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every fix for a defect, in the order they should be attempted. */
export function fixesForDefect(defectId: string): Fix[] {
  return allFixes
    .filter((fix) => fix.defect === defectId)
    .sort((a, b) => a.order - b.order);
}

/** Does this fix apply to the given material and printer class? '*' matches all. */
export function fixApplies(fix: Fix, materialId?: string, printerClassId?: string): boolean {
  const matches = (list: string[], value?: string) =>
    !value || list.includes('*') || list.includes(value);

  return (
    matches(fix.appliesTo.materials, materialId) &&
    matches(fix.appliesTo.printerClasses, printerClassId)
  );
}

/**
 * The diagnostic query: narrow a defect's fixes to a specific setup.
 *
 * Note that this can legitimately return fewer fixes than the defect page
 * shows — that is the point. A Bowden retraction fix is noise on a direct-drive
 * machine, and showing it anyway is how generic advice wastes people's evenings.
 */
export function diagnose(defectId: string, materialId?: string, printerClassId?: string): Fix[] {
  return fixesForDefect(defectId).filter((fix) => fixApplies(fix, materialId, printerClassId));
}

/** Total verified results across the dataset. Currently zero, and shown as zero. */
export function totalVerified(): number {
  return allFixes.reduce((sum, fix) => sum + fix.evidence.verified, 0);
}

/**
 * Dates render as plain ISO (2026-08-06) everywhere on the site.
 * Unambiguous internationally, sorts correctly, and needs no locale handling —
 * "06/08/2026" means two different days depending on who is reading it.
 */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Counts used on the homepage and data page. Derived, never hand-written. */
export function datasetStats() {
  return {
    fixes: allFixes.length,
    materials: Object.keys(materials).length,
    printerClasses: Object.keys(printerClasses).length,
    verified: totalVerified(),
  };
}
