import { sha256Hex, utf8 } from '../src/logic/canonical.ts';
import {
  planManifest,
  type PlannedManifest,
  type PreviousLink,
  type RemovalDecision,
} from '../src/logic/manifest.ts';
import type { ChainLinkBytes, TokenVerifier } from '../src/logic/chain.ts';
import type { FileEntry } from '../src/logic/model.ts';

export async function file(pfad: string, content: string): Promise<FileEntry> {
  const bytes = utf8(content);
  return {
    pfad,
    groesse_bytes: bytes.length,
    sha256: await sha256Hex(bytes),
    zeitstempel: { art: 'eingebettet' },
  };
}

/** A fake TSA: the "token" is the stamped hash plus a time; enough to test the chain logic. */
export const fakeToken = (manifestSha256: string, iso: string) =>
  utf8(`TST|${manifestSha256}|${iso}`);

export const fakeVerifier: TokenVerifier = async (hash, token) => {
  const [tag, h, iso] = new TextDecoder().decode(token).split('|');
  if (tag !== 'TST' || h !== hash || !iso) return { ok: false, reason: 'imprint mismatch' };
  return { ok: true, genTime: new Date(iso) };
};

export interface Step {
  files: FileEntry[];
  removals?: Record<string, RemovalDecision>;
  at?: string;
}

/** Runs several plan → stamp steps and returns the stored links plus the last PreviousLink. */
export async function buildChain(steps: Step[]) {
  const links: ChainLinkBytes[] = [];
  let previous: PreviousLink | null = null;
  const planned: PlannedManifest[] = [];
  for (const [i, s] of steps.entries()) {
    const iso = s.at ?? new Date(Date.UTC(2026, 10, 16, 10, i)).toISOString();
    const r = await planManifest({
      previous,
      current: s.files,
      user: 'M. Mustermann',
      now: new Date(iso),
      removals: s.removals ?? {},
    });
    if (!r.ok) throw new Error(`step ${i}: ${r.reason} ${r.detail?.join(',') ?? ''}`);
    const tokenBytes = fakeToken(r.value.sha256, iso);
    links.push({ manifestBytes: r.value.bytes, tokenBytes });
    planned.push(r.value);
    previous = {
      manifest: r.value.manifest,
      manifestSha256: r.value.sha256,
      tokenSha256: await sha256Hex(tokenBytes),
    };
  }
  return { links, previous: previous!, planned };
}
