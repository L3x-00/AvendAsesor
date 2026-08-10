import { AuthForm } from '@/components/auth/auth-form';
import { signInAction } from '../actions';

export default function SignInPage() {
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
      submitLabel="Iniciar sesión"
      title="Bienvenido de nuevo"
    />
  );
}
