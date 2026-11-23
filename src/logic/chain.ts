import { canonicalJson, sha256Hex } from './canonical.ts';
import { diffFiles } from './diff.ts';
import { checkRemovalDecision } from './manifest.ts';
import {
  MANIFEST_VERSION,
  REMOVAL_REASONS,
  type AuditEntry,
  type FileEntry,
  type Manifest,
} from './model.ts';

/** One stored manifest with its RFC 3161 token, exactly as read from the archive. */
export interface ChainLinkBytes {
  manifestBytes: Uint8Array;
  tokenBytes: Uint8Array;
}

/** Checks that `token` stamps `manifestSha256` and returns the TSA's time. Implemented by the IO layer. */
export type TokenVerifier = (
  manifestSha256: string,
  tokenBytes: Uint8Array,
) => Promise<{ ok: true; genTime: Date } | { ok: false; reason: string }>;

export type ChainIssueCode =
  | 'MANIFEST_UNREADABLE'
  | 'MANIFEST_NOT_CANONICAL'
  | 'SEQUENCE_BROKEN'
  | 'PREVIOUS_MISMATCH'
  | 'FILE_OVERWRITTEN'
  | 'AUDIT_LOG_MISMATCH'
  | 'REMOVAL_REASON_INVALID'
  | 'TOKEN_INVALID'
  | 'TIME_GOES_BACKWARDS';

export interface ChainIssue {
  sequenz: number;
  code: ChainIssueCode;
  detail?: string;
}

export interface ChainReport {
  ok: boolean;
  count: number;
  issues: ChainIssue[];
  /** Hashes needed to link the next manifest; null for an empty or broken chain */
  last: { manifest: Manifest; manifestSha256: string; tokenSha256: string } | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isHex = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

function isFileEntry(v: unknown): v is FileEntry {
  if (!isObj(v)) return false;
  const z = v['zeitstempel'];
  const stampOk =
    isObj(z) &&
    (z['art'] === 'eingebettet' ||
      (z['art'] === 'getrennt' && typeof z['token_pfad'] === 'string' && isHex(z['token_sha256'])));
  return (
    typeof v['pfad'] === 'string' &&
    Number.isInteger(v['groesse_bytes']) &&
    (v['groesse_bytes'] as number) >= 0 &&
    isHex(v['sha256']) &&
    stampOk
  );
}

function isAuditEntry(v: unknown): v is AuditEntry {
  return (
    isObj(v) &&
    typeof v['zeitstempel'] === 'string' &&
    (v['aktion'] === 'DATEI_HINZUGEFUEGT' || v['aktion'] === 'DATEI_ENTFERNT') &&
    typeof v['pfad'] === 'string' &&
    isHex(v['sha256']) &&
    typeof v['benutzer'] === 'string'
  );
}

/** Strict shape check; throws away nothing silently. */
export function parseManifest(bytes: Uint8Array): Manifest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!isObj(raw) || raw['manifest_version'] !== MANIFEST_VERSION) return null;
  const prev = raw['vorgaenger'];
  const prevOk =
    prev === null ||
    (isObj(prev) &&
      Number.isInteger(prev['sequenz']) &&
      isHex(prev['manifest_sha256']) &&
      isHex(prev['token_sha256']));
  if (
    !Number.isInteger(raw['sequenz']) ||
    typeof raw['erstellt_am'] !== 'string' ||
    typeof raw['erstellt_von'] !== 'string' ||
    !prevOk ||
    !Array.isArray(raw['dateien']) ||
    !raw['dateien'].every(isFileEntry) ||
    !Array.isArray(raw['audit_log']) ||
    !raw['audit_log'].every(isAuditEntry)
  )
    return null;
  return raw as unknown as Manifest;
}

function auditKey(a: Pick<AuditEntry, 'aktion' | 'pfad' | 'sha256'>) {
  return `${a.aktion}|${a.pfad}|${a.sha256}`;
}

/**
 * Proves completeness: every manifest links to its predecessor (and the predecessor's stamp),
 * and the difference between two neighbouring manifests is explained exactly by the audit log.
 */
export async function verifyChain(
  links: readonly ChainLinkBytes[],
  verifyToken?: TokenVerifier,
): Promise<ChainReport> {
  const issues: ChainIssue[] = [];
  let prev: { manifest: Manifest; manifestSha256: string; tokenSha256: string } | null = null;
  let lastTime: Date | null = null;

  for (const [i, link] of links.entries()) {
    const seq = i + 1;
    const manifest = parseManifest(link.manifestBytes);
    if (!manifest) {
      issues.push({ sequenz: seq, code: 'MANIFEST_UNREADABLE' });
      return { ok: false, count: links.length, issues, last: null };
    }
    const manifestSha256 = await sha256Hex(link.manifestBytes);
    const tokenSha256 = await sha256Hex(link.tokenBytes);

    if (new TextDecoder().decode(link.manifestBytes) !== canonicalJson(manifest)) {
      issues.push({ sequenz: seq, code: 'MANIFEST_NOT_CANONICAL' });
    }
    if (manifest.sequenz !== seq) {
      issues.push({ sequenz: seq, code: 'SEQUENCE_BROKEN', detail: `found ${manifest.sequenz}` });
    }

    const expected = prev
      ? {
          sequenz: prev.manifest.sequenz,
          manifest_sha256: prev.manifestSha256,
          token_sha256: prev.tokenSha256,
        }
      : null;
    if (canonicalJson(manifest.vorgaenger) !== canonicalJson(expected)) {
      issues.push({ sequenz: seq, code: 'PREVIOUS_MISMATCH' });
    }

    const diff = diffFiles(prev?.manifest.dateien ?? [], manifest.dateien);
    for (const c of diff.changed) {
      issues.push({ sequenz: seq, code: 'FILE_OVERWRITTEN', detail: c.pfad });
    }
    const expectedAudit = [
      ...diff.added.map((f) =>
        auditKey({ aktion: 'DATEI_HINZUGEFUEGT', pfad: f.pfad, sha256: f.sha256 }),
      ),
      ...diff.removed.map((f) =>
        auditKey({ aktion: 'DATEI_ENTFERNT', pfad: f.pfad, sha256: f.sha256 }),
      ),
    ].sort();
    const actualAudit = manifest.audit_log.map(auditKey).sort();
    if (JSON.stringify(expectedAudit) !== JSON.stringify(actualAudit)) {
      issues.push({ sequenz: seq, code: 'AUDIT_LOG_MISMATCH' });
    }
    for (const a of manifest.audit_log) {
      if (a.aktion !== 'DATEI_ENTFERNT') continue;
      const decision = {
        code: a.grund_code as (typeof REMOVAL_REASONS)[number],
        note: a.begruendung ?? '',
        ...(a.ersetzt_durch !== undefined ? { replacedBy: a.ersetzt_durch } : {}),
      };
      if (!checkRemovalDecision(decision, manifest.dateien, a.pfad)) {
        issues.push({ sequenz: seq, code: 'REMOVAL_REASON_INVALID', detail: a.pfad });
      }
    }

    if (verifyToken) {
      const t = await verifyToken(manifestSha256, link.tokenBytes);
      if (!t.ok) issues.push({ sequenz: seq, code: 'TOKEN_INVALID', detail: t.reason });
      else {
        if (lastTime && t.genTime < lastTime)
          issues.push({ sequenz: seq, code: 'TIME_GOES_BACKWARDS' });
        lastTime = t.genTime;
      }
    }
    prev = { manifest, manifestSha256, tokenSha256 };
  }
  return { ok: issues.length === 0, count: links.length, issues, last: prev };
}

export type StateIssue =
  | { code: 'FILE_MISSING'; pfad: string }
  | { code: 'FILE_CHANGED'; pfad: string }
  | { code: 'FILE_UNSIGNED'; pfad: string };

export interface StateReport {
  /** Green = folder equals the last signed manifest; red = deviation; unsigned = only new files */
  light: 'gruen' | 'rot' | 'gelb';
  issues: StateIssue[];
}

/** Start-up check: do the files on disk still equal the last signed manifest? */
export function checkState(last: Manifest | null, current: readonly FileEntry[]): StateReport {
  const diff = diffFiles(last?.dateien ?? [], current);
  const issues: StateIssue[] = [
    ...diff.removed.map((f) => ({ code: 'FILE_MISSING' as const, pfad: f.pfad })),
    ...diff.changed.map((c) => ({ code: 'FILE_CHANGED' as const, pfad: c.pfad })),
    ...diff.added.map((f) => ({ code: 'FILE_UNSIGNED' as const, pfad: f.pfad })),
  ];
  const red = issues.some((i) => i.code !== 'FILE_UNSIGNED');
  return { light: red ? 'rot' : issues.length ? 'gelb' : 'gruen', issues };
}
