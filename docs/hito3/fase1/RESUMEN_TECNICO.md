# Hito 3 — Fase 1: contrato, arquitectura y preparación local

## Objetivo

Traducir la especificación de RAG a un contrato implementable sin debilitar las
garantías de versiones, Storage privado, RBAC ni RLS establecidas en el Hito 2.

## Alcance de esta fase

- Contrastar requisitos, arquitectura, repositorio, dependencias y estado de
  Supabase local.
- Ajustar la especificación y dividir el hito en unidades verificables.
- Elegir contratos de proveedor, OCR y pruebas sin añadir secretos ni llamadas
  generativas reales.
- Diseñar la migración y sus pruebas antes de modificar el esquema.

## Hallazgos confirmados

- `document_versions.ingestion_status` fue dejado deliberadamente como
  `pending` en el Hito 2; el Hito 3 debe sustituir su guardia de inmutabilidad
  por transiciones de procesamiento estrictamente controladas.
- Un documento puede pertenecer a varios módulos. Por ello `module_id` no es
  una columna propietaria del chunk: el filtro se hará por la relación
  `document_modules`, evitando duplicar embeddings y desalinearlos cuando el
  administrador cambie una asociación.
- El borrador de `chat_sources` no tenía una tabla de mensajes. El modelo
  persistirá conversación, mensajes y fuentes mediante claves foráneas.
- `pdf-parse` ya permite extraer texto por página y renderizar páginas. El OCR
  se incorporará con Tesseract local y datos de idioma español, sin descarga de
  modelos en tiempo de ejecución.
- Supabase local se ejecuta en puertos aislados. `pgvector` aún no está
  habilitado, por lo que la migración debe crear la extensión y probarla antes
  de activar la recuperación.

## Fuera de alcance

- DOCX, TXT, imágenes independientes, OCR de proveedores de pago, reranking,
  query rewriting, cache semántico, administración visual avanzada, staging y
  producción.

## Salida esperada

La Fase 1 termina cuando la especificación, la decisión arquitectónica, el
plan de pruebas, el estado compartido y las dependencias necesarias estén
documentados y listos para iniciar la migración de Fase 2.
