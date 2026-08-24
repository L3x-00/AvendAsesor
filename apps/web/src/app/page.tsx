import Link from 'next/link';
import { AuthLayout } from '@/components/auth/auth-layout';

export default function Home() {
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
        <form action="/auth/sign-out" className="avend-home-sign-out" method="post">
          <button
            className="avend-text-link"
            type="submit"
          >
            Cerrar sesión en este dispositivo
          </button>
        </form>
      </section>
    </AuthLayout>
  );
}
