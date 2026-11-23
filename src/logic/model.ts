// Data model of the archive. JSON keys are German on purpose: the manifest is read by auditors.

export const MANIFEST_VERSION = '1.0';

export const LIMITS = {
  fileNameMax: 64,
  pathSegmentMax: 64,
  userMax: 80,
  noteMin: 5,
  noteMax: 500,
} as const;

export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'bmp', 'png', 'tif', 'tiff'] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

/** How a stored file is time-stamped: inside the PDF (DocTimeStamp) or as a detached RFC 3161 token. */
export type StampRef =
  { art: 'eingebettet' } | { art: 'getrennt'; token_pfad: string; token_sha256: string };

export interface FileEntry {
  pfad: string;
  groesse_bytes: number;
  sha256: string;
  zeitstempel: StampRef;
}

/** Technical corrections only; valid payroll documents must never be removed. */
export const REMOVAL_REASONS = ['FEHLABLAGE', 'UNLESERLICH_ERSETZT', 'DUPLIKAT'] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

export type AuditAction = 'DATEI_HINZUGEFUEGT' | 'DATEI_ENTFERNT';

export interface AuditEntry {
  zeitstempel: string;
  aktion: AuditAction;
  pfad: string;
  sha256: string;
  benutzer: string;
  /** Only for DATEI_ENTFERNT */
  grund_code?: RemovalReason;
  begruendung?: string;
  /** Only for UNLESERLICH_ERSETZT / DUPLIKAT: the path that stays */
  ersetzt_durch?: string;
}

export interface PreviousRef {
  sequenz: number;
  manifest_sha256: string;
  /** SHA-256 of the timestamp token (.tsr) of the previous manifest: the chain links the stamp too */
  token_sha256: string;
}

export interface Manifest {
  manifest_version: typeof MANIFEST_VERSION;
  sequenz: number;
  /** Device clock, informational. The trusted time is the genTime of the timestamp token. */
  erstellt_am: string;
  erstellt_von: string;
  vorgaenger: PreviousRef | null;
  dateien: FileEntry[];
  /** Entries of THIS step only; the chain of manifests gives the complete history */
  audit_log: AuditEntry[];
}

export type Result<T, R extends string = string> =
  { ok: true; value: T } | { ok: false; reason: R; detail?: string[] };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const fail = <R extends string>(reason: R, detail?: string[]) =>
  detail ? ({ ok: false, reason, detail } as const) : ({ ok: false, reason } as const);
