import type { FileEntry } from './model.ts';

export interface FileDiff {
  added: FileEntry[];
  removed: FileEntry[];
  /** Same path, different content: forbidden (no overwriting) */
  changed: { pfad: string; alt: string; neu: string }[];
  unchanged: FileEntry[];
}

export function diffFiles(previous: readonly FileEntry[], current: readonly FileEntry[]): FileDiff {
  const prev = new Map(previous.map((f) => [f.pfad, f]));
  const cur = new Map(current.map((f) => [f.pfad, f]));
  const diff: FileDiff = { added: [], removed: [], changed: [], unchanged: [] };
  for (const f of current) {
    const old = prev.get(f.pfad);
    if (!old) diff.added.push(f);
    else if (old.sha256 !== f.sha256)
      diff.changed.push({ pfad: f.pfad, alt: old.sha256, neu: f.sha256 });
    else diff.unchanged.push(f);
  }
  for (const f of previous) if (!cur.has(f.pfad)) diff.removed.push(f);
  return diff;
}

/** Paths that collide on a case-insensitive file system (Windows). */
export function caseCollisions(files: readonly FileEntry[]): string[] {
  const seen = new Map<string, string>();
  const bad = new Set<string>();
  for (const f of files) {
    const key = f.pfad.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined) {
      bad.add(other);
      bad.add(f.pfad);
    } else seen.set(key, f.pfad);
  }
  return [...bad].sort();
}
