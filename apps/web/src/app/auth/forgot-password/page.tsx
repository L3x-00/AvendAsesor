import { AuthForm } from '@/components/auth/auth-form';
import { requestPasswordResetAction } from '../actions';

export default function ForgotPasswordPage() {
  return (
    <AuthForm
      action={requestPasswordResetAction}
      description="Te enviaremos instrucciones si existe una cuenta asociada a ese correo."
      fields={[
        {
          autoComplete: 'email',
          label: 'Correo electrónico',
          name: 'email',
          type: 'email',
        },
      ]}
      links={[{ href: '/auth/sign-in', label: 'Volver a iniciar sesión' }]}
      submitLabel="Enviar instrucciones"
      title="Restablece tu contraseña"
    />
  );
}
