import { canonicalJson, sha256Hex, utf8 } from './canonical.ts';
import { caseCollisions, diffFiles } from './diff.ts';
import { checkArchivePath } from './filename.ts';
import {
  LIMITS,
  MANIFEST_VERSION,
  REMOVAL_REASONS,
  fail,
  ok,
  type AuditEntry,
  type FileEntry,
  type Manifest,
  type RemovalReason,
  type Result,
} from './model.ts';

/** The last signed state: manifest plus the hashes the next manifest has to carry. */
export interface PreviousLink {
  manifest: Manifest;
  manifestSha256: string;
  tokenSha256: string;
}

/** The mandatory dialog's input for one file that disappeared from the folder. */
export interface RemovalDecision {
  code: RemovalReason;
  note: string;
  /** Required for UNLESERLICH_ERSETZT and DUPLIKAT */
  replacedBy?: string;
}

export interface PlanInput {
  previous: PreviousLink | null;
  /** All files now in the archive; new ones already carry their stamp reference */
  current: FileEntry[];
  user: string;
  now: Date;
  /** Keyed by path of the removed file */
  removals: Record<string, RemovalDecision>;
}

export type PlanProblem =
  | 'USER_REQUIRED'
  | 'PATH_INVALID'
  | 'CASE_COLLISION'
  | 'FILE_CHANGED'
  | 'REMOVAL_DECISION_MISSING'
  | 'REMOVAL_DECISION_INVALID'
  | 'NOTHING_CHANGED';

export interface PlannedManifest {
  manifest: Manifest;
  /** Canonical JSON bytes: what is stored AND what is time-stamped */
  bytes: Uint8Array;
  sha256: string;
}

export const sortFiles = (files: readonly FileEntry[]): FileEntry[] =>
  [...files].sort((a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0));

export async function encodeManifest(manifest: Manifest): Promise<PlannedManifest> {
  const bytes = utf8(canonicalJson(manifest));
  return { manifest, bytes, sha256: await sha256Hex(bytes) };
}

export function checkRemovalDecision(
  d: RemovalDecision,
  current: readonly FileEntry[],
  removedPath: string,
): boolean {
  const note = d.note.trim();
  if (!(REMOVAL_REASONS as readonly string[]).includes(d.code)) return false;
  if (note.length < LIMITS.noteMin || note.length > LIMITS.noteMax) return false;
  if (d.code === 'FEHLABLAGE') return true;
  // The document must still exist elsewhere, otherwise a valid document would vanish.
  return (
    d.replacedBy !== undefined &&
    d.replacedBy !== removedPath &&
    current.some((f) => f.pfad === d.replacedBy)
  );
}

/**
 * Builds the next manifest from the previous signed state and the folder content.
 * Blocks (does not sign) while a signed file is missing without a valid decision, or when
 * a signed file changed (no overwriting).
 */
export async function planManifest(
  input: PlanInput,
): Promise<Result<PlannedManifest, PlanProblem>> {
  const user = input.user.trim();
  if (user === '' || user.length > LIMITS.userMax) return fail('USER_REQUIRED');

  const previousFiles = input.previous?.manifest.dateien ?? [];
  const diff = diffFiles(previousFiles, input.current);

  const collisions = caseCollisions(input.current);
  if (collisions.length) return fail('CASE_COLLISION', collisions);
  if (diff.changed.length)
    return fail(
      'FILE_CHANGED',
      diff.changed.map((c) => c.pfad),
    );

  const badPaths = diff.added.filter((f) => !checkArchivePath(f.pfad).ok).map((f) => f.pfad);
  if (badPaths.length) return fail('PATH_INVALID', badPaths);

  const missing = diff.removed.filter((f) => !input.removals[f.pfad]).map((f) => f.pfad);
  if (missing.length) return fail('REMOVAL_DECISION_MISSING', missing);
  const invalid = diff.removed
    .filter((f) => {
      const d = input.removals[f.pfad];
      return !d || !checkRemovalDecision(d, input.current, f.pfad);
    })
    .map((f) => f.pfad);
  if (invalid.length) return fail('REMOVAL_DECISION_INVALID', invalid);

  if (diff.added.length === 0 && diff.removed.length === 0) return fail('NOTHING_CHANGED');

  const at = input.now.toISOString();
  const audit_log: AuditEntry[] = [
    ...diff.added.map((f): AuditEntry => ({
      zeitstempel: at,
      aktion: 'DATEI_HINZUGEFUEGT',
      pfad: f.pfad,
      sha256: f.sha256,
      benutzer: user,
    })),
    ...diff.removed.map((f): AuditEntry => {
      const d = input.removals[f.pfad] as RemovalDecision; // checked above
      const entry: AuditEntry = {
        zeitstempel: at,
        aktion: 'DATEI_ENTFERNT',
        pfad: f.pfad,
        sha256: f.sha256,
        benutzer: user,
        grund_code: d.code,
        begruendung: d.note.trim(),
      };
      if (d.replacedBy !== undefined) entry.ersetzt_durch = d.replacedBy;
      return entry;
    }),
  ].sort((a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : a.aktion < b.aktion ? -1 : 1));

  const prev = input.previous;
  const manifest: Manifest = {
    manifest_version: MANIFEST_VERSION,
    sequenz: prev ? prev.manifest.sequenz + 1 : 1,
    erstellt_am: at,
    erstellt_von: user,
    vorgaenger: prev
      ? {
          sequenz: prev.manifest.sequenz,
          manifest_sha256: prev.manifestSha256,
          token_sha256: prev.tokenSha256,
        }
      : null,
    dateien: sortFiles(input.current),
    audit_log,
  };
  return ok(await encodeManifest(manifest));
}
