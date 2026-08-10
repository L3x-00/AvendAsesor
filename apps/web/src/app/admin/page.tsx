import { redirect } from "next/navigation";
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from "@/lib/authorization/resolve-admin-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const access = await resolveAdminAccess(
    supabase as unknown as AuthorizationSupabaseClient,
  );

  if (access.status === "unauthenticated") {
    redirect("/auth/sign-in");
  }

  if (access.status !== "authorized") {
    redirect("/access-denied");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-sky-700">
          AVEND ASESOR
        </p>
        <h1 className="mt-2 text-2xl font-bold">Panel administrativo</h1>
        <p className="mt-3 leading-6 text-slate-600">
          Acceso confirmado con rol {access.role}. La interfaz usa rutas de
          servidor y la API protegida; no entrega acceso directo a los datos.
        </p>
      </section>
    </main>
  );
}
