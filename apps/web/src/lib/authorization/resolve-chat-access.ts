import { isActiveAccountStatus, isChatRole, type ChatRole } from "./policy";
import type { AuthorizationSupabaseClient } from "./resolve-admin-access";

export type ChatAccessResult =
  | {
      fullName: string;
      status: "authorized";
      role: ChatRole;
      userId: string;
    }
  | { status: "unauthenticated" }
  | { status: "unauthorized" };

/**
 * The chat boundary accepts every confirmed product role. It deliberately
 * remains separate from administrative access so a docente cannot inherit an
 * administrative capability merely by loading the conversation UI.
 */
export async function resolveChatAccess(
  client: AuthorizationSupabaseClient,
): Promise<ChatAccessResult> {
  let userData: { user: { id: string } | null };
  let userError: unknown;

  try {
    ({ data: userData, error: userError } = await client.auth.getUser());
  } catch {
    return { status: "unauthenticated" };
  }

  const user = userData.user;
  if (userError || !user) return { status: "unauthenticated" };

  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await client
      .from("profiles")
      .select("role, account_status, full_name")
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
    typeof (data as { full_name: unknown }).full_name !== "string" ||
    !(data as { full_name: string }).full_name.trim() ||
    !isActiveAccountStatus(
      (data as { account_status: unknown }).account_status,
    ) ||
    !isChatRole((data as { role: unknown }).role)
  ) {
    return { status: "unauthorized" };
  }

  return {
    fullName: (data as { full_name: string }).full_name.trim(),
    role: (data as { role: ChatRole }).role,
    status: "authorized",
    userId: user.id,
  };
}
