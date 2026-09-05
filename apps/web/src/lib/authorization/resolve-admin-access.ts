import {
  hasCurrentAccess,
  isActiveAccountStatus,
  isAdministrativeRole,
  type AdministrativeRole,
} from "./policy";

interface ProfileRoleQuery {
  select(columns: "role, account_status, full_name, access_expires_at"): {
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
  rpc(functionName: "current_user_has_admin_module_access"): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
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
      .select("role, account_status, full_name, access_expires_at")
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
    !("account_status" in data) ||
    !("full_name" in data) ||
    !("access_expires_at" in data) ||
    typeof (data as { full_name: unknown }).full_name !== "string" ||
    !(data as { full_name: string }).full_name.trim() ||
    !isActiveAccountStatus(
      (data as { account_status: unknown }).account_status,
    ) ||
    !hasCurrentAccess(
      (data as { access_expires_at: unknown }).access_expires_at,
    ) ||
    !isAdministrativeRole((data as { role: unknown }).role)
  ) {
    return { status: "unauthorized" };
  }

  let permissionData: unknown;
  let permissionError: unknown;

  try {
    ({ data: permissionData, error: permissionError } = await client.rpc(
      "current_user_has_admin_module_access",
    ));
  } catch {
    return { status: "unauthorized" };
  }

  if (permissionError || typeof permissionData !== "boolean") {
    return { status: "unauthorized" };
  }

  return {
    fullName: (data as { full_name: string }).full_name.trim(),
    modulesAccess: permissionData,
    role: (data as { role: AdministrativeRole }).role,
    status: "authorized",
    userId: user.id,
  };
}
