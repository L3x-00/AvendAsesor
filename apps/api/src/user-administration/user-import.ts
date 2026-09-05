import { Workbook } from 'exceljs';

/** One file per load. Each row costs an identity call, so the file is bounded. */
export const USER_IMPORT_ROW_LIMIT = 300;
export const USER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/** Peru has no daylight saving time, so America/Lima is a fixed UTC-05:00. */
const LIMA_OFFSET_MINUTES = -5 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DAY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

export interface ParsedImportRow {
  accessExpiresAt: string | null;
  accessStartAt: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  rowNumber: number;
}

export interface ImportRowError {
  email: string | null;
  message: string;
  rowNumber: number;
}

export interface ParsedUserImport {
  errors: ImportRowError[];
  rows: ParsedImportRow[];
  truncated: boolean;
}

/**
 * Excel cells are not always primitives: a formula, a hyperlink or rich text
 * arrives as an object. Stringifying those blindly yields "[object Object]",
 * which would silently corrupt a name or an address.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const cell = value as { result?: unknown; text?: unknown };
    if (typeof cell.text === 'string') return cell.text.trim();
    if (typeof cell.result === 'string') return cell.result.trim();
    if (typeof cell.result === 'number') return String(cell.result);
  }

  return '';
}

function normalizeHeader(value: unknown): string {
  return cellText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  celular: 'phone',
  correo: 'email',
  correoelectronico: 'email',
  email: 'email',
  fechadefin: 'accessExpiresAt',
  fechadeinicio: 'accessStartAt',
  fin: 'accessExpiresAt',
  inicio: 'accessStartAt',
  nombre: 'fullName',
  nombreyapellidos: 'fullName',
  nombres: 'fullName',
  telefono: 'phone',
};

function calendarDay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // ExcelJS materialises date cells at UTC midnight for the typed day.
    const year = value.getUTCFullYear();
    const month = `${value.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${value.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const text = cellText(value);
  const iso = ISO_DAY.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const local = LOCAL_DAY.exec(text);
  if (local) {
    const day = local[1].padStart(2, '0');
    const month = local[2].padStart(2, '0');
    return `${local[3]}-${month}-${day}`;
  }

  return null;
}

function limaInstant(day: string, endOfDay: boolean): string | null {
  const match = ISO_DAY.exec(day);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== date
  ) {
    return null;
  }

  const millis = endOfDay ? 86_399_999 : 0;
  return new Date(
    probe.getTime() - LIMA_OFFSET_MINUTES * 60_000 + millis,
  ).toISOString();
}

/**
 * Reads the roster and validates every row on its own. A row that fails is
 * reported with its spreadsheet row number so the administrator can fix it;
 * the valid rows are still returned for import.
 */
export async function parseUserImportWorkbook(
  buffer: Buffer,
  now: number = Date.now(),
): Promise<ParsedUserImport> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      errors: [
        {
          email: null,
          message: 'El archivo no tiene ninguna hoja.',
          rowNumber: 0,
        },
      ],
      rows: [],
      truncated: false,
    };
  }

  const headerRow = sheet.getRow(1);
  const columns = new Map<number, keyof ParsedImportRow>();
  headerRow.eachCell((cell, columnNumber) => {
    const alias = HEADER_ALIASES[normalizeHeader(cell.value)];
    if (alias) columns.set(columnNumber, alias);
  });

  const hasName = [...columns.values()].includes('fullName');
  const hasEmail = [...columns.values()].includes('email');
  if (!hasName || !hasEmail) {
    return {
      errors: [
        {
          email: null,
          message:
            'La primera fila debe tener al menos las columnas "Nombre y apellidos" y "Correo".',
          rowNumber: 1,
        },
      ],
      rows: [],
      truncated: false,
    };
  }

  const rows: ParsedImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seenEmails = new Set<string>();
  let considered = 0;
  let truncated = false;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: Partial<Record<keyof ParsedImportRow, unknown>> = {};
    let empty = true;

    for (const [columnNumber, field] of columns) {
      const raw = row.getCell(columnNumber).value;
      values[field] = raw;
      if (cellText(raw) !== '') empty = false;
    }

    if (empty) continue;

    considered += 1;
    if (considered > USER_IMPORT_ROW_LIMIT) {
      truncated = true;
      break;
    }

    const fullName = cellText(values.fullName);
    const email = cellText(values.email).toLowerCase();
    const phone = cellText(values.phone) || null;

    if (fullName.length < 2 || fullName.length > 160) {
      errors.push({
        email: email || null,
        message: 'El nombre debe tener entre 2 y 160 caracteres.',
        rowNumber,
      });
      continue;
    }

    if (!EMAIL_PATTERN.test(email)) {
      errors.push({
        email: email || null,
        message: 'El correo electrónico no es válido.',
        rowNumber,
      });
      continue;
    }

    if (seenEmails.has(email)) {
      errors.push({
        email,
        message: 'El correo está repetido dentro del archivo.',
        rowNumber,
      });
      continue;
    }

    if (phone !== null && (phone.length < 6 || phone.length > 20)) {
      errors.push({
        email,
        message: 'El celular debe tener entre 6 y 20 caracteres.',
        rowNumber,
      });
      continue;
    }

    const startDay = calendarDay(values.accessStartAt);
    const endDay = calendarDay(values.accessExpiresAt);

    if (values.accessStartAt && !startDay) {
      errors.push({
        email,
        message: 'La fecha de inicio no es una fecha válida.',
        rowNumber,
      });
      continue;
    }
    if (values.accessExpiresAt && !endDay) {
      errors.push({
        email,
        message: 'La fecha de fin no es una fecha válida.',
        rowNumber,
      });
      continue;
    }

    const accessStartAt = startDay ? limaInstant(startDay, false) : null;
    const accessExpiresAt = endDay ? limaInstant(endDay, true) : null;

    if ((startDay && !accessStartAt) || (endDay && !accessExpiresAt)) {
      errors.push({
        email,
        message: 'La fecha no corresponde a un día real del calendario.',
        rowNumber,
      });
      continue;
    }

    if (
      accessStartAt &&
      accessExpiresAt &&
      Date.parse(accessStartAt) > Date.parse(accessExpiresAt)
    ) {
      errors.push({
        email,
        message: 'La fecha de inicio no puede ser posterior a la de fin.',
        rowNumber,
      });
      continue;
    }

    if (accessExpiresAt && Date.parse(accessExpiresAt) < now) {
      errors.push({
        email,
        message: 'La fecha de fin ya pasó.',
        rowNumber,
      });
      continue;
    }

    seenEmails.add(email);
    rows.push({
      accessExpiresAt,
      accessStartAt,
      email,
      fullName,
      phone,
      rowNumber,
    });
  }

  return { errors, rows, truncated };
}

export interface UserImportReport {
  considered: number;
  errors: ImportRowError[];
  imported: number;
  truncated: boolean;
}
