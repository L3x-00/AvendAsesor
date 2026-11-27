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
          placeholder: 'Ingresa tu nombre completo',
          type: 'text',
        },
        {
          autoComplete: 'email',
          label: 'Correo electrónico',
          name: 'email',
          placeholder: 'Ingresa tu correo electrónico',
          type: 'email',
        },
        {
          autoComplete: 'new-password',
          label: 'Contraseña',
          name: 'password',
          placeholder: 'Crea una contraseña',
          type: 'password',
        },
        {
          autoComplete: 'new-password',
          label: 'Confirmar contraseña',
          name: 'passwordConfirmation',
          placeholder: 'Repite tu contraseña',
          type: 'password',
        },
      ]}
      links={[{ href: '/auth/sign-in', label: 'Ya tengo una cuenta' }]}
      submitLabel="Crear cuenta"
      title="Crea tu cuenta"
      variant="sign-up"
    />
  );
}
