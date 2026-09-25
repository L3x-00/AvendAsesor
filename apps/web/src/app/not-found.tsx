import { AuthStatusCard } from '@/components/auth/auth-status-card';

/**
 * Página 404 de toda la aplicación: rutas inexistentes y recursos que no
 * existen o no pertenecen a la cuenta (p. ej. el enlace a una conversación de
 * otra persona). No confirma si el recurso existe: solo orienta la salida.
 */
export default function NotFound() {
  return (
    <AuthStatusCard
      actionHref="/"
      actionLabel="Volver al inicio"
      description="La página que buscas no existe, cambió de dirección o no está disponible para tu cuenta. Si llegaste desde un enlace compartido, recuerda que cada conversación solo la puede ver la persona que la inició."
      eyebrow="Error 404"
      secondaryAction={{ href: '/history', label: 'Ir a mi historial' }}
      title="Página no encontrada"
    />
  );
}
