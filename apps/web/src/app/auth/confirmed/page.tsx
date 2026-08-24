import { AuthStatusCard } from '@/components/auth/auth-status-card';

export default function ConfirmedPage() {
  return (
    <AuthStatusCard
      actionHref="/auth/sign-in"
      actionLabel="Ir a iniciar sesión"
      description="Tu cuenta está lista. Ya puedes iniciar sesión."
      eyebrow="Correo verificado"
      title="Correo confirmado"
    />
  );
}
