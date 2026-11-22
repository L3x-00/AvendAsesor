import {
  hasCurrentAccess,
  isActiveAccountStatus,
  isChatRole,
  type ChatRole,
} from "./policy";
import type { AuthorizationSupabaseClient } from "./resolve-admin-access";
import { resolveAccessContext } from "./resolve-access-context";

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
 *
 * Como el panel, resuelve el contexto en una sola RPC; la política de rol,
 * estado y vigencia se aplica aquí, no se delega en la base de datos.
 */
export async function resolveChatAccess(
  client: AuthorizationSupabaseClient,
): Promise<ChatAccessResult> {
  const context = await resolveAccessContext(client);

  if (context.status !== "resolved") {
    return { status: context.status };
  }

  if (
    !isActiveAccountStatus(context.accountStatus) ||
    !hasCurrentAccess(context.accessExpiresAt) ||
    !isChatRole(context.role)
  ) {
    return { status: "unauthorized" };
  }

  return {
    fullName: context.fullName,
    role: context.role,
    status: "authorized",
    userId: context.userId,
  };
}
