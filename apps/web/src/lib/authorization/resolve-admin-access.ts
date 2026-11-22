import {
  hasCurrentAccess,
  isActiveAccountStatus,
  isAdministrativeRole,
  type AdministrativeRole,
} from "./policy";
import { resolveAccessContext } from "./resolve-access-context";

export interface AuthorizationSupabaseClient {
  rpc(
    functionName: "current_user_access_context",
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export type AdminAccessResult =
  | {
      fullName: string;
      modulesAccess: boolean;
      status: "authorized";
      role: AdministrativeRole;
      userId: string;
    }
  | { status: "unauthenticated" }
  | { status: "unauthorized" };

/**
 * Antes aquí se encadenaban `auth.getUser`, la fila de `profiles` y el RPC de
 * permisos: tres viajes secuenciales por cada ruta del panel. La RPC
 * `current_user_access_context()` devuelve lo mismo en un viaje, con la
 * identidad tomada del token y el permiso calculado en la base de datos.
 *
 * La política de rol, estado y vigencia se vuelve a aplicar en la web: si la
 * base cambiara o la fila viniera mal formada, la respuesta sigue siendo
 * denegada. No se relaja ninguna comprobación.
 */
export async function resolveAdminAccess(
  client: AuthorizationSupabaseClient,
): Promise<AdminAccessResult> {
  const context = await resolveAccessContext(client);

  if (context.status !== "resolved") {
    return { status: context.status };
  }

  if (
    !isActiveAccountStatus(context.accountStatus) ||
    !hasCurrentAccess(context.accessExpiresAt) ||
    !isAdministrativeRole(context.role)
  ) {
    return { status: "unauthorized" };
  }

  return {
    fullName: context.fullName,
    modulesAccess: context.modulesAccess,
    role: context.role,
    status: "authorized",
    userId: context.userId,
  };
}
