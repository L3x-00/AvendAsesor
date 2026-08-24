import { isActiveAccountStatus, isChatRole, type ChatRole } from "./policy";
import type { AuthorizationSupabaseClient } from "./resolve-admin-access";

export type ChatAccessResult =
  | { status: "authorized"; role: ChatRole; userId: string }
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
      .select("role, account_status")
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
    !isActiveAccountStatus(
      (data as { account_status: unknown }).account_status,
    ) ||
    !isChatRole((data as { role: unknown }).role)
  ) {
    return { status: "unauthorized" };
  }

  return {
    role: (data as { role: ChatRole }).role,
    status: "authorized",
    userId: user.id,
  };
}
