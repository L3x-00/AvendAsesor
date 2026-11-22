import "server-only";
import { redirect } from "next/navigation";
import { resolveSignInPath } from "@/lib/auth/session-redirect";
import { cache } from "react";
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from "@/lib/authorization/resolve-admin-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ConsultationReportsApiClient } from "./client";

interface SessionSupabaseClient extends AuthorizationSupabaseClient {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token: string } | null };
      error: unknown;
    }>;
  };
}

/** Dedup within one server request, never across requests or users. */
export const createAuthorizedConsultationReportsApiContext = cache(
  async (): Promise<{
    access: Extract<
      Awaited<ReturnType<typeof resolveAdminAccess>>,
      { status: "authorized" }
    >;
    client: ConsultationReportsApiClient;
  }> => {
    const supabase =
      (await createServerSupabaseClient()) as unknown as SessionSupabaseClient;
    const access = await resolveAdminAccess(supabase);
    if (access.status === "unauthenticated")
      redirect(await resolveSignInPath());
    if (access.status !== "authorized") redirect("/access-denied");
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token)
      redirect(await resolveSignInPath());
    return {
      access,
      client: new ConsultationReportsApiClient(data.session.access_token),
    };
  },
);
