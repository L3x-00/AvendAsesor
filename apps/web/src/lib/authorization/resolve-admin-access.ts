import { isAdministrativeRole, type AdministrativeRole } from "./policy";

interface ProfileRoleQuery {
  select(columns: "role"): {
    eq(
      column: "id",
      value: string,
    ): {
      maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

export interface AuthorizationSupabaseClient {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: "profiles"): ProfileRoleQuery;
}

export type AdminAccessResult =
  | { status: "authorized"; role: AdministrativeRole; userId: string }
  | { status: "unauthenticated" }
  | { status: "unauthorized" };

export async function resolveAdminAccess(
  client: AuthorizationSupabaseClient,
): Promise<AdminAccessResult> {
  let userData: { user: { id: string } | null };
  let userError: unknown;

  try {
    ({ data: userData, error: userError } = await client.auth.getUser());
  } catch {
    return { status: "unauthenticated" };
  }

  const user = userData.user;

  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  let data: unknown;
  let error: unknown;

  try {
    ({ data, error } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle());
  } catch {
    return { status: "unauthorized" };
  }

  if (
    error ||
    !data ||
    typeof data !== "object" ||
    !("role" in data) ||
    !isAdministrativeRole((data as { role: unknown }).role)
  ) {
    return { status: "unauthorized" };
  }

  return {
    role: (data as { role: AdministrativeRole }).role,
    status: "authorized",
    userId: user.id,
  };
}
