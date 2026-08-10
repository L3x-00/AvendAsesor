import { AuthForm } from '@/components/auth/auth-form';
import { updatePasswordAction } from '../actions';

export default function UpdatePasswordPage() {
  return (
    <AuthForm
      action={updatePasswordAction}
      description="Elige una contraseña nueva para tu cuenta."
      fields={[
        {
          autoComplete: 'new-password',
          label: 'Nueva contraseña',
          name: 'password',
          type: 'password',
        },
        {
          autoComplete: 'new-password',
          label: 'Confirmar nueva contraseña',
          name: 'passwordConfirmation',
          type: 'password',
        },
      ]}
      links={[{ href: '/auth/sign-in', label: 'Volver a iniciar sesión' }]}
      submitLabel="Actualizar contraseña"
      title="Actualiza tu contraseña"
    />
  );
}
