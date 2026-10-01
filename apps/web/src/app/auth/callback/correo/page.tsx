import { AuthStatusCard } from '@/components/auth/auth-status-card';
import { type EmailChangeOutcome, parseEmailChangeOutcome } from '@/lib/auth/site-url';

interface EmailChangeResultPageProps {
  searchParams: Promise<{ resultado?: string | string[] }>;
}

interface ResultCopy {
  description: string;
  title: string;
}

/**
 * Textos para quien abre un enlace del cambio de correo SIN sesión en este
 * navegador (otro dispositivo, otro navegador o sesión cerrada). No puede ver
 * Mi perfil, así que se le dice con qué correo iniciar sesión.
 */
function resultCopy(outcome: EmailChangeOutcome | null): ResultCopy {
  switch (outcome) {
    case 'actualizado':
      return {
        description: 'Tu correo de acceso cambió. Inicia sesión con tu correo nuevo.',
        title: 'Listo: cambiaste tu correo',
      };
    case 'pendiente':
      return {
        description:
          'Confirmaste uno de los enlaces; abre el otro, el que llegó al otro correo, para terminar el cambio. Hasta entonces, inicia sesión con tu correo anterior.',
        title: 'Falta un paso',
      };
    case 'error':
      return {
        description:
          'El enlace venció, ya se usó o no es válido. Si ya abriste los dos enlaces, tu correo pudo cambiar: inicia sesión con tu correo nuevo. Si no puedes entrar con él, usa el anterior y vuelve a solicitar el cambio desde Mi perfil.',
        title: 'No pudimos usar ese enlace',
      };
    case 'revisar':
    case null:
      return {
        description:
          'Si ya abriste los dos enlaces, tu correo pudo cambiar: inicia sesión con tu correo nuevo. Si no puedes entrar con él, usa el anterior y revisa tu correo de acceso en Mi perfil.',
        title: 'Revisa tu correo de acceso',
      };
  }
}

/**
 * Resultado público del cambio de correo (`/auth/callback/correo?resultado=…`).
 * El callback solo envía aquí cuando este navegador no tiene sesión; con sesión,
 * el aviso se muestra en Mi perfil.
 */
export default async function EmailChangeResultPage({
  searchParams,
}: EmailChangeResultPageProps) {
  const { resultado } = await searchParams;
  const copy = resultCopy(parseEmailChangeOutcome(resultado));

  return (
    <AuthStatusCard
      actionHref="/auth/sign-in"
      actionLabel="Iniciar sesión"
      description={copy.description}
      eyebrow="Cambio de correo"
      title={copy.title}
    />
  );
}
