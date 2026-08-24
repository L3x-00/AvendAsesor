# Hito 3 — Núcleo RAG, chat general, fuentes y ambigüedad

## Objetivo

Construir el núcleo de consulta documental de AVEND ASESOR: ingesta local de
PDF, OCR para PDFs escaneados, segmentación, embeddings en `pgvector`,
recuperación híbrida y un chat autenticado que solo responda cuando exista
evidencia documental verificable.

El foco del hito es el backend, la seguridad, la trazabilidad y las pruebas.
La interfaz se limitará a una superficie docente funcional para validar el
contrato; el diseño visual definitivo queda fuera de alcance.

## Alcance confirmado

- CA-06 a CA-11: chat en streaming, filtro opcional por módulo, aclaración de
  ambigüedad, fuentes explícitas, negativa cuando no haya evidencia e
  indexación de PDFs en `pgvector`.
- Los archivos de negocio siguen siendo únicamente PDFs. El OCR cubre páginas
  escaneadas dentro de un PDF; no habilita la carga independiente de imágenes,
  DOCX ni TXT.
- Se conservará el límite del Hito 2: documentos privados, versiones
  inmutables, RBAC de NestJS, RLS y sin acceso directo del navegador a Storage
  ni a PostgREST.
- OpenAI será un proveedor intercambiable, no una dependencia de dominio. Los
  modelos iniciales configurables son `text-embedding-3-small` (1536
  dimensiones) y `gpt-4o-mini`. Las pruebas no requieren ni usan una clave
  real.
- Tesseract se ejecutará localmente con datos de idioma versionados como
  dependencia. Si el OCR no está disponible, la versión queda en un estado de
  error controlado y reintentable; nunca se indexa texto incompleto como si
  fuera válido.

## Fases

| Fase | Objetivo | Estado |
| --- | --- | --- |
| [Fase 1](fase1/RESUMEN_TECNICO.md) | Contrato ajustado, arquitectura y preparación local | DONE |
| [Fase 2](fase2/RESUMEN_TECNICO.md) | Modelo persistente: colas, chunks, fuentes, conversaciones, RLS e índices | DONE |
| [Fase 3](fase3/RESUMEN_TECNICO.md) | Ingesta asíncrona local: extracción, OCR, normalización, chunking y embeddings | DONE |
| [Fase 4](fase4/RESUMEN_TECNICO.md) | Retrieval híbrido, detección de ambigüedad, citas y guardrails | REVIEW |
| [Fase 5](fase5/RESUMEN_TECNICO.md) | API SSE, historial y chat docente funcional de superficie mínima | REVIEW |
| [Fase 6](fase6/RESUMEN_TECNICO.md) | Aceptación local, regresión, revisión independiente y cierre técnico | ACTIVE |

Los criterios contractuales solo podrán marcarse como aprobados tras evidencia
real. La implementación local no equivale a aceptación de staging o de
producción.

## Decisiones de diseño que corrigen el borrador inicial

1. Cada chunk se vincula a `document_id` y a su `document_version_id`
   inmutable. Un PDF asociado a más de un módulo no duplica vectores: el filtro
   de módulo se resuelve mediante su asociación documental vigente.
2. La ingestión no ocurre en la petición HTTP de carga. Una cola durable con
   lease, intento, error seguro y reintento impide bloquear al administrador y
   permite recuperación idempotente.
3. Las fuentes se relacionan con un mensaje de asistente persistido, no con un
   identificador sin tabla referenciada. Solo se citan chunks recuperados en la
   consulta concreta.
4. La generación queda detrás de los guardrails: sin evidencia suficiente o
   con ambigüedad no se llama al modelo generativo. El contexto documental se
   delimita como datos no confiables y no puede cambiar las instrucciones del
   sistema.

La especificación operativa completa está en
[ESPECIFICACION_TECNICA_AJUSTADA.md](ESPECIFICACION_TECNICA_AJUSTADA.md).
