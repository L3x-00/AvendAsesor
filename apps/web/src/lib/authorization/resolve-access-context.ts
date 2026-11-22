import type { AuthorizationSupabaseClient } from "./resolve-admin-access";

/**
 * Contrato mínimo que la resolución de acceso necesita del cliente de
 * Supabase: una sola llamada RPC que devuelve la fila de la sesión.
 */
export interface AccessContextSupabaseClient {
  rpc(
    functionName: "current_user_access_context",
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export type AccessContextResult =
  | {
      accessExpiresAt: string | null;
      accountStatus: string;
      fullName: string;
      modulesAccess: boolean;
      role: string;
      status: "resolved";
      userId: string;
    }
  | { status: "unauthenticated" }
  | { status: "unauthorized" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Sin sesión, el cliente de Supabase usa la clave anon y PostgREST rechaza la
 * llamada con 42501 (o 401/403 si el token no es verificable). Esa es la única
 * forma de distinguir "no hay sesión" de "hay sesión pero no hay contexto":
 * un error posterior o cero filas son denegación, no caducidad de sesión.
 */
function isMissingSession(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.code === "42501" ||
    error.code === 42501 ||
    error.code === 401 ||
    error.code === 403 ||
    error.status === 401 ||
    error.status === 403
  );
}

/**
 * Resuelve la identidad y el contexto de acceso en un solo viaje a Supabase.
 *
 * La base de datos toma la identidad de `auth.uid()` (token verificado), por lo
 * que no hay parámetros que un cliente pueda manipular para leer el perfil de
 * otra persona. La web vuelve a aplicar su política sobre el rol, el estado y
 * la vigencia; el permiso de módulos se calcula en la base con la misma función
 * de siempre.
 */
export async function resolveAccessContext(
  client: AuthorizationSupabaseClient | AccessContextSupabaseClient,
): Promise<AccessContextResult> {
  let data: unknown;
  let error: unknown;

  try {
    ({ data, error } = await client.rpc("current_user_access_context"));
  } catch {
    // Sin contexto verificable no hay sesión demostrable. Falla cerrado.
    return { status: "unauthenticated" };
  }

  if (error) {
    return {
      status: isMissingSession(error) ? "unauthenticated" : "unauthorized",
    };
  }

  if (!Array.isArray(data) || data.length === 0 || !isRecord(data[0])) {
    // Con sesión verificada, la RPC devuelve exactamente una fila. Cero filas
    // significa que esa identidad no tiene perfil: se deniega, no se pide
    // iniciar sesión de nuevo.
    return { status: "unauthorized" };
  }

  const row = data[0];

  const { access_expires_at, account_status, full_name, modules_access, role, user_id } = row;

  if (
    typeof user_id !== "string" ||
    !user_id.trim() ||
    typeof full_name !== "string" ||
    !full_name.trim() ||
    typeof role !== "string" ||
    typeof account_status !== "string" ||
    (access_expires_at !== null && typeof access_expires_at !== "string") ||
    typeof modules_access !== "boolean"
  ) {
    return { status: "unauthorized" };
  }

  return {
    accessExpiresAt: access_expires_at as string | null,
    accountStatus: account_status,
    fullName: full_name.trim(),
    modulesAccess: modules_access,
    role,
    status: "resolved",
    userId: user_id,
  };
}
