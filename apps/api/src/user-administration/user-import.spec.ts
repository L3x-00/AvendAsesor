import { Workbook } from 'exceljs';
import { parseUserImportWorkbook, USER_IMPORT_ROW_LIMIT } from './user-import';

const NOW = Date.parse('2026-09-05T12:00:00.000Z');

async function workbookOf(
  rows: unknown[][],
  headers: string[] = [
    'Nombre y apellidos',
    'Correo',
    'Celular',
    'Inicio',
    'Fin',
  ],
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Usuarios');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseUserImportWorkbook', () => {
  it('accepts a valid roster and converts days to Lima boundaries', async () => {
    const file = await workbookOf([
      [
        '  Ana Docente  ',
        '  ANA@Example.TEST ',
        '987654321',
        '2027-01-01',
        '2027-12-31',
      ],
    ]);

    const parsed = await parseUserImportWorkbook(file, NOW);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        accessExpiresAt: '2028-01-01T04:59:59.999Z',
        accessStartAt: '2027-01-01T05:00:00.000Z',
        email: 'ana@example.test',
        fullName: 'Ana Docente',
        phone: '987654321',
        rowNumber: 2,
      },
    ]);
  });

  it('accepts a day written in the local format teachers use', async () => {
    const file = await workbookOf([
      ['Luis Docente', 'luis@example.test', null, null, '31/12/2027'],
    ]);

    const parsed = await parseUserImportWorkbook(file, NOW);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].accessExpiresAt).toBe('2028-01-01T04:59:59.999Z');
  });

  it('imports the valid rows and reports each rejected one by row number', async () => {
    const file = await workbookOf([
      ['Ana Docente', 'ana@example.test', null, null, null],
      ['Correo Malo', 'sin-arroba', null, null, null],
      ['Ana Repetida', 'ANA@example.test', null, null, null],
      ['X', 'corto@example.test', null, null, null],
      ['Vencida Ya', 'vencida@example.test', null, null, '2020-01-01'],
    ]);

    const parsed = await parseUserImportWorkbook(file, NOW);

    expect(parsed.rows.map((row) => row.email)).toEqual(['ana@example.test']);
    expect(parsed.errors.map((error) => error.rowNumber)).toEqual([3, 4, 5, 6]);
    expect(parsed.errors[0].message).toContain('correo');
    expect(parsed.errors[1].message).toContain('repetido');
    expect(parsed.errors[2].message).toContain('nombre');
    expect(parsed.errors[3].message).toContain('ya pasó');
  });

  it('rejects a window that starts after it ends', async () => {
    const file = await workbookOf([
      ['Ana Docente', 'ana@example.test', null, '2027-12-31', '2027-01-01'],
    ]);

    const parsed = await parseUserImportWorkbook(file, NOW);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0].message).toContain('posterior');
  });

  it('refuses a file without the required columns', async () => {
    const file = await workbookOf([['algo']], ['Columna rara']);

    const parsed = await parseUserImportWorkbook(file, NOW);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0].message).toContain('Nombre y apellidos');
  });

  it('ignores blank rows left in the middle of the sheet', async () => {
    const file = await workbookOf([
      ['Ana Docente', 'ana@example.test', null, null, null],
      [null, null, null, null, null],
      ['Luis Docente', 'luis@example.test', null, null, null],
    ]);

    const parsed = await parseUserImportWorkbook(file, NOW);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.errors).toEqual([]);
  });

  it('stops at the row limit and says the file was truncated', async () => {
    const rows = Array.from(
      { length: USER_IMPORT_ROW_LIMIT + 5 },
      (_, index) => [
        `Docente ${index}`,
        `docente${index}@example.test`,
        null,
        null,
        null,
      ],
    );

    const parsed = await parseUserImportWorkbook(await workbookOf(rows), NOW);

    expect(parsed.rows).toHaveLength(USER_IMPORT_ROW_LIMIT);
    expect(parsed.truncated).toBe(true);
  });
});
