import { AuthForm } from '@/components/auth/auth-form';
import { signUpAction } from '../actions';

export default function SignUpPage() {
  return (
    <AuthForm
      action={signUpAction}
      description="Crea tu cuenta para acceder a AVEND ASESOR. Confirmaremos tu correo antes del primer acceso."
      fields={[
        {
          autoComplete: 'name',
          label: 'Nombre completo',
          name: 'fullName',
          type: 'text',
        },
        {
          autoComplete: 'email',
          label: 'Correo electrónico',
          name: 'email',
          type: 'email',
        },
        {
          autoComplete: 'new-password',
          label: 'Contraseña',
          name: 'password',
          type: 'password',
        },
        {
          autoComplete: 'new-password',
          label: 'Confirmar contraseña',
          name: 'passwordConfirmation',
          type: 'password',
        },
      ]}
      links={[{ href: '/auth/sign-in', label: 'Ya tengo una cuenta' }]}
      submitLabel="Crear cuenta"
      title="Crea tu cuenta"
    />
  );
}
