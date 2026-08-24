# Hito 4 — Fase 3: preguntas no resueltas y métricas operativas

## Resultado

Se incorporó una cola administrativa explícita para preguntas sin sustento o ambiguas. ADMIN y SUPERADMIN pueden clasificarla; las métricas son agregadas y no simulan costos o proveedores aún no configurados.

## Controles

- Estados permitidos: `pending_review`, `resolved` y `dismissed`.
- Cada resolución exige categoría y nota significativa; la decisión se conserva en `unanswered_question_reviews` con un trigger que bloquea `UPDATE` y `DELETE`, incluso para el rol de servidor fuera del RPC controlado.
- La cola devuelve un resumen operativo generado por el servidor; no copia la consulta literal, identificador, correo, teléfono ni otros datos del docente.
- Solo ADMIN/SUPERADMIN activos usan el API administrativo y el RPC revalida tanto rol como estado de cuenta en la base de datos.
- El resumen operativo declara `providerCostStatus: not_configured`; no calcula ni inventa costos de IA.

## Integración API

- `GET /admin/operations/metrics`
- `GET /admin/operations/unanswered-questions`
- `PATCH /admin/operations/unanswered-questions/:id/review`

Los endpoints tienen validación, límites, throttling y adaptador de servidor; el navegador no recibe permisos directos de tabla o RPC.

## Verificación local

- Contratos pgTAP específicos de operación, incluyendo denegación a DOCENTE/cuenta suspendida, ausencia de identidad del solicitante y no persistencia de la consulta literal.
- La posterior regresión integral de Fase 4 mantiene estos contratos sin cambios funcionales.

## Límites deliberados

La cola no cambia documentos, embeddings, prompts, recuperación RAG ni respuestas. Es señal administrable, no aprendizaje autónomo ni fuente de verdad.
