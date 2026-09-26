import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthLayout } from '@/components/auth/auth-layout';
import { resolveSignInPath } from '@/lib/auth/session-redirect';
import { SIGN_IN_PATH } from '@/lib/auth/session-preferences';
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from '@/lib/authorization/resolve-admin-access';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Home() {
  // Con una sesión vigente, la portada no vuelve a pedir credenciales: lleva
  // al mismo destino que el inicio de sesión (panel o chat). Cada ruta
  // revalida el acceso; esto solo decide a dónde entrar.
  const supabase = await createServerSupabaseClient();
  const access = await resolveAdminAccess(
    supabase as unknown as AuthorizationSupabaseClient,
  );

  if (access.status === 'authorized') redirect('/admin');
  if (access.status === 'unauthorized') redirect('/chat');

  // Sin sesión: si en este dispositivo había una, caducó; se explica en el
  // login en vez de mostrar la portada como si nada hubiera pasado.
  const signInPath = await resolveSignInPath();
  if (signInPath !== SIGN_IN_PATH) redirect(signInPath);

  return (
    <AuthLayout>
      <section aria-labelledby="home-title">
        <header className="avend-auth-heading">
          <p className="avend-eyebrow">Plataforma docente</p>
          <h1 id="home-title">Tu espacio de consulta profesional</h1>
          <p>
            Accede con una cuenta segura para continuar en AVEND ASESOR. La
            plataforma te guiará paso a paso cuando requieras una acción.
          </p>
        </header>
        <div className="avend-home-actions">
          <Link
            className="avend-button avend-button--primary"
            href="/auth/sign-up"
          >
            Crear cuenta
          </Link>
          <Link
            className="avend-button avend-button--secondary"
            href="/auth/sign-in"
          >
            Iniciar sesión
          </Link>
        </div>
      </section>
    </AuthLayout>
  );
}
