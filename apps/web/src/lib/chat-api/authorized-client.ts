import "server-only";
import { redirect } from "next/navigation";
import {
  resolveChatAccess,
  type ChatAccessResult,
} from "@/lib/authorization/resolve-chat-access";
import type { AuthorizationSupabaseClient } from "@/lib/authorization/resolve-admin-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ChatApiClient } from "./client";

interface SessionSupabaseClient extends AuthorizationSupabaseClient {
  auth: AuthorizationSupabaseClient["auth"] & {
    getSession(): Promise<{
      data: { session: { access_token: string } | null };
      error: unknown;
    }>;
  };
}

export async function resolveAuthorizedChatSession(): Promise<
  | {
      accessToken: string;
      access: Extract<ChatAccessResult, { status: "authorized" }>;
    }
  | { status: "unauthenticated" | "unauthorized" }
> {
  const supabase =
    (await createServerSupabaseClient()) as unknown as SessionSupabaseClient;
  const access = await resolveChatAccess(supabase);

  if (access.status !== "authorized") return access;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token)
    return { status: "unauthenticated" };

  return { access, accessToken: data.session.access_token };
}

export async function createAuthorizedChatApiClient(): Promise<ChatApiClient> {
  const session = await resolveAuthorizedChatSession();

  if ("status" in session) {
    if (session.status === "unauthenticated") redirect("/auth/sign-in");
    redirect("/access-denied");
  }

  return new ChatApiClient(session.accessToken);
}

type AuthorizedChatAccess = Extract<ChatAccessResult, { status: "authorized" }>;

/**
 * Igual que `createAuthorizedChatApiClient`, pero además expone el rol del perfil
 * para que la interfaz pueda mostrar la entrada al panel a administradores. El
 * rol solo afecta la navegación visible; cada ruta protegida lo revalida.
 */
export async function resolveAuthorizedChatContext(): Promise<{
  client: ChatApiClient;
  fullName: AuthorizedChatAccess["fullName"];
  role: AuthorizedChatAccess["role"];
}> {
  const session = await resolveAuthorizedChatSession();

  if ("status" in session) {
    if (session.status === "unauthenticated") redirect("/auth/sign-in");
    redirect("/access-denied");
  }

  return {
    client: new ChatApiClient(session.accessToken),
    fullName: session.access.fullName,
    role: session.access.role,
  };
}
