import { AuthStatusCard } from '@/components/auth/auth-status-card';

export default function AccessDeniedPage() {
  return (
    <AuthStatusCard
      actionHref="/"
      actionLabel="Volver al inicio"
      description="Tu cuenta no tiene permisos administrativos. Si consideras que se trata de un error, consulta con la persona responsable de la plataforma."
      eyebrow="Permiso requerido"
      title="Acceso restringido"
    />
  );
}
