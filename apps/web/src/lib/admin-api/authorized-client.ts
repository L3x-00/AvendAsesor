import "server-only";
import { redirect } from "next/navigation";
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from "@/lib/authorization/resolve-admin-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AdminApiClient } from "./client";

type AuthorizedAdminAccess = Extract<
  Awaited<ReturnType<typeof resolveAdminAccess>>,
  { status: "authorized" }
>;

export interface AuthorizedAdminApiContext {
  access: AuthorizedAdminAccess;
  client: AdminApiClient;
}

export type AuthorizedAdminApiSession =
  | (AuthorizedAdminApiContext & { status: "authorized" })
  | { status: "unauthenticated" | "unauthorized" };

interface SessionSupabaseClient extends AuthorizationSupabaseClient {
  auth: AuthorizationSupabaseClient["auth"] & {
    getSession(): Promise<{
      data: { session: { access_token: string } | null };
      error: unknown;
    }>;
  };
}

export async function resolveAuthorizedAdminApiSession(): Promise<AuthorizedAdminApiSession> {
  const supabase =
    (await createServerSupabaseClient()) as unknown as SessionSupabaseClient;
  const access = await resolveAdminAccess(supabase);

  if (access.status !== "authorized") {
    return access;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    return { status: "unauthenticated" };
  }

  return {
    access,
    client: new AdminApiClient(data.session.access_token),
    status: "authorized",
  };
}

export async function createAuthorizedAdminApiContext(): Promise<AuthorizedAdminApiContext> {
  const session = await resolveAuthorizedAdminApiSession();

  if (session.status === "unauthenticated") {
    redirect("/auth/sign-in");
  }

  if (session.status !== "authorized") {
    redirect("/access-denied");
  }

  return { access: session.access, client: session.client };
}

export async function createAuthorizedAdminApiClient(): Promise<AdminApiClient> {
  return (await createAuthorizedAdminApiContext()).client;
}
