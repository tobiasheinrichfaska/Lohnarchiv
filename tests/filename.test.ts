import { checkArchivePath, proposeFileName, sanitizeFileName } from '../src/logic/filename.ts';

const name = (input: string) => {
  const r = sanitizeFileName(input);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('sanitizeFileName', () => {
  it('keeps a conformant name unchanged', () => {
    expect(name('2026-11-16_Immatrikulation_Mueller.pdf')).toEqual({
      name: '2026-11-16_Immatrikulation_Mueller.pdf',
      changed: false,
    });
  });

  it('transliterates umlauts and ß, replaces spaces', () => {
    expect(name('Bescheinigung Müller Größe ÄÖÜ.PDF').name).toBe(
      'Bescheinigung_Mueller_Groesse_AeOeUe.pdf',
    );
  });

  it('drops accents and special characters', () => {
    expect(name('café (Kopie) #1!.png').name).toBe('cafe_Kopie_1.png');
  });

  it('limits to 64 characters including the extension', () => {
    const n = name(`${'a'.repeat(100)}.pdf`).name;
    expect(n.length).toBe(64);
    expect(n.endsWith('.pdf')).toBe(true);
  });

  it('never ends the base name with a separator after truncation', () => {
    const n = name(`${'a'.repeat(59)}_bbbb.pdf`).name;
    expect(n).toBe(`${'a'.repeat(59)}.pdf`);
  });

  it.each(['x.exe', 'x.docx', 'x', 'x.pdf.exe', 'x.'])('rejects extension of %s', (f) => {
    expect(sanitizeFileName(f)).toMatchObject({ ok: false, reason: 'EXTENSION_NOT_ALLOWED' });
  });

  it('rejects a name that becomes empty', () => {
    expect(sanitizeFileName('äö!!.pdf').ok).toBe(true);
    expect(sanitizeFileName('!!!.pdf')).toMatchObject({ ok: false, reason: 'NAME_EMPTY' });
  });

  it('avoids Windows device names', () => {
    expect(name('CON.pdf').name).toBe('CON_x.pdf');
  });

  it.each(['jpg', 'jpeg', 'bmp', 'png', 'tif', 'tiff'])('accepts .%s', (ext) => {
    expect(name(`a.${ext}`).name).toBe(`a.${ext}`);
  });
});

describe('proposeFileName', () => {
  it('builds date_type_person.ext', () => {
    const r = proposeFileName({
      date: '2026-11-16',
      type: 'Immatrikulation',
      person: 'Müller',
      ext: 'pdf',
    });
    expect(r).toMatchObject({
      ok: true,
      value: { name: '2026-11-16_Immatrikulation_Mueller.pdf' },
    });
  });
  it('rejects an impossible date', () => {
    const r = proposeFileName({ date: '2026-13-45', type: 'a', person: 'b', ext: 'pdf' });
    expect(r).toMatchObject({ ok: false, reason: 'DATE_INVALID' });
  });
});

describe('checkArchivePath', () => {
  it('accepts personalnummer/jahr/datei', () => {
    expect(checkArchivePath('10042/2026/2026-10-01_Immatrikulation_Mueller.pdf').ok).toBe(true);
  });
  it.each([
    ['10042/2026', 'PATH_SEGMENTS'],
    ['a/b/c/d.pdf', 'PATH_SEGMENTS'],
    ['10042/26/x.pdf', 'PATH_SEGMENT_INVALID'],
    ['../2026/x.pdf', 'PATH_SEGMENT_INVALID'],
    ['100 42/2026/x.pdf', 'PATH_SEGMENT_INVALID'],
    ['10042/2026/Müller.pdf', 'NAME_NOT_CONFORM'],
    ['10042/2026/x.exe', 'EXTENSION_NOT_ALLOWED'],
  ])('rejects %s', (p, reason) => {
    expect(checkArchivePath(p)).toMatchObject({ ok: false, reason });
  });
});
