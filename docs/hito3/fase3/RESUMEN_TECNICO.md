# Hito 3 — Fase 3: ingesta local y vectorización

## Objetivo

Procesar en segundo plano los PDFs privados ya cargados: extraer texto,
aplicar OCR local solo cuando corresponda, segmentar y persistir vectores.

## Entregado

- Worker configurable y desactivado por defecto para no procesar por accidente.
- Extracción por página mediante `pdf-parse` y renderizado selectivo para OCR.
- Tesseract local con datos de idioma español; no descarga modelos en runtime.
- Chunking estructural con páginas, título, artículo/numeral cuando existen,
  máximo de 800 tokens y solapamiento de 100.
- Puerto de embeddings y adaptador OpenAI intercambiable para
  `text-embedding-3-small` (1536 dimensiones).
- Validación de dimensión, escrituras por lotes, renovación de lease y fallo
  reintentable sin marcar una versión incompleta como indexada.
- Pruebas unitarias de extracción, OCR, chunks, worker, vectores, lotes y
  errores; no usan claves ni llamadas reales.

## Límite

El procesamiento real requiere una clave de proveedor autorizada; las pruebas
actuales usan dobles deterministas y validan todo el contrato local.
