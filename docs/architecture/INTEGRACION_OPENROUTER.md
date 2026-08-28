# Integración de IA — OpenRouter como gateway único (RAG)

**Estado:** implementado en `apps/api` (rama de integración), pendiente de claves y activación en Render.
**Principio:** un solo gateway compatible con la API de OpenAI. Con `OPENROUTER_API_KEY` todo el
tráfico (embeddings y generación) se enruta por OpenRouter; en su ausencia se usa `OPENAI_API_KEY`
directo. Falla de forma cerrada si no hay credencial: nunca inventa proveedor ni respuesta.

## Roles de los modelos

| Rol | Prueba (gratis) | Producción |
| --- | --- | --- |
| Embeddings | *(validar antes)* `openai/text-embedding-3-small` | `openai/text-embedding-3-small` |
| Respuesta RAG | `google/gemma-4-31b-it:free` | `openai/gpt-5-mini` |
| Fallback (solo error técnico) | `openai/gpt-5-mini` | `openai/gpt-5-mini` |

## Restricción crítica de dimensiones

El esquema pgvector exige **vectores de 1536 dimensiones** (`vector(1536)`). El gateway solicita
`dimensions: 1536` y mantiene un *guard* que rechaza cualquier respuesta que no tenga exactamente 1536
(`RAG_EMBEDDING_DIMENSIONS` en `config/ai-gateway.ts`). Por eso:

- `text-embedding-3-small` es seguro (soporta 1536).
- Un modelo de 2048 nativas (p. ej. NVIDIA Nemotron Embed) **no** es compatible sin reindexado y
  migración de columna; el guard lo bloqueará. No mezclar dimensiones con los vectores existentes.
- Antes de usar cualquier embeddings free, **validar con datos sintéticos** que OpenRouter devuelva 1536.

## Regla de fallback

`RAG_ANSWER_FALLBACK_MODEL` se activa **solo ante error técnico** del modelo primario (límite, caída,
modelo inválido). **Nunca** por falta de evidencia ni por ambigüedad: esas decisiones (`evidence` /
`ambiguous` / `no_evidence`) se toman antes en `rag.service`, y el generador ni se invoca en esos casos.

## Advertencia de privacidad (datos reales)

Los modelos gratuitos y algunos endpoints (NVIDIA/Inkling) registran o usan datos. **No** enviarles
consultas reales de docentes, historiales ni documentos privados. Uso free solo con **corpus ficticio o
público anonimizado**. Producción con datos reales: `text-embedding-3-small` + `gpt-5-mini` vía
OpenRouter con ZDR, límite mensual y lista cerrada de modelos.

## Qué hace el Product Owner en Render (API) para empezar a probar

En el Web Service del API (`avend-asesor-api`) → **Environment**:

1. `OPENROUTER_API_KEY` = tu clave de OpenRouter.
2. `RAG_EMBEDDING_MODEL` = `openai/text-embedding-3-small`
3. `RAG_ANSWER_MODEL` = `google/gemma-4-31b-it:free` (prueba) — o `openai/gpt-5-mini` (producción).
4. `RAG_ANSWER_FALLBACK_MODEL` = `openai/gpt-5-mini`
5. (Opcional) `AI_GATEWAY_BASE_URL` solo si se quiere forzar otro endpoint; por defecto ya usa OpenRouter.
6. En OpenRouter: activar **ZDR**, fijar **límite mensual** y una **lista cerrada de modelos**.
7. Cargar el **corpus** (PDFs) por el panel admin y esperar a que queden `indexed`.
8. Recién entonces poner `RAG_INGESTION_WORKER_ENABLED=true` para procesar la ingesta.
9. Probar el chat con **corpus ficticio**; medir evidencia/latencia antes de subir a datos reales.

> No se activa nada por defecto: sin `OPENROUTER_API_KEY`/`OPENAI_API_KEY` el proveedor falla cerrado,
> y con el worker en `false` no hay ingesta. La activación es una decisión explícita del PO.

## Mejora posterior (opcional)

Reranker de OpenRouter para reordenar los 15–20 fragmentos antes de responder — solo después de medir el
RAG con un corpus sintético. No usar `openrouter/free` (no auditable) ni dos generadores "votando".
