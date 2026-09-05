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
  const sheet = workbook.worksheets[0];
  return {
    headers: (sheet.getRow(1).values as unknown[]).slice(1).map(String),
    rowAt: (index: number) =>
      (sheet.getRow(index).values as unknown[]).slice(1).map(String),
    rowCount: sheet.rowCount,
  };
}

describe('buildUserDirectoryWorkbook', () => {
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
