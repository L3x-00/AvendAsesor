import { AuthStatusCard } from '@/components/auth/auth-status-card';

export default function AccessDeniedPage() {
  return (
    <AuthStatusCard
      actionHref="/"
      actionLabel="Volver al inicio"
      description="Tu cuenta no tiene permisos administrativos. Si consideras que se trata de un error, consulta con la persona responsable de la plataforma."
      eyebrow="Permiso requerido"
      // Quien llega aquí no ve ningún panel: esta es su única salida de la
      // sesión (p. ej. una cuenta suspendida en una computadora compartida).
      signOutLabel="Cerrar sesión"
      title="Acceso restringido"
    />
  );
}
