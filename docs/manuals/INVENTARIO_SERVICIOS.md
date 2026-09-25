# Inventario de servicios externos — AVEND ASESOR

> Estado verificado al 2026-09-25 sobre `main` (`3c764af`).
> Este documento lista **nombres** de variables y credenciales, nunca sus valores.
> Lo que no se puede comprobar desde el repositorio o la operación figura como **Por confirmar (PO)**.

## 1. Resumen

| SERVICIO | PROPÓSITO | RESPONSABLE | PLAN | COSTO | LÍMITES | AMBIENTE |
| --- | --- | --- | --- | --- | --- | --- |
| **GitHub** (`L3x-00/AvendAsesor` + Actions) | Código fuente, PR, CI y origen de los despliegues automáticos | Product Owner / cuenta del proyecto | Por confirmar (PO). Repositorio **público** | Por confirmar (PO) | `main` sin protección de rama; la última corrida de CI tardó ~3 min | Todos |
| **Vercel** (proyecto `avend-asesor-web`) | Aloja el web Next.js: UI y BFF | Product Owner / cuenta del proyecto | Por confirmar (PO) | Por confirmar (PO) | Cuerpo de función de 4.5 MB: las cargas grandes van directo del navegador a Render. Previews protegidas con login de Vercel | Producción `https://avend-asesor-web.vercel.app` y previews por rama/PR |
| **Render** (web service `avend-asesor-api`) | API NestJS (lógica, datos, Storage, RAG) y worker de ingesta en el mismo proceso | Product Owner / cuenta del proyecto | Free, región oregon | Sin costo de plan (Free) | 512 MB de RAM; se suspende tras ~15 min sin tráfico; arranque en frío de ~50 s | Producción `https://avend-asesor-api.onrender.com` |
| **Supabase producción** (`blxrdotroysitfyehmqw`, «AVENDSESOR») | Postgres 17 + pgvector, Auth y Storage | Product Owner / cuenta del proyecto | Free, **sin PITR** | Sin costo de plan (Free) | Sin PITR. Cuotas del plan: Por confirmar (PO). Buckets de 50 MiB y 10 MiB | Producción, `us-west-2` |
| **Supabase staging** (`scepelftmjlabepygrri`, «avend-asesor-staging») | Validación aislada de migraciones; check «Supabase Preview» en los PR | Product Owner / cuenta del proyecto | Por confirmar (PO) | Por confirmar (PO) | Por confirmar (PO) | Staging, `us-east-2` |
| **OpenRouter** | Gateway de IA: embeddings `text-embedding-3-small` (1536 dim.) y respuestas `gpt-4o-mini` | Product Owner / cuenta del proyecto | Pago por uso | Por confirmar (PO) | Dimensión fija de 1536; máximo 1500 tokens de salida por respuesta; tope de gasto: Por confirmar (PO) | Producción (lo llama Render) |
| **OpenAI API** | Proveedor directo alternativo, solo si falta `OPENROUTER_API_KEY` | Product Owner / cuenta del proyecto | Por confirmar (PO) | Por confirmar (PO) | No es un failover automático (ver §3.6) | Por confirmar (PO) si hay clave en Render |
| **Resend** (SMTP) | SMTP personalizado de Supabase Auth: confirmación, recuperación e invitaciones | Product Owner / cuenta del proyecto | Por confirmar (PO) | Por confirmar (PO) | Requiere un dominio verificado con SPF, DKIM y DMARC | Previsto para staging y producción; configuración real: Por confirmar (PO) |
| **Dominio propio** | — | Product Owner | No existe en el repositorio | Por confirmar (PO) | — | Hoy se usan `*.vercel.app` y `*.onrender.com` |

Tesseract (OCR) **no es un servicio externo**: es una biblioteca que corre dentro del proceso del API (ver §4).

## 2. Cómo se conectan

```text
Navegador ──► Vercel (UI + BFF) ──► Render (API NestJS) ──► Supabase (Postgres/pgvector, Storage, Auth admin)
   │              │                        └──► OpenRouter (embeddings + respuestas)  [u OpenAI directo]
   │              └──► Supabase Auth (sesión SSR; lectura del propio perfil vía RLS)
   ├──► Render directo: carga de documentos (≤ 50 MiB) e importación Excel (≤ 2 MiB)
   └──► Supabase Storage: descarga con URL firmada de 60 s (el BFF responde 307)

Supabase Auth ──► SMTP (Resend, si está configurado) ──► correo del usuario
GitHub (merge a main) ──► despliegue automático en Vercel y en Render
```

## 3. Detalle por servicio

### 3.1 GitHub (repositorio y Actions)

**Cómo depende el sistema**

- El repositorio `L3x-00/AvendAsesor` es **público** y su rama por defecto es `main`. La rama `main` **no tiene protección** (verificado con `gh` el 2026-09-25).
- CI en `.github/workflows/ci.yml`: se ejecuta en cada `pull_request` y en cada `push` a `main`. El job `validate` (`ubuntu-latest`, Node 24) corre `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`, `npm run build` y `npm run verify:build-artifacts`. Tiene permisos `contents: read`, no usa secretos y cancela las corridas anteriores de la misma rama.
- Checks que aparecen en los PR: `validate` (Actions), `Vercel` y `Vercel Preview Comments` (integración de Vercel) y `Supabase Preview` (integración de GitHub del proyecto de **staging** `scepelftmjlabepygrri`; hoy se reporta como *skipping*). Render no publica checks: despliega por auto-deploy al recibir commits en `main`.
- Un merge a `main` despliega el web (Vercel) y el API (Render) al mismo tiempo.

**Configuración**: la CI no usa variables de entorno ni secretos. Versión de Node del repositorio: `.nvmrc` (`24.14.0`) y `engines` de `package.json` (`>=24.14.0 <25`).

**Si falla**

- Si GitHub no está disponible, no hay push, PR, CI ni despliegues nuevos. Producción sigue funcionando con la última versión desplegada.
- Como `main` no está protegida, un merge con la CI en rojo **igual se despliega**. Exigir la CI verde antes del merge es una decisión pendiente: Por confirmar (PO).

**Dónde revisar**: pestaña *Actions* del repositorio y los checks del PR. Estado público: <https://www.githubstatus.com>.

### 3.2 Vercel (web)

**Cómo depende el sistema**

- El proyecto `avend-asesor-web` usa `apps/web` como directorio raíz (enlace local en `.vercel/repo.json`, no versionado). Next.js `16.3.0`.
- Producción: `https://avend-asesor-web.vercel.app`. Cada rama o PR genera una preview protegida con el login de Vercel.
- Vercel **solo sirve la UI y el BFF**. Toda la lógica de negocio vive en Render. Los *route handlers* de `apps/web/src/app/api/**` corren con `runtime = "nodejs"`:
  - proxy del chat en streaming (`apps/web/src/app/api/chat/stream/route.ts`);
  - descargas: el BFF pide al API una URL firmada y responde con una redirección 307 (`apps/web/src/app/api/admin/documents/[id]/access/route.ts`);
  - exportación de usuarios y reportes o sugerencias sobre las consultas (`apps/web/src/app/api/consultation-feedback/**`);
  - generación del PDF/DOCX de la ficha de orientación CU-14 con `pdfkit`, `fontkit` y `docx`, en `apps/web/src/app/api/chat/conversations/[conversationId]/messages/[messageId]/orientacion/[format]/route.ts`.
- La sesión se maneja con Supabase Auth (`@supabase/ssr`). El web lee el perfil propio y los permisos con la clave anon y la sesión del usuario, bajo RLS (`apps/web/src/lib/authorization/resolve-admin-access.ts`).

**Configuración** (variables de Vercel)

| Variable | Propósito | Obligatoria | Default | Dónde se valida |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase | Sí | — | `apps/web/src/lib/supabase/config.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave publicable (anon). Nunca la service role | Sí | — | `apps/web/src/lib/supabase/config.ts` |
| `ADMIN_API_URL` | Origen del API en Render. Se entrega al navegador solo como origen para las cargas directas | Sí | — | `apps/web/src/lib/admin-api/config.ts` (HTTPS, o HTTP solo en loopback; sin ruta, query ni credenciales) |
| `APP_URL` | URL canónica del web, usada para las redirecciones de Auth | Sí en producción | `http://localhost:3000` fuera de producción | `apps/web/src/lib/auth/site-url.ts` (exige HTTPS salvo en localhost) |

**Límites**

- Las funciones de Vercel admiten un cuerpo de hasta 4.5 MB (límite de la plataforma). Por eso la carga de documentos (hasta 50 MiB) y la importación de usuarios en Excel (hasta 2 MiB) van **directo del navegador a Render** con el bearer de Supabase y `credentials: "omit"` (`apps/web/src/components/admin/document-pdf-upload-form.tsx`, `apps/web/src/components/admin/users-import-form.tsx`). La razón también está en el comentario de `ADMIN_API_URL` en `.env.example`.
- **Riesgo no verificado**: los adjuntos de los reportes de consulta admiten hasta 10 MiB en el código (`apps/web/src/lib/chat-api/consultation-feedback-upload.ts`), pero pasan por el BFF (`/api/consultation-feedback/reports`). Un adjunto de más de 4.5 MB podría ser rechazado por Vercel antes de llegar al código. No se ha probado en producción.
- El API acepta un único origen CORS (`WEB_ORIGIN`, en `apps/api/src/application.factory.ts`). Las previews tienen otro origen, así que una carga directa desde una preview al API de producción es rechazada por CORS.
- Duración máxima de las funciones (relevante para el streaming del chat) y región de las funciones: dependen del plan, Por confirmar (PO). Qué Supabase y qué API usan las previews: Por confirmar (PO).

**Si falla**: sin Vercel no hay interfaz de usuario, aunque el API siga activo. Si falla un build, el despliegue anterior de producción sigue sirviendo.

**Dónde revisar**: panel de Vercel → proyecto `avend-asesor-web` → *Deployments* y *Logs*. Estado público: <https://www.vercel-status.com>.

### 3.3 Render (API y worker de ingesta)

**Cómo depende el sistema**

- Web service `avend-asesor-api`: plan Free, región oregon, runtime Node.
  - Build: `npm ci --include=dev && npm run build --workspace=api`.
  - Start: `npm run start:prod --workspace=api` (equivale a `node dist/main`).
  - Health check: `/health/ready`.
  - Auto-deploy con cada commit en `main`.
  - El proceso escucha en `0.0.0.0:PORT` (`apps/api/src/main.ts`). La versión efectiva de Node en Render: Por confirmar (PO).
- **Worker de ingesta en el mismo proceso**: `IngestionWorker` consulta `document_ingestion_jobs` cada 5 s (`@Interval(5000)`), solo si `RAG_INGESTION_WORKER_ENABLED=true`. Si está apagado, al arrancar deja en el log la advertencia `Ingestion worker is DISABLED` (`apps/api/src/ingestion/ingestion.worker.ts`).
  - Cada trabajo toma un *lease* de `RAG_INGESTION_LEASE_SECONDS` segundos.
  - Por defecto se hacen hasta 3 intentos (`max_attempts` en `supabase/migrations/20260821064610_create_hito3_rag_foundation.sql`).
- Endpoints de estado:
  - `GET /health`: *liveness*; siempre responde `ok`.
  - `GET /health/ready`: consulta `profiles` en Supabase con un timeout de 3 s y responde 503 si no puede (`apps/api/src/health/health.service.ts`, `apps/api/src/supabase/supabase-health.gateway.ts`).
  - `GET /admin/rag/readiness` (solo roles `admin` y `superadmin`): devuelve `workerEnabled`, `provider`, `embeddingModel`, `answerModel`, `matchThreshold`, los conteos de ingesta y `ready` (`apps/api/src/rag-admin/rag-readiness.service.ts`).

**Configuración** (variables de Render)

Salvo que se indique otro archivo, se validan con zod en `apps/api/src/config/environment.validation.ts`. Una configuración inválida detiene el arranque con `Invalid environment configuration.`

| Variable | Propósito | Obligatoria | Default |
| --- | --- | --- | --- |
| `NODE_ENV` | `development`, `test`, `staging` o `production` | No | `development` |
| `PORT` | Puerto HTTP | No | `3000` |
| `WEB_ORIGIN` | Único origen CORS; solo el origen, sin ruta. HTTPS obligatorio en staging y producción | Sí en producción | `http://localhost:3000` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Cliente de servidor de Supabase. Van las dos o ninguna (`apps/api/src/supabase/supabase.server-client.ts`) | Sí en producción. Con solo una, el arranque falla; sin ninguna, `/health/ready` responde 503 | — |
| `OPENROUTER_API_KEY` | Activa OpenRouter como gateway de IA | Una de las dos claves de IA es obligatoria si el worker está encendido | — |
| `OPENAI_API_KEY` | OpenAI directo; solo se usa si falta `OPENROUTER_API_KEY` | Ver la fila anterior | — |
| `AI_GATEWAY_BASE_URL` | Reemplaza el endpoint compatible con OpenAI | No | `https://openrouter.ai/api/v1` con OpenRouter (`apps/api/src/config/ai-gateway.ts`) |
| `RAG_EMBEDDING_MODEL` | Modelo de embeddings (debe dar 1536 dimensiones) | No | `text-embedding-3-small` |
| `RAG_ANSWER_MODEL` | Modelo de respuesta | No | `gpt-4o-mini` |
| `RAG_ANSWER_FALLBACK_MODEL` | Modelo de respaldo; solo se usa ante un error técnico del primario | No | — |
| `RAG_INGESTION_WORKER_ENABLED` | Enciende el worker de ingesta | No | `false` |
| `RAG_INGESTION_LEASE_SECONDS` | Duración del lease de un trabajo (30–900) | No | `300` |
| `RAG_MATCH_THRESHOLD` | Similitud mínima para aceptar evidencia (0–1) | No | `0.5` (`RAG_DEFAULT_MATCH_THRESHOLD` en `apps/api/src/rag/rag.constants.ts`) |
| `RAG_MATCH_COUNT` | Fragmentos recuperados (1–10) | No | `5` |
| `FAQ_MEMORY_FINGERPRINT_SECRET` | Secreto de servidor para la memoria de preguntas frecuentes (mínimo 32 caracteres) | No | — |
| `CHAT_HISTORY_LIMIT` | Tamaño de página del historial (1–50) | No | `20` |

**Límites** (plan Free)

- **512 MB de RAM.** La ingesta tiene guardas de memoria para no reiniciar la instancia:
  - OCR de a lo sumo 40 páginas por trabajo, renderizadas en lotes de 5, con un único worker de Tesseract por trabajo (`apps/api/src/ingestion/ingestion.service.ts`, `apps/api/src/ingestion/ocr.service.ts`);
  - tope de 5 000 000 caracteres extraídos y de 48 MiB de XML descomprimido por DOCX (`apps/api/src/ingestion/document-format.ts`);
  - en la carga, un PDF de más de 20 MiB se guarda sin analizar su número de páginas (`MAX_PDF_PARSE_BYTES` en `apps/api/src/documents/pdf-inspection.service.ts`).
- **Suspensión por inactividad.** La instancia se apaga tras ~15 min sin tráfico entrante (`docs/hito4/fase6/AUDITORIA_FASE4.md`) y tarda ~50 s en volver (`docs/hito3/INFORME_ESTADO_Y_MEJORA_ASISTENTE.md`). Consecuencias:
  - el chat muestra un aviso de activación a los 12 s (`COLD_START_NOTICE_MS` en `apps/web/src/components/chat/chat-panel.tsx`);
  - una carga hecha durante el arranque puede recibir un 503 de Render; el formulario pide reintentar (`apps/web/src/components/admin/document-pdf-upload-form.tsx`);
  - el worker **solo procesa mientras la instancia está despierta**. Si la instancia se suspende a mitad de un trabajo, el lease vence y otra pasada retoma el trabajo. Si ya se agotaron los intentos, queda `failed` con `LEASE_EXPIRED`.
- En `docs/hito4/fase6/AUDITORIA_FASE4.md` se propone un *pinger* externo gratuito contra `/health`. No hay evidencia de que esté configurado: Por confirmar (PO). Si se adopta, debe agregarse a este inventario.

**Si falla**

- Sin el API no hay login útil, datos, chat, cargas ni ingesta: el web queda en pie, pero sin funcionalidad.
- Render solo pasa el tráfico a una versión nueva cuando esta supera `/health/ready`. Como ese check depende de Supabase, un despliegue hecho mientras Supabase no responde no entra en servicio y sigue activa la versión anterior.

**Dónde revisar**: panel de Render → `avend-asesor-api` → *Events*, *Logs* y *Metrics* (el consumo de memoria se ve en *Metrics*). Pruebas rápidas: `curl -s https://avend-asesor-api.onrender.com/health/ready` y `GET /admin/rag/readiness` con una sesión de administrador. Estado público: <https://status.render.com>.

### 3.4 Supabase — producción (`blxrdotroysitfyehmqw`)

**Cómo depende el sistema**

- Proyecto «AVENDSESOR», región `us-west-2`, Postgres 17, plan Free **sin PITR**. Los documentos del Hito 1 lo llaman «proyecto de desarrollo»; hoy es **producción**.
- **Base de datos**: 51 migraciones en `supabase/migrations/`.
  - Extensiones `vector`, `pg_trgm` y `unaccent`, en el esquema `extensions`.
  - Embeddings `vector(1536)` con índice HNSW (`extensions.vector_cosine_ops`).
  - El retrieval del RAG se hace dentro de la misma base.
- **Auth**:
  - registro con confirmación de correo y recuperación de contraseña desde el web (`apps/web/src/lib/auth/auth-service.ts`);
  - invitaciones de usuarios administrados desde el API con `auth.admin.inviteUserByEmail` (`apps/api/src/supabase/supabase-user-administration.gateway.ts`);
  - rutas de callback usadas por la app: `/auth/callback?next=/auth/confirmed` y `/auth/callback?next=/auth/update-password`, según `supabase/config.toml` (configuración local). Los valores remotos de *Site URL* y *Redirect URLs* deben coincidir con `APP_URL`: Por confirmar (PO) en el panel.
- **Storage**: buckets privados.
  - `normative-documents`: 50 MiB; PDF, DOCX, DOC y Markdown (`supabase/migrations/20260910120000_document_upload_formats_and_size.sql`).
  - `consultation-case-attachments`: 10 MiB; JPEG, PNG, WebP, PDF, DOC y DOCX (`supabase/migrations/20260905100000_consultation_reports_and_quality.sql`).
  - Las descargas usan URLs firmadas de 60 s (`DOWNLOAD_URL_TTL_SECONDS` en `apps/api/src/documents/documents.service.ts`).
- **Quién se conecta**: el API, con la service role (Render). El web y el navegador, con la clave anon y la sesión del usuario (Vercel).
- El enlace local de la CLI (`supabase/.temp/project-ref`, no versionado) apunta a **producción**. Los scripts `scripts/backup-production-demo-seed.mjs`, `scripts/seed-production-demo-data.mjs` e `infrastructure/qa/Invoke-QAPilot.ps1` verifican este ref antes de actuar.

**Configuración**: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Render; `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel. Auth (URLs y SMTP) y Storage se configuran en el panel de Supabase o mediante migraciones.

**Límites**

- **Sin PITR ni backup físico.** Antes de cada migración se hace un respaldo lógico privado y una validación en staging (`docs/hito4/fase5/RELEASE_HITO3_HITO4.md`, `docs/database/DEMO_SEED.md`).
- Las migraciones se aplican **antes** de desplegar el código que las necesita. Nunca se ejecuta `supabase db push` desde un árbol de trabajo.
- Cuotas del plan Free (tamaño de la base, Storage, transferencia, usuarios activos, pausa por inactividad) y límites de envío de Auth en el proyecto remoto: Por confirmar (PO) en el panel. Los valores de `[auth.rate_limit]` de `supabase/config.toml` rigen **solo en local**.

**Si falla**: el impacto es total. Falla el login, el API responde 503, `/health/ready` falla (Render no activa despliegues nuevos), el RAG no recupera evidencia y la ingesta se detiene.

**Dónde revisar**: <https://supabase.com/dashboard/project/blxrdotroysitfyehmqw> → *Logs*, *Reports/Usage* y *Database → Backups*. Estado público: <https://status.supabase.com>.

### 3.5 Supabase — staging (`scepelftmjlabepygrri`)

- Proyecto «avend-asesor-staging», región `us-east-2`. Plan: Por confirmar (PO); el plan de Supabase se contrata por organización.
- Uso documentado: validación aislada de migraciones antes de promoverlas a producción (`docs/hito4/fase5/RELEASE_HITO3_HITO4.md`). Tiene conectada la integración de GitHub que publica el check «Supabase Preview» en los PR.
- No hay evidencia en el repositorio de que Render o las previews de Vercel apunten a staging: Por confirmar (PO).
- **Cuidado**: el ref que aparece en los checks de los PR es el de **staging**, no el de producción. Antes de aplicar una migración, confirma el proyecto destino por su ref y por sus datos.
- Si falla, no afecta a los usuarios. Se pierde el ensayo previo de las migraciones.
- Dónde revisar: <https://supabase.com/dashboard/project/scepelftmjlabepygrri>.

### 3.6 OpenRouter (y OpenAI como alternativa)

**Cómo depende el sistema**

- El gateway único es `createAiGatewayClient` (`apps/api/src/config/ai-gateway.ts`):
  - con `OPENROUTER_API_KEY` usa OpenRouter (base `AI_GATEWAY_BASE_URL` o `https://openrouter.ai/api/v1`, con las cabeceras `HTTP-Referer` = `WEB_ORIGIN` y `X-Title` = `AVEND ASESOR`);
  - si no, usa OpenAI con `OPENAI_API_KEY`;
  - sin ninguna de las dos, responde 503 (`The AI gateway is not configured.`).
- **No es un failover automático.** Si existe `OPENROUTER_API_KEY`, `OPENAI_API_KEY` se ignora. `RAG_ANSWER_FALLBACK_MODEL` es otro modelo **dentro del mismo gateway** y solo se usa ante un error técnico del primario (`apps/api/src/rag/openai-answer.gateway.ts`).
- Se usa en:
  - los embeddings de la ingesta y de cada consulta (`apps/api/src/ingestion/openai-embeddings.gateway.ts`, `apps/api/src/rag/rag.service.ts`);
  - la generación de respuestas, con un máximo de 1500 tokens de salida (`MAX_RAG_ANSWER_TOKENS` en `apps/api/src/rag/rag.constants.ts`).
- En producción: OpenRouter con `gpt-4o-mini` y `text-embedding-3-small` de 1536 dimensiones (`docs/hito3/RUNBOOK_ACTIVACION_EJE_B.md`). Con OpenRouter, los nombres de los modelos llevan el prefijo del proveedor (`openai/...`, ver `.env.example`). Los valores efectivos se consultan con `GET /admin/rag/readiness`.

**Configuración**: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `AI_GATEWAY_BASE_URL`, `RAG_EMBEDDING_MODEL`, `RAG_ANSWER_MODEL`, `RAG_ANSWER_FALLBACK_MODEL` (en Render, ver §3.3).

**Límites y costo**

- La dimensión de 1536 es fija: `RAG_EMBEDDING_DIMENSIONS` en `apps/api/src/config/ai-gateway.ts`, y el gateway rechaza cualquier otra. Cambiar el modelo de embeddings obliga a reindexar todo y a migrar la columna.
- Se cobra por uso; el monto mensual está Por confirmar (PO). Reindexar los 3 documentos actuales cuesta centavos (runbook). `npm run acceptance:hito3` (en `apps/api`) hace ~25 consultas reales al proveedor.
- `docs/architecture/INTEGRACION_OPENROUTER.md` recomienda configurar en OpenRouter un tope mensual de gasto, ZDR y una lista cerrada de modelos, y prohíbe los modelos gratuitos con datos reales. Si esa configuración está aplicada: Por confirmar (PO).

**Si falla**

- **Chat**: se emite el evento de error `CHAT_STREAM_FAILED` y la falla técnica se registra (`apps/api/src/chat/chat.controller.ts`).
- **Ingesta**: los trabajos se reintentan hasta `max_attempts` y luego quedan `failed`. El error se ve en `document_ingestion_jobs.last_error_code` y `last_error_message`. Para reencolar, usa la RPC `public.retry_document_ingestion` (`docs/hito3/RUNBOOK_ACTIVACION_EJE_B.md`).
- **Diagnóstico**:
  - `401 User not found` es la respuesta de OpenRouter ante una clave inválida;
  - `Incorrect API key provided` significa que la petición llegó a OpenAI con una clave de OpenRouter, es decir, que falta `OPENROUTER_API_KEY` en Render.

**Dónde revisar**: `GET /admin/rag/readiness`; panel de OpenRouter (*Activity*, *Credits*). Estado público: <https://status.openrouter.ai> (OpenAI: <https://status.openai.com>).

### 3.7 Resend (SMTP de Supabase Auth)

**Cómo depende el sistema**

- El web y el API no envían correos. Supabase Auth los envía: confirmación de registro, recuperación de contraseña e invitaciones.
- Para los ambientes remotos, `infrastructure/email/README.md` define Resend como SMTP personalizado:
  - host `smtp.resend.com`, puerto `587` (STARTTLS), usuario `resend`;
  - la contraseña es la API key de Resend y solo se guarda en el proveedor;
  - el remitente debe pertenecer a un dominio verificado.
- El repositorio **no tiene evidencia** de que Resend esté configurado en producción ni en staging: Por confirmar (PO). Sin SMTP personalizado, Supabase Auth usa su servicio de correo por defecto, que tiene límites de envío bajos. Verifica cuál está activo.

**Configuración**: panel de Supabase → *Authentication* → SMTP. No hay variables de entorno de la aplicación para el correo.

**Límites**: requiere un dominio verificado con SPF, DKIM y DMARC. Antes de abrir el registro al público, mantener el límite de envío de Auth y habilitar CAPTCHA (`infrastructure/email/README.md`).

**Si falla**

- Los usuarios nuevos no reciben la confirmación y nadie puede recuperar su contraseña.
- Crear un usuario desde el panel responde 503 (`The invitation could not be sent. Try again later.`).

**Dónde revisar**: *Authentication → Logs* en Supabase; panel de Resend (*Emails*, *Logs*). Estado público: <https://resend-status.com>.

## 4. Dependencias que no son servicios contratados

### Bibliotecas que corren dentro de la aplicación

| Biblioteca | Dónde corre | Uso |
| --- | --- | --- |
| `tesseract.js` 7 + `@tesseract.js-data/spa` | API (Render) | OCR en español de las páginas PDF con menos de 50 caracteres de texto. Los datos del idioma vienen en el paquete npm (`langPath` local en `apps/api/src/ingestion/ocr.service.ts`), así que no se descargan en ejecución |
| `pdf-parse` | API | Texto por página, conteo de páginas y render de páginas para el OCR |
| `mammoth` | API | Extracción de texto de DOCX. El `.doc` heredado se rechaza en la ingesta (`INGESTION_UNSUPPORTED_FORMAT`) |
| `js-tiktoken` | API | Conteo de tokens para el troceo (máx. 800 tokens por fragmento) |
| `exceljs` | API | Importación y exportación de usuarios en Excel |
| `pdfkit`, `fontkit`, `docx`, `@fontsource/*` | Web (Vercel) | Ficha de orientación CU-14 en PDF/DOCX, con fuentes incluidas en el paquete |

### Dependencias externas del build

| Dependencia | Cuándo se usa | Impacto si no está disponible |
| --- | --- | --- |
| Registro npm | `npm ci` en la CI, en el build de Render y en el de Vercel | No se puede construir ni desplegar |
| Actions `actions/checkout@v4` y `actions/setup-node@v4` | CI | La CI no corre |
| Google Fonts, vía `next/font/google` (`apps/web/src/app/layout.tsx`) | Build del web: Next descarga Geist y la sirve desde el propio despliegue | Puede fallar el build del web; en ejecución no se contacta a Google |

### Herramientas de desarrollo local (no se usan en producción)

| Herramienta | Uso | Referencia |
| --- | --- | --- |
| Docker Desktop | Requisito de Supabase local y de Mailpit | `infrastructure/mailpit/README.md` |
| Supabase CLI | Base local, migraciones y scripts de respaldo o seed | `supabase/config.toml`, `docs/database/DEMO_SEED.md` |
| Mailpit | Bandeja local de correos de Auth (`http://127.0.0.1:8025`). Nunca en staging ni en producción | `infrastructure/mailpit/compose.yaml` |

## 5. Credenciales por servicio (solo nombres)

| Credencial | Dónde vive | Quién la usa | Nota |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Variables de Render | API | Omite RLS. Nunca en Vercel ni con prefijo `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Variables de Vercel | Web y navegador | Clave publicable; el acceso a los datos lo limita RLS |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | Variables de Render | API | Generan costo por uso |
| `FAQ_MEMORY_FINGERPRINT_SECRET` | Variables de Render (opcional) | API | Mínimo 32 caracteres |
| API key de Resend | Panel de Supabase → SMTP (contraseña) | Supabase Auth | Nunca en el repositorio ni en el web |
| `SUPABASE_QA_PILOT_SECRET_KEY` | Temporal, en la sesión local del operador | `infrastructure/qa/Invoke-QAPilot.ps1` | Clave `sb_secret_` que no se guarda |

Los archivos `.env*` están ignorados por Git, salvo los `.env.example` (`.gitignore`). La rotación y custodia de las credenciales está a cargo del Product Owner; el procedimiento formal de rotación: Por confirmar (PO).

## 6. Pendientes por confirmar (PO)

1. Plan y costo de GitHub, Vercel, OpenRouter, OpenAI y Resend, y el plan de Supabase staging.
2. Si se protegerá `main` para exigir la CI verde antes del merge.
3. Si Resend está configurado como SMTP en producción y en staging, con su dominio verificado.
4. Tope de gasto, ZDR y lista cerrada de modelos en OpenRouter; si existe una clave de OpenAI en Render.
5. Cuotas del plan Free de Supabase y límites de envío de Auth en el proyecto remoto.
6. Límites de duración y región de las funciones de Vercel según el plan; qué API y qué Supabase usan las previews.
7. Si existe un *pinger* externo contra `/health`.
8. Dominio propio para el web y el correo.
9. Titular formal de cada cuenta de proveedor para la transferencia.

## 7. Mantenimiento de este inventario

Actualiza este documento en el mismo cambio que:

- agregue, quite o reemplace un servicio o SDK externo;
- cambie una variable de entorno (actualiza también `.env.example`, `apps/api/.env.example` y `apps/web/.env.example`);
- cambie el plan, la región o los límites de un proveedor.

Registra siempre la fecha de verificación al inicio.

Ver también: [Variables de entorno](VARIABLES_DE_ENTORNO.md), [Manual de despliegue](MANUAL_DESPLIEGUE.md) y [Guía de instalación local](GUIA_INSTALACION_LOCAL.md).
