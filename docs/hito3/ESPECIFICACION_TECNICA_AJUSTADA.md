# Especificación técnica ajustada — Hito 3

## Misión de ejecución

Implementar localmente el núcleo RAG de AVEND ASESOR en NestJS, Next.js y
Supabase/PostgreSQL. Codex conserva la coordinación de alcance, arquitectura,
seguridad, pruebas, integración y decisiones. Claude Code participa mediante
revisiones independientes y encargos acotados con evidencia real registrada.

Seguir siempre:

`UNDERSTAND -> INSPECT -> CONTEXT -> VERIFY -> ROLE -> PLAN -> IMPLEMENT -> TEST -> REVIEW -> FIX -> VERIFY -> MEMORY -> HANDOFF -> REPORT`.

No modificar ni publicar staging, producción, cuentas cloud, secretos ni
proveedores remotos. No versionar `.agents`, `.ai-shared`, `.claude`, `.codex`
ni otro artefacto de la infraestructura de IA al cerrar el hito.

## Requisitos funcionales confirmados

1. Procesar PDFs privados del Hito 2 mediante extracción textual y OCR local
   solo cuando una página no alcance el umbral de texto útil configurado.
2. Conservar versión, páginas y secciones al segmentar contenido; los chunks
   tendrán tamaño objetivo de 500–800 tokens y solapamiento máximo de 100,
   priorizando artículos, numerales, títulos y párrafos.
3. Generar embeddings de 1536 dimensiones, indexarlos en `pgvector` y permitir
   búsqueda híbrida vectorial + texto completo.
4. Aceptar un módulo opcional como filtro duro. Sin selector, detectar si la
   evidencia está repartida entre módulos y pedir precisión cuando resulte
   ambigua.
5. Generar solo desde evidencia recuperada. Respuestas afirmativas muestran
   fuentes reales con documento, módulo, versión, página y sección disponible.
6. Sin evidencia suficiente, no invocar generación y responder el mensaje de
   falta de sustento. Registrar la consulta no resuelta sin guardar secretos.
7. Entregar un chat autenticado por streaming SSE y mantener el historial
   mínimo necesario de conversaciones del usuario.

## Reglas de seguridad y calidad

- NestJS es la frontera de autorización. Docente, administrador y
  superadministrador usan el chat; la administración de reintentos de ingesta
  será restringida a `admin` y `superadmin`.
- Nuevas tablas llevan RLS, revocación explícita a `anon`/`authenticated` y
  acceso solo mediante adaptadores server-side. Las consultas se validan,
  limitan y rate-limitan.
- La cola durable usa lease, intentos máximos, estados controlados e
  idempotencia por versión. Una versión no se marca `indexed` hasta que todos
  sus chunks y vectores se persistan de forma coherente.
- Los fragmentos recuperados se tratan como datos no confiables. No pueden
  modificar el prompt del sistema ni solicitar herramientas, secretos o acceso
  externo.
- Nunca inventar `artículo` o `numeral`: esos campos se citan solo cuando la
  extracción estructurada los identificó o el metadato documental los declara.
- Los dobles de pruebas son obligatorios. No usar claves reales, red o coste
  de proveedor para probar chunking, retrieval, guardrails o SSE.

## Modelo de datos objetivo

- `document_versions`: estado de ingesta controlado (`pending`, `processing`,
  `indexed`, `failed`) y fecha de transición.
- `document_ingestion_jobs`: trabajo durable por versión, lease, intento,
  error seguro y reintento explícito.
- `document_chunks`: contenido, versión inmutable, páginas, sección,
  artículo/numeral opcionales, `tsvector`, conteo de tokens y embedding.
- `chat_conversations`, `chat_messages`, `chat_message_sources` y
  `unanswered_questions`: historial de propiedad del usuario, respuesta y
  evidencia trazable.

La relación con módulos se resuelve contra `document_modules` durante la
recuperación. Así un solo vector representa un fragmento de una versión y no
se duplica por cada módulo asociado.

## Plan de seis fases

1. **Contrato y preparación:** documentación ajustada, ADR, estado local y
   matriz de pruebas.
2. **Persistencia:** migración aditiva, RLS, RPCs de cola/retrieval, índices,
   tipos y pgTAP.
3. **Ingesta:** worker, extracción página a página, OCR local, normalización,
   chunking, proveedor de embeddings y reintentos.
4. **Motor RAG:** retrieval híbrido, filtro de módulo, ambigüedad, fuentes,
   prompt acotado, no-evidencia y consultas no resueltas.
5. **Chat:** API autenticada SSE, historial y BFF/chat docente funcional de
   mínimo alcance.
6. **Cierre:** fixtures temporales, CA-06 a CA-11, regresiones de Hitos 1–2,
   cobertura, revisión cruzada, documentación, commits de producto y Notion.

## Criterio de terminado

Una fase solo puede quedar `DONE` si sus cambios están implementados, cubiertos
por pruebas relevantes, revisados de forma independiente cuando corresponda,
sin hallazgos `BLOCKER` o `HIGH`, con documentación y memoria actualizadas y
con evidencia reproducible. Compilar no es evidencia suficiente.
