import { Workbook } from 'exceljs';
import type { AdministrativeUserDirectoryEntry } from './user-administration.gateway';

/** Hard ceiling for one export. A larger directory is truncated and SAID so. */
export const USER_EXPORT_ROW_LIMIT = 10_000;

const LIMA_TIME_ZONE = 'America/Lima';

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
 * Builds the directory export with the columns the specification lists:
 * nombre, correo, celular, inicio, fin, estado, ultima modificacion y
 * creado/modificado por.
 */
export async function buildUserDirectoryWorkbook(
  users: AdministrativeUserDirectoryEntry[],
  total = users.length,
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Usuarios');

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
  sheet.getRow(1).font = { bold: true };

  for (const user of users) {
    sheet.addRow({
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
  }

  // Never let a truncated export look complete.
  if (total > users.length) {
    sheet.addRow([]);
    sheet.addRow([
      `Exportación limitada a ${users.length} de ${total} usuarios. Afina los filtros para exportar el resto.`,
    ]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
