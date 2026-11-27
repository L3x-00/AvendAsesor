import { Workbook } from 'exceljs';
import { buildUserDirectoryWorkbook } from './user-directory-export';
import { parseUserImportWorkbook } from './user-import';
import type { AdministrativeUserDirectoryEntry } from './user-administration.gateway';

const user: AdministrativeUserDirectoryEntry = {
  accessExpiresAt: '2028-01-01T04:59:59.999Z',
  accessStartAt: '2027-01-01T05:00:00.000Z',
  accessState: 'activo',
  accountStatus: 'active',
  createdByName: 'Superadministrador Demo',
  email: 'ana@example.test',
  fullName: 'Ana Docente',
  id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
  lastAccessAt: null,
  phone: '987654321',
  role: 'docente',
  updatedAt: '2026-09-01T15:00:00.000Z',
  updatedByName: 'Superadministrador Demo',
};

async function rosterWith(endDay: string): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Usuarios');
  sheet.addRow(['Nombre y apellidos', 'Correo', 'Fin']);
  sheet.addRow(['Ana Docente', 'ana@example.test', endDay]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function read(buffer: Buffer) {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet('Usuarios');
  if (!sheet) throw new Error('Falta la hoja Usuarios');
  return {
    workbook,
    headers: (sheet.getRow(1).values as unknown[]).slice(1).map(String),
    rowAt: (index: number) =>
      (sheet.getRow(index).values as unknown[]).slice(1).map(String),
    rowCount: sheet.rowCount,
  };
}

describe('buildUserDirectoryWorkbook', () => {
  it('genera un xlsx binario válido (no un JSON de Buffer)', async () => {
    const buffer = await buildUserDirectoryWorkbook([user]);

    // Un xlsx es un ZIP: debe empezar por "PK" (0x50 0x4b), nunca por "{".
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(
      buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])),
    ).toBeGreaterThan(0);
  });

  it('incluye portada institucional con logo y metadatos', async () => {
    const buffer = await buildUserDirectoryWorkbook([user], 3);
    const { workbook } = await read(buffer);

    const cover = workbook.getWorksheet('Portada');
    expect(cover).toBeDefined();
    const cellText = (ref: string) =>
      typeof cover?.getCell(ref).value === 'string'
        ? (cover.getCell(ref).value as string)
        : '';
    expect(cellText('B10')).toContain('AVEND ASESOR');
    expect(cellText('B11')).toContain('Directorio de usuarios');
    // El logo se incrusta en el libro: el ZIP resultante debe contener el
    // directorio de imágenes de Excel (xl/media/).
    const zipText = buffer.toString('latin1');
    expect(zipText).toContain('xl/media/');
    expect(cellText('C17')).toContain('de 3');
    expect(cellText('C18')).toContain('limitada');
    expect(workbook.creator).toBe('AVEND ASESOR');
  });

  it('aplica estilo de cabecera y filtro sin romper la fila 1', async () => {
    const { workbook } = await read(await buildUserDirectoryWorkbook([user]));
    const sheet = workbook.getWorksheet('Usuarios');

    expect(sheet?.getRow(1).font?.bold).toBe(true);
    expect(sheet?.getRow(1).fill).toMatchObject({ type: 'pattern' });
    expect(sheet?.getRow(1).height).toBeGreaterThan(0);
    expect(sheet?.views[0]?.state).toBe('frozen');
    expect(sheet?.getRow(1).getCell(1).value).toBe('Nombre y apellidos');
  });

  it('exports every column the specification lists', async () => {
    const sheet = await read(await buildUserDirectoryWorkbook([user]));

    expect(sheet.headers).toEqual([
      'Nombre y apellidos',
      'Correo',
      'Celular',
      'Rol',
      'Inicio',
      'Fin',
      'Estado',
      'Última modificación',
      'Creado por',
      'Modificado por',
    ]);
  });

  it('writes readable values instead of raw enums or instants', async () => {
    const sheet = await read(await buildUserDirectoryWorkbook([user]));
    const row = sheet.rowAt(2);

    expect(row[0]).toBe('Ana Docente');
    expect(row[1]).toBe('ana@example.test');
    expect(row[3]).toBe('Docente');
    expect(row[6]).toBe('Activo');
    // La vigencia se lee como el dia visto en Lima, no como el instante UTC.
    expect(row[4]).toBe('01/01/2027');
    expect(row[5]).toBe('31/12/2027');
    expect(row[8]).toBe('Superadministrador Demo');
  });

  it('el archivo exportado con portada se puede reimportar', async () => {
    // Ida y vuelta con el buffer REAL (incluye la portada), no con una
    // plantilla artificial: el importador debe encontrar la hoja "Usuarios".
    const exported = await buildUserDirectoryWorkbook([user]);
    const parsed = await parseUserImportWorkbook(
      exported,
      Date.parse('2026-09-05T12:00:00.000Z'),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].email).toBe('ana@example.test');
  });

  it('writes days the importer can read back', async () => {
    const sheet = await read(await buildUserDirectoryWorkbook([user]));
    const exportedEnd = sheet.rowAt(2)[5];

    // Cierra el ciclo exportar -> corregir -> reimportar.
    const parsed = await parseUserImportWorkbook(
      await rosterWith(exportedEnd),
      Date.parse('2026-09-05T12:00:00.000Z'),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].accessExpiresAt).toBe('2028-01-01T04:59:59.999Z');
  });

  it('leaves missing contact data empty rather than printing null', async () => {
    const sheet = await read(
      await buildUserDirectoryWorkbook([
        { ...user, createdByName: null, email: null, phone: null },
      ]),
    );
    const row = sheet.rowAt(2);

    expect(row[1]).toBe('');
    expect(row[2]).toBe('');
  });

  it('says so when the export was truncated instead of looking complete', async () => {
    const buffer = await buildUserDirectoryWorkbook([user], 250);
    const sheet = await read(buffer);
    const note = sheet.rowAt(sheet.rowCount).join(' ');

    expect(note).toContain('limitada a 1 de 250');
  });
});
