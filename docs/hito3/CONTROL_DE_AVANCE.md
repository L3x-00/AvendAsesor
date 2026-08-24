# Control de avance — Hito 3

> Actualizar únicamente con evidencia verificable. La ejecución es local hasta
> que AVEND autorice un ambiente separado.

## Estado de fases

| Fase | Estado | Inicio | Fin | Responsable | Evidencia de salida |
| --- | --- | --- | --- | --- | --- |
| Fase 1 — Contrato, arquitectura y preparación local | DONE | 2026-08-21 | 2026-08-21 | Codex | Especificación ajustada, ADR, dependencias verificadas y diseño de pruebas |
| Fase 2 — Persistencia RAG y seguridad de datos | DONE | 2026-08-21 | 2026-08-21 | Codex | Migración local, RLS, 105 pgTAP, índices y contratos de gateways |
| Fase 3 — Ingesta local y vectorización | DONE | 2026-08-21 | 2026-08-21 | Codex | Worker idempotente, extracción por página, OCR local, chunking, embeddings y pruebas unitarias |
| Fase 4 — Retrieval, fuentes y guardrails | DONE (local) | 2026-08-21 | 2026-08-22 | Codex | Retrieval, prompt evidence-only, proveedor encapsulado, RPCs atómicas y regresión local |
| Fase 5 — Chat SSE e historial | DONE (local) | 2026-08-22 | 2026-08-22 | Codex | API autenticada, SSE, historial, BFF server-only y superficie docente con eventos reales |
| Fase 6 — Aceptación y cierre técnico | REVIEW | 2026-08-22 | 2026-08-24 | Codex + revisión independiente | Puerta reproducible, 264 contratos pgTAP, release en producción y smoke test remoto; falta aceptación autenticada y proveedor IA autorizado |

Estados permitidos: `PLANNED`, `ACTIVE`, `REVIEW`, `DONE`, `BLOCKED`.

## Criterios de aceptación

| Criterio | Evidencia automatizada local requerida | Estado |
| --- | --- | --- |
| CA-06 — Chat con streaming | Contrato SSE autenticado, secuencia de eventos y finalización segura | REVIEW |
| CA-07 — Filtro por módulo | Retrieval con filtro duro y regresión de aislamiento | REVIEW |
| CA-08 — Ambigüedad | Caso multi-módulo que solicita aclaración sin generar respuesta | REVIEW |
| CA-09 — Fuentes explícitas | Mensaje con fuentes persistidas procedentes de chunks usados | REVIEW |
| CA-10 — Sin evidencia | Pregunta irrelevante sin llamada generativa ni fuente ficticia | REVIEW |
| CA-11 — Chunks y vectores | Ingesta/índices y vectores con contratos y dobles deterministas; validación de proveedor separada | REVIEW |

## Riesgos y límites iniciales

- No existe una clave de proveedor de IA configurada en el entorno local. La
  implementación debe ser verificable con dobles deterministas y no declarará
  una respuesta generada por OpenAI hasta disponer de una clave autorizada.
- El Hito 2 se cerró con datos de negocio vacíos. Las pruebas crearán y
  eliminarán únicamente fixtures o identidades temporales controladas.
- El umbral inicial de similitud (`0.70`) es contractual para esta entrega, no
  una calibración definitiva. Se conservará como configuración validada y se
  medirá antes de cambiarlo.
- La capa visual de Fase 5 consume solamente el SSE autenticado, historial y
  fuentes persistidas reales. No usa mensajes, referencias ni consultas
  simuladas como sustituto.
- La promoción Hitos 3–4 se ejecutó con staging aislado y respaldo lógico
  privado previo; el conjunto exacto y sus verificaciones se registran en
  `docs/hito4/fase5/RELEASE_HITO3_HITO4.md`. La aceptación funcional completa
  sigue condicionada a cuentas QA y a un proveedor IA autorizado, que continúan
  deliberadamente deshabilitados.
