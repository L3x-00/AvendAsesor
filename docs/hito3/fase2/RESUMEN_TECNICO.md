# Hito 3 — Fase 2: persistencia RAG y seguridad de datos

## Objetivo

Incorporar los datos derivados del RAG sin debilitar los documentos privados,
las versiones inmutables ni el modelo RBAC/RLS del Hito 2.

## Entregado

- Extensión `pgvector` en el esquema `extensions` y vector de 1536 dimensiones.
- Cola durable por versión, con lease, reintentos, estados controlados e
  idempotencia.
- `document_chunks`, conversaciones, mensajes, fuentes y consultas no
  respondidas con integridad referencial.
- RLS, revocaciones explícitas y RPCs restringidas al adaptador server-side.
- Índices HNSW y GIN; búsqueda que solo considera documentos activos, versión
  vigente, ingestión indexada y módulos activos.
- 105 contratos pgTAP locales, incluidos permisos, transición fail-closed,
  filtro dinámico de módulo y trazabilidad de fuentes.

## Límite

No se habilitó acceso directo del navegador a PostgREST, Storage, vectores ni
tablas de conversación.
