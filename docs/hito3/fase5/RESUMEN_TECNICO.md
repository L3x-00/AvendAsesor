# Hito 3 — Fase 5: chat SSE e historial mínimo

## Objetivo

Exponer el chat autenticado para docente, administrador y superadministrador,
con POST SSE, historial limitado y fuentes verificables.

## Entregado

- API NestJS autenticada para `docente`, `admin` y `superadmin`: módulos
  activos, historial del propietario y `POST /chat/stream` con rate limit de
  10 consultas por minuto.
- SSE tipado con eventos de conversación, fuentes, tokens, aclaración,
  no-evidencia, cierre y error seguro. La desconexión aborta el proveedor y no
  persiste una respuesta parcial.
- Persistencia controlada de pregunta, conversación, respuesta, fuentes y
  consultas no resueltas mediante los contratos de Fase 4.
- BFF Next.js server-only que verifica sesión y perfil antes de reenviar el
  bearer a NestJS. Ninguna clave de servicio, ruta privada, RPC ni Data API
  alcanza al navegador.
- `/chat` y `/chat/[conversationId]` usan Server Components para su estado
  inicial y un panel cliente que consume SSE real. No hay respuestas,
  referencias ni botones de voz simulados.
- Superficie accesible para docentes: texto legible, etiquetas explícitas,
  controles grandes, estados `aria-live`, contexto de módulo removible,
  aclaraciones seleccionables y tabla de fuentes responsive.
- Pruebas API/Web de autorización, SSE, historial, fuentes, errores,
  desconexión, JSON inválido y límites de solicitud.

## Puerta visual — 2026-08-21

La guía visual aprobada se aplica solo a la superficie necesaria para validar
el contrato real. La evolución visual completa sigue separada: no altera la
autoridad backend, el modelo RAG ni las reglas de evidencia.
