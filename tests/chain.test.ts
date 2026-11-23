import { canonicalJson, utf8 } from '../src/logic/canonical.ts';
import { checkState, parseManifest, verifyChain } from '../src/logic/chain.ts';
import { buildChain, fakeToken, fakeVerifier, file } from './helpers.ts';

const A = '10042/2026/2026-10-01_Immatrikulation_Mueller.pdf';
const B = '10042/2026/2026-10-02_A1_Mueller.pdf';
const C = '10042/2026/2026-10-03_Krankenkasse_Mueller.pdf';

async function threeSteps() {
  const a = await file(A, 'a');
  const b = await file(B, 'b');
  const c = await file(C, 'c');
  return buildChain([
    { files: [a] },
    { files: [a, b] },
    {
      files: [b, c],
      removals: { [A]: { code: 'FEHLABLAGE', note: 'Fehlablage, privates Dokument' } },
    },
  ]);
}

const codes = (r: Awaited<ReturnType<typeof verifyChain>>) => r.issues.map((i) => i.code);

describe('verifyChain', () => {
  it('accepts an intact chain including a documented removal', async () => {
    const { links } = await threeSteps();
    const r = await verifyChain(links, fakeVerifier);
    expect(r).toMatchObject({ ok: true, count: 3, issues: [] });
    expect(r.last?.manifest.sequenz).toBe(3);
  });

  it('accepts an empty archive', async () => {
    expect(await verifyChain([], fakeVerifier)).toMatchObject({ ok: true, count: 0, last: null });
  });

  it('detects a manifest that was deleted from the middle (gap)', async () => {
    const { links } = await threeSteps();
    const r = await verifyChain([links[0]!, links[2]!], fakeVerifier);
    expect(codes(r)).toContain('SEQUENCE_BROKEN');
    expect(codes(r)).toContain('PREVIOUS_MISMATCH');
  });

  it('detects a deleted last manifest only via the state check, not as a broken chain', async () => {
    const { links } = await threeSteps();
    const r = await verifyChain(links.slice(0, 2), fakeVerifier);
    expect(r.ok).toBe(true);
    // The folder still has the files of manifest 3 → state check reports them as unsigned.
    const c = await file(C, 'c');
    expect(checkState(r.last!.manifest, [await file(B, 'b'), c]).light).toBe('rot');
  });

  it('detects a swapped timestamp token (chain carries the token hash)', async () => {
    const { links, planned } = await threeSteps();
    const forged = [...links];
    forged[0] = {
      ...links[0]!,
      tokenBytes: fakeToken(planned[0]!.sha256, '2026-11-16T10:00:59.000Z'),
    };
    expect(codes(await verifyChain(forged, fakeVerifier))).toContain('PREVIOUS_MISMATCH');
  });

  it('detects a token that stamps a different hash', async () => {
    const { links } = await threeSteps();
    const forged = [...links];
    forged[1] = { ...links[1]!, tokenBytes: fakeToken('0'.repeat(64), '2026-11-16T10:01:00.000Z') };
    expect(codes(await verifyChain(forged, fakeVerifier))).toContain('TOKEN_INVALID');
  });

  it('detects timestamps that go backwards', async () => {
    const a = await file(A, 'a');
    const b = await file(B, 'b');
    const { links } = await buildChain([
      { files: [a], at: '2026-11-16T12:00:00.000Z' },
      { files: [a, b], at: '2026-11-16T11:00:00.000Z' },
    ]);
    expect(codes(await verifyChain(links, fakeVerifier))).toContain('TIME_GOES_BACKWARDS');
  });

  it('detects an edited manifest (non-canonical bytes and broken successor link)', async () => {
    const { links } = await threeSteps();
    const m = parseManifest(links[0]!.manifestBytes)!;
    const tampered = { ...m, erstellt_von: 'Anderer' };
    const forged = [...links];
    forged[0] = { ...links[0]!, manifestBytes: utf8(JSON.stringify(tampered, null, 2)) };
    const c = codes(await verifyChain(forged, fakeVerifier));
    expect(c).toContain('MANIFEST_NOT_CANONICAL');
    expect(c).toContain('TOKEN_INVALID');
    expect(c).toContain('PREVIOUS_MISMATCH');
  });

  it('detects a file silently dropped from a manifest (audit log does not explain it)', async () => {
    const { links } = await threeSteps();
    const m = parseManifest(links[1]!.manifestBytes)!;
    const dropped = { ...m, dateien: m.dateien.filter((f) => f.pfad !== B) };
    const forged = [...links];
    forged[1] = { ...links[1]!, manifestBytes: utf8(canonicalJson(dropped)) };
    expect(codes(await verifyChain(forged))).toContain('AUDIT_LOG_MISMATCH');
  });

  it('detects an overwritten file between two manifests', async () => {
    const a = await file(A, 'a');
    const { links } = await buildChain([{ files: [a] }, { files: [await file(B, 'b'), a] }]);
    const m = parseManifest(links[1]!.manifestBytes)!;
    const evil = {
      ...m,
      dateien: m.dateien.map((f) => (f.pfad === A ? { ...f, sha256: 'f'.repeat(64) } : f)),
    };
    const forged = [links[0]!, { ...links[1]!, manifestBytes: utf8(canonicalJson(evil)) }];
    expect(codes(await verifyChain(forged))).toContain('FILE_OVERWRITTEN');
  });

  it('detects a removal logged with an invalid reason', async () => {
    const { links } = await threeSteps();
    const m = parseManifest(links[2]!.manifestBytes)!;
    const evil = {
      ...m,
      audit_log: m.audit_log.map((e) =>
        e.aktion === 'DATEI_ENTFERNT' ? { ...e, begruendung: 'x' } : e,
      ),
    };
    const forged = [
      links[0]!,
      links[1]!,
      { ...links[2]!, manifestBytes: utf8(canonicalJson(evil)) },
    ];
    expect(codes(await verifyChain(forged))).toContain('REMOVAL_REASON_INVALID');
  });

  it('reports an unreadable manifest instead of throwing', async () => {
    const r = await verifyChain([{ manifestBytes: utf8('{kaputt'), tokenBytes: utf8('x') }]);
    expect(codes(r)).toEqual(['MANIFEST_UNREADABLE']);
  });
});

describe('parseManifest', () => {
  it('rejects a wrong version and invalid hashes', async () => {
    const { links } = await threeSteps();
    const m = parseManifest(links[0]!.manifestBytes)!;
    expect(parseManifest(utf8(JSON.stringify({ ...m, manifest_version: '9' })))).toBeNull();
    const bad = { ...m, dateien: [{ ...m.dateien[0]!, sha256: 'XYZ' }] };
    expect(parseManifest(utf8(JSON.stringify(bad)))).toBeNull();
  });
});

describe('checkState (start-up traffic light)', () => {
  it('is green when the folder equals the last manifest', async () => {
    const { previous } = await threeSteps();
    const cur = previous.manifest.dateien;
    expect(checkState(previous.manifest, cur)).toEqual({ light: 'gruen', issues: [] });
  });

  it('is red for a missing file, red for a changed file, yellow for a new file', async () => {
    const { previous } = await threeSteps();
    const cur = previous.manifest.dateien;
    expect(checkState(previous.manifest, cur.slice(1)).light).toBe('rot');
    const changed = [{ ...cur[0]!, sha256: 'e'.repeat(64) }, ...cur.slice(1)];
    expect(checkState(previous.manifest, changed).light).toBe('rot');
    const extra = [...cur, await file('10042/2026/neu.pdf', 'n')];
    expect(checkState(previous.manifest, extra)).toMatchObject({
      light: 'gelb',
      issues: [{ code: 'FILE_UNSIGNED', pfad: '10042/2026/neu.pdf' }],
    });
  });

  it('is green for a brand-new empty archive', () => {
    expect(checkState(null, []).light).toBe('gruen');
  });
});
