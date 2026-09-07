import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
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

/**
 * Resolver el acceso cuesta tres viajes secuenciales a Supabase
 * (`auth.getUser`, la fila de `profiles` y el RPC de permiso de módulos).
 *
 * El layout del panel necesita el nombre, el rol y el permiso para pintar la
 * barra lateral, y cada página vuelve a resolver el acceso porque un layout no
 * se reejecuta al navegar entre sus hijos: la comprobación por ruta no es
 * opcional. Sin memorización, una carga completa pagaría ese coste dos veces.
 *
 * `cache` de React lo deduplica dentro de una misma petición de servidor y no
 * guarda nada entre peticiones ni entre usuarios, así que no relaja ninguna
 * comprobación: la segunda llamada de la misma petición recibe el resultado ya
 * verificado para esa sesión. Fuera de un render de servidor —en las pruebas—
 * no memoriza, de modo que los conteos exactos de los specs siguen siendo
 * válidos.
 */
export const resolveAuthorizedAdminApiSession = cache(
  async (): Promise<AuthorizedAdminApiSession> => {
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
  },
);

export async function createAuthorizedAdminApiContext(
  options: { requireModulesAccess?: boolean } = {},
): Promise<AuthorizedAdminApiContext> {
  const session = await resolveAuthorizedAdminApiSession();

  if (session.status === "unauthenticated") {
    redirect("/auth/sign-in");
  }

  if (session.status !== "authorized") {
    redirect("/access-denied");
  }

  if (options.requireModulesAccess && !session.access.modulesAccess) {
    redirect("/access-denied");
  }

  return { access: session.access, client: session.client };
}

export async function createAuthorizedAdminApiClient(
  options: { requireModulesAccess?: boolean } = {},
): Promise<AdminApiClient> {
  return (await createAuthorizedAdminApiContext(options)).client;
}
