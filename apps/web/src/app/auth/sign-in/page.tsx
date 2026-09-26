import { AuthForm } from '@/components/auth/auth-form';
import { signInAction } from '../actions';

interface SignInPageProps {
  searchParams: Promise<{ password?: string; sesion?: string }>;
}

function noticeFor(params: { password?: string; sesion?: string }) {
  if (params.sesion === 'caducada') {
    return {
      text: 'Por tu seguridad, la sesión se cerró. Ingresa nuevamente para continuar donde lo dejaste; tus conversaciones siguen guardadas.',
      title: 'Tu sesión finalizó',
    };
  }
  if (params.password === 'updated') {
    return {
      text: 'Ya puedes ingresar con tu nueva contraseña.',
      title: 'Contraseña actualizada',
    };
  }
  return undefined;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const notice = noticeFor(await searchParams);

  return (
    <AuthForm
      action={signInAction}
      description="Ingresa con el correo y la contraseña que registraste."
      fields={[
        {
          autoComplete: 'email',
          label: 'Correo electrónico',
          name: 'email',
          type: 'email',
        },
        {
          autoComplete: 'current-password',
          label: 'Contraseña',
          name: 'password',
          type: 'password',
        },
      ]}
      links={[
        { href: '/auth/forgot-password', label: 'Olvidé mi contraseña' },
        { href: '/auth/sign-up', label: 'Crear una cuenta' },
      ]}
      notice={notice}
      rememberOption
      submitLabel="Iniciar sesión"
      title="Bienvenido de nuevo"
    />
  );
}
