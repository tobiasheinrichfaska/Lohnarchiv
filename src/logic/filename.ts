import { ALLOWED_EXTENSIONS, LIMITS, fail, ok, type Result } from './model.ts';

const TRANSLIT: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
};

// Windows device names are not usable as file names, with or without extension.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type NameProblem = 'EXTENSION_NOT_ALLOWED' | 'NAME_EMPTY';

export interface SanitizedName {
  name: string;
  /** True when the proposal differs from the input */
  changed: boolean;
}

/** BVV-conformant file name: ≤ 64 chars, no umlauts/spaces/special chars (only _ and -). */
export function sanitizeFileName(input: string): Result<SanitizedName, NameProblem> {
  const trimmed = input.trim();
  const dot = trimmed.lastIndexOf('.');
  const ext = (dot >= 0 ? trimmed.slice(dot + 1) : '').toLowerCase();
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext))
    return fail('EXTENSION_NOT_ALLOWED');

  let base = trimmed.slice(0, dot);
  base = base.replace(/[äöüÄÖÜß]/g, (c) => TRANSLIT[c] ?? c);
  base = base
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
  base = base.slice(0, LIMITS.fileNameMax - ext.length - 1).replace(/[_-]+$/g, '');
  if (base === '') return fail('NAME_EMPTY');
  if (RESERVED.test(base)) base = `${base}_x`;

  const name = `${base}.${ext}`;
  return ok({ name, changed: name !== input });
}

export interface NameParts {
  /** ISO date YYYY-MM-DD */
  date: string;
  type: string;
  person: string;
  ext: string;
}

/** Proposal such as 2026-11-16_Immatrikulation_Mueller.pdf */
export function proposeFileName(
  parts: NameParts,
): Result<SanitizedName, NameProblem | 'DATE_INVALID'> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parts.date) || Number.isNaN(Date.parse(parts.date))) {
    return fail('DATE_INVALID');
  }
  return sanitizeFileName(`${parts.date}_${parts.type}_${parts.person}.${parts.ext}`);
}

export type PathProblem =
  'PATH_SEGMENTS' | 'PATH_SEGMENT_INVALID' | NameProblem | 'NAME_NOT_CONFORM';

/**
 * Archive path `personalnummer/jahr/datei`. The file name must already be conformant
 * (no silent rewriting of a path that is about to be signed).
 */
export function checkArchivePath(path: string): Result<string, PathProblem> {
  const segments = path.split('/');
  if (segments.length !== 3) return fail('PATH_SEGMENTS');
  const [person, year, file] = segments as [string, string, string];
  const segmentOk = (s: string) =>
    s.length > 0 &&
    s.length <= LIMITS.pathSegmentMax &&
    /^[A-Za-z0-9_-]+$/.test(s) &&
    !RESERVED.test(s);
  if (!segmentOk(person) || !/^\d{4}$/.test(year)) return fail('PATH_SEGMENT_INVALID');
  const clean = sanitizeFileName(file);
  if (!clean.ok) return fail(clean.reason);
  if (clean.value.name !== file) return fail('NAME_NOT_CONFORM');
  return ok(path);
}
