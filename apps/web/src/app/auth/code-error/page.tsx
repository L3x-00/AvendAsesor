import { AuthStatusCard } from '@/components/auth/auth-status-card';

export default function AuthCodeErrorPage() {
  return (
    <AuthStatusCard
      actionHref="/auth/forgot-password"
      actionLabel="Solicitar recuperación"
      description="Es posible que el enlace haya expirado o ya haya sido utilizado. Solicita uno nuevo."
      eyebrow="Enlace no disponible"
      title="No pudimos validar el enlace"
    />
  );
}
