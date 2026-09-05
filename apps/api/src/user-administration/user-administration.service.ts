import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import { SUPABASE_USER_ADMINISTRATION_GATEWAY } from '../supabase/supabase.constants';
import type { CreateAdministrativeUserDto } from './dto/create-administrative-user.dto';
import type { ListAdministrativeUsersQueryDto } from './dto/list-administrative-users-query.dto';
import type { ListOperationalAuditEventsQueryDto } from './dto/list-operational-audit-events-query.dto';
import type { UpdateAccessWindowDto } from './dto/update-access-window.dto';
import type { UpdateAdministrativeUserDto } from './dto/update-administrative-user.dto';
import {
  buildUserDirectoryWorkbook,
  USER_EXPORT_ROW_LIMIT,
} from './user-directory-export';
import {
  parseUserImportWorkbook,
  USER_IMPORT_MAX_BYTES,
  type ImportRowError,
  type UserImportReport,
} from './user-import';
import type {
  AdministrativeUser,
  AdministrativeUserCounts,
  AdministrativeUserDirectoryEntry,
  AdministrativeUserPage,
  OperationalAuditEvent,
  UserAdministrationGateway,
} from './user-administration.gateway';

function normalizedTimestamp(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new BadRequestException('A valid access-window date is required.');
  }
  return new Date(parsed).toISOString();
}

@Injectable()
export class UserAdministrationService {
  constructor(
    @Inject(SUPABASE_USER_ADMINISTRATION_GATEWAY)
    private readonly gateway: UserAdministrationGateway,
  ) {}

  listAuditEvents(
    dto: ListOperationalAuditEventsQueryDto,
    authorization: AuthorizationContext,
  ): Promise<OperationalAuditEvent[]> {
    return this.gateway.listAuditEvents({
      actorId: authorization.userId,
      limit: dto.limit ?? 50,
    });
  }

  listUsers(
    dto: ListAdministrativeUsersQueryDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUserPage> {
    return this.gateway.listUsers({
      accessState: dto.accessState ?? null,
      actorId: authorization.userId,
      group: dto.group ?? null,
      limit: dto.limit ?? 50,
      offset: dto.offset ?? 0,
      search: dto.search?.trim() || null,
      status: dto.status ?? null,
    });
  }

  createUser(
    dto: CreateAdministrativeUserDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUserDirectoryEntry> {
    const fullName = dto.fullName.trim();
    if (fullName.length < 2 || fullName.length > 160) {
      throw new BadRequestException('A valid full name is required.');
    }

    const phone = dto.phone?.trim() || null;
    if (phone !== null && (phone.length < 6 || phone.length > 20)) {
      throw new BadRequestException('A valid phone number is required.');
    }

    const accessStartAt = normalizedTimestamp(dto.accessStartAt);
    const accessExpiresAt = normalizedTimestamp(dto.accessExpiresAt);

    if (
      accessStartAt !== null &&
      accessExpiresAt !== null &&
      Date.parse(accessStartAt) > Date.parse(accessExpiresAt)
    ) {
      throw new BadRequestException(
        'The access start must not be after the access expiry.',
      );
    }

    return this.gateway.createUser({
      accessExpiresAt,
      accessStartAt,
      actorId: authorization.userId,
      email: dto.email.trim().toLowerCase(),
      fullName,
      phone,
      role: dto.role ?? 'docente',
    });
  }

  /**
   * Pages through the whole filtered directory. The RPC caps a page at 100, so
   * the export walks it instead of asking for an unbounded read.
   */
  async exportUsers(
    dto: ListAdministrativeUsersQueryDto,
    authorization: AuthorizationContext,
  ): Promise<Buffer> {
    const pageSize = 100;
    const rows: AdministrativeUserDirectoryEntry[] = [];
    let offset = 0;
    let total = 0;

    for (;;) {
      const page = await this.gateway.listUsers({
        accessState: dto.accessState ?? null,
        actorId: authorization.userId,
        group: dto.group ?? null,
        limit: pageSize,
        offset,
        search: dto.search?.trim() || null,
        status: dto.status ?? null,
      });

      total = page.total;
      rows.push(...page.items);
      offset += pageSize;

      if (
        page.items.length === 0 ||
        rows.length >= page.total ||
        rows.length >= USER_EXPORT_ROW_LIMIT
      ) {
        break;
      }
    }

    return buildUserDirectoryWorkbook(
      rows.slice(0, USER_EXPORT_ROW_LIMIT),
      total,
    );
  }

  /**
   * Mixed loads are the norm for a roster, so the valid rows are imported and
   * every rejected row is reported with its spreadsheet row number. Identities
   * are created one by one because each one is a separate provider call.
   */
  async importUsers(
    file: { buffer: Buffer; size: number } | undefined,
    authorization: AuthorizationContext,
  ): Promise<UserImportReport> {
    if (!file || file.size === 0) {
      throw new BadRequestException(
        'Adjunta un archivo Excel con los usuarios.',
      );
    }

    if (file.size > USER_IMPORT_MAX_BYTES) {
      throw new BadRequestException(
        'El archivo supera el tamaño permitido para una importación.',
      );
    }

    const parsed = await parseUserImportWorkbook(file.buffer);
    const errors: ImportRowError[] = [...parsed.errors];
    let imported = 0;

    for (const row of parsed.rows) {
      try {
        await this.gateway.createUser({
          accessExpiresAt: row.accessExpiresAt,
          accessStartAt: row.accessStartAt,
          actorId: authorization.userId,
          email: row.email,
          fullName: row.fullName,
          phone: row.phone,
          role: 'docente',
        });
        imported += 1;
      } catch (failure) {
        errors.push({
          email: row.email,
          message:
            failure instanceof ConflictException
              ? 'Ya existe una cuenta con ese correo.'
              : 'No se pudo registrar a esta persona. Inténtalo de nuevo.',
          rowNumber: row.rowNumber,
        });
      }
    }

    return {
      considered: parsed.rows.length + parsed.errors.length,
      errors,
      imported,
      truncated: parsed.truncated,
    };
  }

  countUsers(
    dto: ListAdministrativeUsersQueryDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUserCounts> {
    return this.gateway.countUsers({
      actorId: authorization.userId,
      group: dto.group ?? null,
      search: dto.search?.trim() || null,
    });
  }

  updateUser(
    targetUserId: string,
    dto: UpdateAdministrativeUserDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUser> {
    if (dto.accountStatus === undefined && dto.role === undefined) {
      throw new BadRequestException(
        'A role or account status change is required.',
      );
    }

    const reason = dto.reason.trim();
    if (reason.length < 4 || reason.length > 500) {
      throw new BadRequestException(
        'An administrative user change requires a valid reason.',
      );
    }

    return this.gateway.updateUser({
      accountStatus: dto.accountStatus ?? null,
      actorId: authorization.userId,
      reason,
      role: dto.role ?? null,
      targetUserId,
    });
  }

  updateAccessWindow(
    targetUserId: string,
    dto: UpdateAccessWindowDto,
    authorization: AuthorizationContext,
  ): Promise<AdministrativeUserDirectoryEntry> {
    const reason = dto.reason.trim();
    if (reason.length < 4 || reason.length > 500) {
      throw new BadRequestException(
        'An access-window change requires a valid reason.',
      );
    }

    const accessStartAt = normalizedTimestamp(dto.accessStartAt);
    const accessExpiresAt = normalizedTimestamp(dto.accessExpiresAt);

    if (
      accessStartAt !== null &&
      accessExpiresAt !== null &&
      Date.parse(accessStartAt) > Date.parse(accessExpiresAt)
    ) {
      throw new BadRequestException(
        'The access start must not be after the access expiry.',
      );
    }

    return this.gateway.updateAccessWindow({
      accessExpiresAt,
      accessStartAt,
      actorId: authorization.userId,
      reason,
      targetUserId,
    });
  }
}
