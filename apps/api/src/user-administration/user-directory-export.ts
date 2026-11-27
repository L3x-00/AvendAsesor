import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Workbook } from 'exceljs';
import type { AdministrativeUserDirectoryEntry } from './user-administration.gateway';

/** Hard ceiling for one export. A larger directory is truncated and SAID so. */
export const USER_EXPORT_ROW_LIMIT = 10_000;

const LIMA_TIME_ZONE = 'America/Lima';

/** Paleta institucional AVEND ASESOR. */
const BRAND = {
  blue: 'FF1D4ED8',
  dark: 'FF0F2A5C',
  light: 'FFEFF4FF',
  gray: 'FF5B6478',
  white: 'FFFFFFFF',
};

/** Logo institucional, embebido en la portada del libro. */
const LOGO_PATH = join(__dirname, '..', '..', 'assets', 'logo-avend.png');

// Ano de 4 digitos a proposito: "31/12/27" es ambiguo y el importador lo
// rechazaria, rompiendo el ciclo exportar -> corregir -> reimportar.
const dayFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: LIMA_TIME_ZONE,
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  timeZone: LIMA_TIME_ZONE,
  year: 'numeric',
});

const ACCESS_STATE_LABELS: Record<
  AdministrativeUserDirectoryEntry['accessState'],
  string
> = {
  activo: 'Activo',
  expirado: 'Expirado',
  pausado: 'Pausado',
  por_vencer: 'Por vencer',
};

const ROLE_LABELS: Record<AdministrativeUserDirectoryEntry['role'], string> = {
  admin: 'Administrador',
  docente: 'Docente',
  superadmin: 'Superadministrador',
};

function day(value: string | null): string {
  return value ? dayFormatter.format(new Date(value)) : '';
}

function dateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : '';
}

/**
 * Portada institucional: logo, titulo y contexto de la exportacion. El archivo
 * se abre por esta hoja para que la primera impresion sea la marca, sin tocar
 * la fila 1 de "Usuarios" (el importador la exige como cabecera).
 */
function addCoverSheet(
  workbook: Workbook,
  exportedAt: Date,
  exported: number,
  total: number,
): void {
  const cover = workbook.addWorksheet('Portada', {
    properties: { defaultRowHeight: 20 },
    views: [{ showGridLines: false }],
  });
  cover.getColumn(1).width = 4;
  cover.getColumn(2).width = 26;
  cover.getColumn(3).width = 26;
  cover.getColumn(4).width = 26;
  cover.getColumn(5).width = 4;

  if (existsSync(LOGO_PATH)) {
    const imageId = workbook.addImage({
      buffer: Buffer.from(readFileSync(LOGO_PATH)) as never,
      extension: 'png',
    });
    // El logo es 420x560 (alto). Se escala a ~200x267 para la portada.
    cover.addImage(imageId, {
      tl: { col: 1.6, row: 1 },
      ext: { width: 200, height: 267 },
    });
  }

  cover.mergeCells('B10:D10');
  const title = cover.getCell('B10');
  title.value = 'AVEND ASESOR';
  title.font = {
    name: 'Calibri',
    size: 26,
    bold: true,
    color: { argb: BRAND.dark },
  };
  title.alignment = { horizontal: 'center', vertical: 'middle' };

  cover.mergeCells('B11:D11');
  const subtitle = cover.getCell('B11');
  subtitle.value = 'Directorio de usuarios';
  subtitle.font = { name: 'Calibri', size: 15, color: { argb: BRAND.blue } };
  subtitle.alignment = { horizontal: 'center', vertical: 'middle' };

  cover.mergeCells('B13:D13');
  const note = cover.getCell('B13');
  note.value =
    'Documento generado automáticamente por el panel administrativo. Su contenido refleja los accesos vigentes al momento de la exportación.';
  note.font = {
    name: 'Calibri',
    size: 10,
    color: { argb: BRAND.gray },
    italic: true,
  };
  note.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cover.getRow(13).height = 32;

  const details: Array<[string, string]> = [
    [
      'Fecha de exportación',
      `${dayFormatter.format(exportedAt)} — ${dateTimeFormatter.format(exportedAt)}`,
    ],
    ['Zona horaria', 'América / Lima (Perú)'],
    [
      'Usuarios exportados',
      `${exported}${total > exported ? ` de ${total}` : ''}`,
    ],
    [
      'Estado',
      total > exported ? 'Exportación limitada' : 'Exportación completa',
    ],
  ];
  details.forEach(([label, value], index) => {
    const row = 15 + index;
    const cellLabel = cover.getCell(`B${row}`);
    cellLabel.value = label;
    cellLabel.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: BRAND.dark },
    };
    cellLabel.alignment = { horizontal: 'right', vertical: 'middle' };
    cover.mergeCells(`C${row}:D${row}`);
    const cellValue = cover.getCell(`C${row}`);
    cellValue.value = value;
    cellValue.font = { name: 'Calibri', size: 11, color: { argb: BRAND.gray } };
    cellValue.alignment = { horizontal: 'left', vertical: 'middle' };
  });
}

/**
 * Builds the directory export with the columns the specification lists:
 * nombre, correo, celular, inicio, fin, estado, ultima modificacion y
 * creado/modificado por. La hoja "Usuarios" conserva la cabecera en la fila 1
 * para seguir siendo compatible con la importacion.
 */
export async function buildUserDirectoryWorkbook(
  users: AdministrativeUserDirectoryEntry[],
  total = users.length,
  exportedAt = new Date(),
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'AVEND ASESOR';
  workbook.lastModifiedBy = 'AVEND ASESOR';
  workbook.created = exportedAt;
  workbook.modified = exportedAt;

  // "Usuarios" se crea primero porque el importador identifica la hoja por
  // nombre (user-import.ts). La portada se crea al final y se marca como activa
  // para que sea la primera en verse al abrir el archivo.
  const sheet = workbook.addWorksheet('Usuarios', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Nombre y apellidos', key: 'fullName', width: 34 },
    { header: 'Correo', key: 'email', width: 32 },
    { header: 'Celular', key: 'phone', width: 16 },
    { header: 'Rol', key: 'role', width: 22 },
    { header: 'Inicio', key: 'accessStartAt', width: 14 },
    { header: 'Fin', key: 'accessExpiresAt', width: 14 },
    { header: 'Estado', key: 'accessState', width: 14 },
    { header: 'Última modificación', key: 'updatedAt', width: 20 },
    { header: 'Creado por', key: 'createdByName', width: 28 },
    { header: 'Modificado por', key: 'updatedByName', width: 28 },
  ];

  const header = sheet.getRow(1);
  header.height = 26;
  header.font = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: BRAND.white },
  };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: BRAND.blue },
  };
  header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  header.eachCell((cell) => {
    cell.border = {
      bottom: { style: 'thin', color: { argb: BRAND.dark } },
    };
  });

  users.forEach((user, index) => {
    const row = sheet.addRow({
      accessExpiresAt: day(user.accessExpiresAt),
      accessStartAt: day(user.accessStartAt),
      accessState: ACCESS_STATE_LABELS[user.accessState],
      createdByName: user.createdByName ?? '',
      email: user.email ?? '',
      fullName: user.fullName,
      phone: user.phone ?? '',
      role: ROLE_LABELS[user.role],
      updatedAt: dateTime(user.updatedAt),
      updatedByName: user.updatedByName ?? '',
    });
    row.height = 20;
    row.font = { name: 'Calibri', size: 11, color: { argb: BRAND.dark } };
    row.alignment = { vertical: 'middle' };
    if (index % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: BRAND.light },
      };
    }
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Never let a truncated export look complete.
  if (total > users.length) {
    sheet.addRow([]);
    const note = sheet.addRow([
      `Exportación limitada a ${users.length} de ${total} usuarios. Afina los filtros para exportar el resto.`,
    ]);
    note.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: BRAND.dark },
    };
    note.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND.light },
    };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };

  addCoverSheet(workbook, exportedAt, users.length, total);
  // La portada se crea al final; se activa para que Excel la muestre primero
  // al abrir. El importador ya no depende del orden: busca "Usuarios" por
  // nombre (user-import.ts), así que el ciclo exportar -> importar sigue intacto.
  const cover = workbook.getWorksheet('Portada');
  if (cover) {
    workbook.views = [
      {
        activeTab: workbook.worksheets.indexOf(cover),
        firstSheet: 0,
        visibility: 'visible',
        x: 0,
        y: 0,
        width: 16_000,
        height: 9_000,
      },
    ];
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
