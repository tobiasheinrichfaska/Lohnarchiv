import { canonicalJson, sha256Hex } from '../src/logic/canonical.ts';
import { planManifest } from '../src/logic/manifest.ts';
import { buildChain, file } from './helpers.ts';

const A = '10042/2026/2026-10-01_Immatrikulation_Mueller.pdf';
const B = '10042/2026/2026-10-02_A1_Mueller.pdf';
const now = new Date('2026-11-16T15:30:00Z');

describe('canonicalJson / sha256', () => {
  it('sorts keys and ignores undefined', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
  });
  it('rejects NaN', () => {
    expect(() => canonicalJson({ a: NaN })).toThrow();
  });
  it('matches the known SHA-256 of the empty input', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('planManifest', () => {
  it('creates manifest 1 with no predecessor and an audit entry per new file', async () => {
    const { planned } = await buildChain([{ files: [await file(A, 'x')] }]);
    const m = planned[0]!.manifest;
    expect(m.sequenz).toBe(1);
    expect(m.vorgaenger).toBeNull();
    expect(m.audit_log.map((a) => [a.aktion, a.pfad])).toEqual([['DATEI_HINZUGEFUEGT', A]]);
  });

  it('links manifest 2 to the hash of manifest 1 and of its token', async () => {
    const { planned, links } = await buildChain([
      { files: [await file(A, 'x')] },
      { files: [await file(A, 'x'), await file(B, 'y')] },
    ]);
    const v = planned[1]!.manifest.vorgaenger!;
    expect(v.sequenz).toBe(1);
    expect(v.manifest_sha256).toBe(planned[0]!.sha256);
    expect(v.token_sha256).toBe(await sha256Hex(links[0]!.tokenBytes));
  });

  it('is deterministic: file order does not change the bytes', async () => {
    const f = [await file(A, 'x'), await file(B, 'y')];
    const one = await planManifest({ previous: null, current: f, user: 'U', now, removals: {} });
    const two = await planManifest({
      previous: null,
      current: [...f].reverse(),
      user: 'U',
      now,
      removals: {},
    });
    expect(one.ok && two.ok && one.value.sha256 === two.value.sha256).toBe(true);
  });

  it('refuses an empty user', async () => {
    const r = await planManifest({
      previous: null,
      current: [await file(A, 'x')],
      user: '  ',
      now,
      removals: {},
    });
    expect(r).toMatchObject({ ok: false, reason: 'USER_REQUIRED' });
  });

  it('refuses a new file with a non-conformant path', async () => {
    const r = await planManifest({
      previous: null,
      current: [await file('10042/2026/Müller scan.pdf', 'x')],
      user: 'U',
      now,
      removals: {},
    });
    expect(r).toMatchObject({ ok: false, reason: 'PATH_INVALID' });
  });

  it('refuses paths that collide in upper/lower case', async () => {
    const r = await planManifest({
      previous: null,
      current: [await file('10042/2026/a.pdf', '1'), await file('10042/2026/A.pdf', '2')],
      user: 'U',
      now,
      removals: {},
    });
    expect(r).toMatchObject({ ok: false, reason: 'CASE_COLLISION' });
  });

  it('refuses nothing-changed', async () => {
    const files = [await file(A, 'x')];
    const { previous } = await buildChain([{ files }]);
    const r = await planManifest({ previous, current: files, user: 'U', now, removals: {} });
    expect(r).toMatchObject({ ok: false, reason: 'NOTHING_CHANGED' });
  });

  it('blocks when a signed file was overwritten', async () => {
    const { previous } = await buildChain([{ files: [await file(A, 'x')] }]);
    const r = await planManifest({
      previous,
      current: [await file(A, 'CHANGED')],
      user: 'U',
      now,
      removals: {},
    });
    expect(r).toMatchObject({ ok: false, reason: 'FILE_CHANGED', detail: [A] });
  });

  describe('removal workflow', () => {
    const setup = async () => {
      const a = await file(A, 'x');
      const b = await file(B, 'y');
      const { previous } = await buildChain([{ files: [a, b] }]);
      return { a, b, previous };
    };

    it('blocks a missing signed file until a decision exists', async () => {
      const { b, previous } = await setup();
      const r = await planManifest({ previous, current: [b], user: 'U', now, removals: {} });
      expect(r).toMatchObject({ ok: false, reason: 'REMOVAL_DECISION_MISSING', detail: [A] });
    });

    it('writes old name, old hash, user, reason and time into the audit log', async () => {
      const { a, b, previous } = await setup();
      const r = await planManifest({
        previous,
        current: [b],
        user: 'M. Mustermann',
        now,
        removals: { [A]: { code: 'FEHLABLAGE', note: 'Leeres Scan-Blatt ohne Belegfunktion' } },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.manifest.dateien.map((f) => f.pfad)).toEqual([B]);
      expect(r.value.manifest.audit_log).toEqual([
        {
          zeitstempel: now.toISOString(),
          aktion: 'DATEI_ENTFERNT',
          pfad: A,
          sha256: a.sha256,
          benutzer: 'M. Mustermann',
          grund_code: 'FEHLABLAGE',
          begruendung: 'Leeres Scan-Blatt ohne Belegfunktion',
        },
      ]);
    });

    it.each([
      ['note too short', { code: 'FEHLABLAGE' as const, note: 'x' }],
      ['unknown reason', { code: 'EGAL' as never, note: 'irgendein Grund' }],
      ['replacement missing', { code: 'DUPLIKAT' as const, note: 'Duplikat von anderer Datei' }],
      [
        'replacement does not exist',
        { code: 'DUPLIKAT' as const, note: 'Duplikat', replacedBy: 'x/2026/n.pdf' },
      ],
    ])('rejects an invalid decision: %s', async (_label, decision) => {
      const { b, previous } = await setup();
      const r = await planManifest({
        previous,
        current: [b],
        user: 'U',
        now,
        removals: { [A]: decision },
      });
      expect(r).toMatchObject({ ok: false, reason: 'REMOVAL_DECISION_INVALID' });
    });

    it('accepts DUPLIKAT when the replacement is still in the archive', async () => {
      const { b, previous } = await setup();
      const r = await planManifest({
        previous,
        current: [b],
        user: 'U',
        now,
        removals: { [A]: { code: 'DUPLIKAT', note: 'Duplikat von A1', replacedBy: B } },
      });
      expect(r.ok && r.value.manifest.audit_log[0]?.ersetzt_durch).toBe(B);
    });
  });
});
