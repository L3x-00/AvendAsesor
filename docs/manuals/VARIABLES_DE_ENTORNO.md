# Variables de entorno — AVEND ASESOR

Referencia de todas las variables de entorno que el código lee realmente, dónde
se validan y dónde se configuran en producción. Verificado contra el código de
`main` (commit `3c764af`) el 2026-09-25.

Reglas de este documento:

- No contiene valores secretos. Solo nombres, propósito, obligatoriedad, valor
  por defecto y lugar de validación.
- Los archivos `.env` reales están fuera de Git (`.gitignore` ignora `.env*`
  salvo `.env.example`). Nunca se suben ni se copian a documentación, tickets o
  chat.
- Lo que no se pudo verificar desde el repositorio aparece como
  **Por confirmar (PO)**.

---

## 1. Resumen

| Servicio | Archivo local | Producción | Validación |
| --- | --- | --- | --- |
| API (`apps/api`, NestJS) | `apps/api/.env` | Render, Web Service `avend-asesor-api` → *Environment* | Esquema Zod al arrancar (`apps/api/src/config/environment.validation.ts`) |
| Web (`apps/web`, Next.js) | `apps/web/.env.local` | Vercel, proyecto `avend-asesor-web` → *Environment Variables* | Perezosa, al usarse (`apps/web/src/lib/**/config.ts`, `site-url.ts`) |
| Supabase | — | Panel del proyecto (Auth, SMTP) | No lee variables de la aplicación |
| Scripts y QA | Variables de proceso puntuales | — | Cada script (ver §7) |

El repositorio no tiene `render.yaml`, `vercel.json` ni otra configuración
declarativa de despliegue: `infrastructure/render/` e `infrastructure/vercel/`
están vacías. La configuración de producción vive solo en los paneles de Render
y Vercel.

---

## 2. Cómo se cargan

### 2.1 API

- `ConfigModule.forRoot({ cache: true, isGlobal: true, validate: validateEnvironment })`
  en `apps/api/src/app.module.ts`.
- Sin `envFilePath`, `@nestjs/config` lee solo `<cwd>/.env`. Con
  `npm run dev:api` (o `--workspace=api`) el `cwd` es `apps/api`, así que el
  archivo es `apps/api/.env`. **No lee `.env.local`.**
- Las variables del proceso (`process.env`, las de Render) tienen prioridad
  sobre las del archivo.
- Si la validación falla, la API no arranca y solo registra
  `Invalid environment configuration.`, sin decir qué variable falló.
- **Una línea vacía como `OPENAI_API_KEY=` cuenta como valor** (cadena vacía) y
  hace fallar la validación. Las únicas excepciones son `SUPABASE_URL=` y
  `SUPABASE_SERVICE_ROLE_KEY=` cuando ambas están vacías (§3.2), y
  `RAG_MATCH_THRESHOLD=`, que se convierte en `0` sin avisar (ver §9). Se
  verificó ejecutando `validateEnvironment` con cada caso. Si una variable
  opcional no se usa, bórrela o coméntela; no la deje vacía.
- El esquema usa `.passthrough()`: acepta variables que no declara (por ejemplo
  `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, que se validan en otro lugar).

### 2.2 Web

- Next.js carga `.env`, `.env.local` y `.env.<modo>[.local]` desde `apps/web`.
- Las `NEXT_PUBLIC_*` se incrustan en el bundle del navegador **durante el
  build**. Si cambian, hay que volver a construir y desplegar.
- Las variables solo de servidor (`ADMIN_API_URL`, `APP_URL`) se leen en
  tiempo de ejecución. En Vercel, un cambio solo se aplica a los despliegues
  nuevos.
- No hay validación al arrancar. Una variable faltante o inválida aparece como
  error cuando se ejecuta la ruta que la usa.

---

## 3. API (`apps/api`)

Obligatoria = la API no funciona bien en un ambiente real sin ella, aunque el
esquema tenga un valor por defecto.

### 3.1 Servidor

| Variable | Obligatoria | Por defecto | Secreta | Propósito y reglas |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Sí en producción | `development` | No | Valores permitidos: `development`, `test`, `staging` y `production`. Con `staging` o `production`, `WEB_ORIGIN` debe ser HTTPS. Cualquier otro valor, o un valor vacío, impide el arranque. |
| `PORT` | No (Render la define) | `3000` | No | Puerto de escucha. `main.ts` enlaza en `0.0.0.0`. Entero de 1 a 65535. En local use `3001`: la web ocupa `3000` y espera la API en `3001`. |
| `WEB_ORIGIN` | Sí en producción | `http://localhost:3000` | No | Único origen permitido por CORS (`application.factory.ts`, `credentials: true`). Debe ser un origen HTTP(S) exacto: la barra final se normaliza y se rechazan ruta, query, fragmento y credenciales. También se envía como `HTTP-Referer` a OpenRouter (`ai-gateway.ts`). |

### 3.2 Supabase

| Variable | Obligatoria | Por defecto | Secreta | Propósito y reglas |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Sí (ambientes reales) | — | No | URL del proyecto Supabase, con la forma `https://<ref>.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí (ambientes reales) | — | **Sí, crítica** (salta RLS) | Clave de servidor del cliente Supabase de la API. También sirve para validar el bearer de los usuarios con `auth.getUser` (`supabase-auth.gateway.ts`). Nunca debe llegar a la web. |

No están en el esquema Zod. Las valida `createSupabaseServerClient`
(`apps/api/src/supabase/supabase.server-client.ts`):

- Ambas presentes: se crea el cliente.
- Ambas ausentes: la API arranca, `/health` responde `200` y
  `/health/ready` responde `503`. En Render, el health check falla.
- Solo una presente: la API no arranca (`Supabase server configuration is invalid.`).

### 3.3 Proveedor de IA

| Variable | Obligatoria | Por defecto | Secreta | Propósito y reglas |
| --- | --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | Una de las dos para RAG | — | **Sí** (genera costo) | Si existe, todo el tráfico de IA (embeddings y respuestas) pasa por OpenRouter. |
| `OPENAI_API_KEY` | Una de las dos para RAG | — | **Sí** (genera costo) | Se usa solo si falta `OPENROUTER_API_KEY`. En ese caso las llamadas van directo a OpenAI. |
| `AI_GATEWAY_BASE_URL` | No | OpenRouter: `https://openrouter.ai/api/v1`. OpenAI: el endpoint del SDK. | No | Sobrescribe el endpoint compatible con la API de OpenAI. Debe ser una URL válida. |

Selección del proveedor (`apps/api/src/config/ai-gateway.ts`):

| `OPENROUTER_API_KEY` | `OPENAI_API_KEY` | Resultado |
| --- | --- | --- |
| presente | cualquiera | OpenRouter. `baseURL` = `AI_GATEWAY_BASE_URL` o `https://openrouter.ai/api/v1`. Cabeceras `HTTP-Referer` (= `WEB_ORIGIN`) y `X-Title: AVEND ASESOR`. |
| ausente | presente | OpenAI directo. Usa `AI_GATEWAY_BASE_URL` si está definida. |
| ausente | ausente | Falla de forma cerrada: cuando una consulta llega a la búsqueda o a la generación, `createAiGatewayClient` lanza `The AI gateway is not configured.` y, como `POST /chat/stream` ya respondió `200` con SSE, el cliente recibe el evento `error` con código `CHAT_STREAM_FAILED` (`apps/api/src/chat/chat.controller.ts`). No se inventa respuesta. No se puede encender el worker (§3.4). |

`GET /admin/rag/readiness`, con token de `admin` o `superadmin`, muestra qué
proveedor está activo (`openrouter`, `openai` o `none`) sin exponer las claves
(`apps/api/src/rag-admin/`).

### 3.4 RAG e ingesta

| Variable | Obligatoria | Por defecto | Secreta | Propósito y reglas |
| --- | --- | --- | --- | --- |
| `RAG_EMBEDDING_MODEL` | Recomendada con OpenRouter (ver nota) | `text-embedding-3-small` | No | Modelo de embeddings. Debe devolver **1536 dimensiones** (`vector(1536)`, constante `RAG_EMBEDDING_DIMENSIONS` en `ai-gateway.ts`). Cambiarlo exige reindexar todo el corpus. |
| `RAG_ANSWER_MODEL` | Recomendada con OpenRouter (ver nota) | `gpt-4o-mini` | No | Modelo que genera la respuesta (`apps/api/src/rag/openai-answer.gateway.ts`). |
| `RAG_ANSWER_FALLBACK_MODEL` | No | — (sin respaldo) | No | Modelo de respaldo. Se usa **solo** ante un error técnico del primario; nunca por falta de evidencia. Se ignora si es igual al primario o si la petición se abortó. |
| `RAG_INGESTION_WORKER_ENABLED` | No | `false` | No | Solo acepta exactamente `true` o `false`. Con `true`, el worker consulta la cola cada 5 s (`ingestion.worker.ts`) y hace falta `OPENROUTER_API_KEY` u `OPENAI_API_KEY`: sin ninguna, la API no arranca. Con `false`, los documentos cargados quedan pendientes y el arranque registra una advertencia. |
| `RAG_INGESTION_LEASE_SECONDS` | No | `300` | No | Segundos de *lease* al reclamar un trabajo de ingesta (`ingestion.service.ts`). Entero de 30 a 900. |
| `RAG_MATCH_THRESHOLD` | No | `0.5` (`RAG_DEFAULT_MATCH_THRESHOLD`, `apps/api/src/rag/rag.constants.ts`) | No | Similitud coseno mínima (0 a 1) para aceptar un fragmento como evidencia. `0.5` es el valor calibrado con el corpus real. No volver a `0.7`: con ese valor casi toda consulta real queda sin evidencia. |
| `RAG_MATCH_COUNT` | No | `5` | No | Máximo de fuentes por respuesta. Cada búsqueda pide `min(10, 2 × valor)` candidatos (`rag.service.ts`). Entero de 1 a 10. |

Nombres de modelo: los valores por defecto del código (`gpt-4o-mini` y
`text-embedding-3-small`) son nombres de OpenAI directo. Con OpenRouter activo,
el `.env.example` de la raíz pide usar los nombres de OpenRouter, con prefijo
de proveedor (por ejemplo `openai/text-embedding-3-small`). Por eso conviene
definir ambos modelos de forma explícita en Render. Si OpenRouter acepta o no
los nombres sin prefijo no se puede comprobar desde el repositorio: **Por
confirmar (PO)**.

### 3.5 Chat y memoria FAQ

| Variable | Obligatoria | Por defecto | Secreta | Propósito y reglas |
| --- | --- | --- | --- | --- |
| `CHAT_HISTORY_LIMIT` | No | `20` | No | Tamaño de página del historial de conversaciones cuando el cliente no envía `limit` (`chat.service.ts`). Entero de 1 a 50. |
| `FAQ_MEMORY_FINGERPRINT_SECRET` | No | — (memoria FAQ desactivada) | **Sí** | Clave HMAC-SHA256 para calcular la huella de las preguntas redactadas (`apps/api/src/learning/faq-memory.service.ts`). Mínimo 32 caracteres. Sin ella, la memoria FAQ queda desactivada de forma segura. Al rotarla, las huellas nuevas dejan de coincidir con las anteriores y se reinicia el conteo de recurrencia. |

Para generar un valor adecuado, de forma local y sin compartirlo:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

---

## 4. Web (`apps/web`)

| Variable | Obligatoria | Por defecto | Secreta | Propósito y reglas | Dónde se lee |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | — | No | URL del proyecto Supabase para el cliente del navegador, el del servidor y el refresco de sesión en `proxy.ts`. | `src/lib/supabase/config.ts`, `client.ts`, `server.ts`, `update-session.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | — | No (pública por diseño; la protección es RLS) | Clave anon/publicable de Supabase. **Nunca** poner aquí la clave de servicio. | idem |
| `ADMIN_API_URL` | Sí | — | No | Origen de la API NestJS. Debe ser `https://` o `http://` de loopback (`localhost` o `127.0.0.1`), sin ruta, query, fragmento ni credenciales. La usan los clientes de servidor (admin, chat, reportes y el proxy SSE `/api/chat/stream`). También se pasa como `apiBaseUrl` al navegador para la carga directa de documentos y la importación de usuarios (`document-pdf-upload-form.tsx`, `users-import-form.tsx`). No lleva prefijo `NEXT_PUBLIC_`, pero **no es secreta**. | `src/lib/admin-api/config.ts` (`server-only`) |
| `APP_URL` | Sí en producción | `http://localhost:3000` (solo si `NODE_ENV` ≠ `production`) | No | URL canónica de la web. Construye los `redirectTo` de Auth (confirmación de correo y recuperación de contraseña, `src/app/auth/actions.ts`) y valida la cabecera `Origin` en el cierre de sesión, los reportes y sugerencias de consulta y la descarga de orientación (`hasTrustedRequestOrigin`). Debe usar HTTPS salvo en `localhost` o `127.0.0.1`. | `src/lib/auth/site-url.ts` |
| `NODE_ENV` | — (la define Next.js) | `development` en `next dev`, `production` en `next build`/`next start` | No | Solo decide si `APP_URL` puede caer al valor local por defecto. | `src/lib/auth/site-url.ts` |

Errores cuando falta una variable:

- Sin Supabase público: `Supabase public configuration is incomplete.` Falla el
  proxy de sesión, así que falla casi toda la app.
- Sin `ADMIN_API_URL`: `Administrative API configuration is incomplete.` (o
  `... is invalid.` si el formato no es válido).
- Sin `APP_URL` en producción: `APP_URL must be configured outside local development.`

`apps/web` no lee ninguna otra variable (`VERCEL_*`, claves de IA, etc.) y
tampoco usa la clave de servicio de Supabase.

---

## 5. Producción: dónde se configura cada variable

Proyectos: Supabase de producción `blxrdotroysitfyehmqw` (AVENDSESOR,
us-west-2, Postgres 17, plan Free sin PITR) y staging `scepelftmjlabepygrri`
(avend-asesor-staging, us-east-2). API en `https://avend-asesor-api.onrender.com`
y web en `https://avend-asesor-web.vercel.app`. Al fusionar a `main` se
despliegan la API y la web.

### 5.1 Render — `avend-asesor-api` (plan free, región oregon)

Build: `npm ci --include=dev && npm run build --workspace=api`. Arranque:
`npm run start:prod --workspace=api`. Health check: `/health/ready`.

| Variable | Estado conocido en producción |
| --- | --- |
| `SUPABASE_URL` | Configurada (`/health/ready` responde `200`). Apunta al proyecto de producción, `https://blxrdotroysitfyehmqw.supabase.co` (misma URL que usan `scripts/seed-production-demo-data.mjs` y `scripts/backup-production-demo-seed.mjs`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Configurada. Secreta: solo en Render. |
| `WEB_ORIGIN` | Origen público exacto de Vercel (`docs/hito4/fase5/RELEASE_HITO3_HITO4.md`: CORS permite ese origen). |
| `NODE_ENV` | Esperado `production`. Valor real: **Por confirmar (PO)**. Nota: `nest build` necesita `@nestjs/cli`, que es devDependency de `apps/api`, y `npm ci` omite las devDependencies cuando `NODE_ENV=production`; por eso el build usa `--include=dev`. |
| `PORT` | Render la define para los Web Services. Si se fijó un valor explícito: **Por confirmar (PO)**. |
| `OPENROUTER_API_KEY` | Configurada: el proveedor activo es OpenRouter (`docs/hito3/RUNBOOK_ACTIVACION_EJE_B.md`). |
| `OPENAI_API_KEY` | **Por confirmar (PO)**. Mientras exista `OPENROUTER_API_KEY`, no se usa. |
| `AI_GATEWAY_BASE_URL` | **Por confirmar (PO)**. Si no está definida, se usa el endpoint de OpenRouter. |
| `RAG_EMBEDDING_MODEL` | Modelo en uso: text-embedding-3-small (1536 dimensiones). Cadena exacta: **Por confirmar (PO)**; se puede leer en el campo `embeddingModel` de `GET /admin/rag/readiness`. |
| `RAG_ANSWER_MODEL` | Modelo en uso: gpt-4o-mini. Cadena exacta: **Por confirmar (PO)**; se puede leer en el campo `answerModel` de `GET /admin/rag/readiness`. |
| `RAG_ANSWER_FALLBACK_MODEL` | **Por confirmar (PO)**. |
| `RAG_INGESTION_WORKER_ENABLED` | `true` (worker encendido según el runbook del 2026-09-24). |
| `RAG_MATCH_THRESHOLD` | `0.5` o sin definir (el valor por defecto ya es `0.5`). |
| `RAG_MATCH_COUNT`, `RAG_INGESTION_LEASE_SECONDS`, `CHAT_HISTORY_LIMIT` | **Por confirmar (PO)**. Si no están definidas, se usan los valores por defecto. |
| `FAQ_MEMORY_FINGERPRINT_SECRET` | **Por confirmar (PO)**. Sin ella, la memoria FAQ está desactivada. |
| Versión de Node | `package.json` raíz: `engines.node` `>=24.14.0 <25`. Si Render la toma de ahí o de una variable propia: **Por confirmar (PO)**. |

### 5.2 Vercel — `avend-asesor-web`

| Variable | Estado conocido en producción |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Configurada (la app funciona). Proyecto de producción. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Configurada. Clave pública del proyecto de producción. |
| `ADMIN_API_URL` | `https://avend-asesor-api.onrender.com` (`RELEASE_HITO3_HITO4.md`). |
| `APP_URL` | Esperado `https://avend-asesor-web.vercel.app`. Valor exacto: **Por confirmar (PO)**. |

Previews: están protegidos por el login de Vercel. Qué valores tienen las
variables en el alcance *Preview*, y a qué proyecto Supabase apuntan:
**Por confirmar (PO)**.

### 5.3 Supabase (panel del proyecto)

La aplicación no tiene Edge Functions (no existe `supabase/functions/`; en Git
`supabase/` solo versiona `config.toml`, `migrations/`, `tests/` y su
`.gitignore`), así que no usa *secrets* de Supabase.
Lo que se configura en el panel es:

- **Auth → URL Configuration:** Site URL = `APP_URL`. Redirect URLs =
  `<APP_URL>/auth/callback?next=/auth/confirmed` y
  `<APP_URL>/auth/callback?next=/auth/update-password`. Los equivalentes
  locales están en `supabase/config.toml` (`[auth]`). Valores cargados en
  producción: **Por confirmar (PO)**.
- **Auth → SMTP:** la decisión documentada es Resend como SMTP personalizado
  (`infrastructure/email/README.md`). La clave de Resend vive solo en ese
  panel; no es una variable de la web ni de la API. Estado en producción:
  **Por confirmar (PO)**.

### 5.4 Staging

Existe el proyecto `scepelftmjlabepygrri`. Qué despliegue de API o web apunta a
él, y con qué variables: **Por confirmar (PO)**. Antes de usar credenciales,
confirme con datos a qué proyecto apuntan.

---

## 6. Coherencia entre servicios

Antes de cambiar una URL o un proyecto, revise que estas parejas sigan
cuadrando:

| Regla | Si no se cumple |
| --- | --- |
| `WEB_ORIGIN` (API) = origen de `APP_URL` (web) = origen que abre el usuario | Falla CORS en las llamadas directas del navegador a la API (carga de documentos, importación de usuarios). |
| `APP_URL` = origen real del despliegue | `hasTrustedRequestOrigin` rechaza el cierre de sesión, los reportes y sugerencias y la descarga de orientación. |
| `ADMIN_API_URL` (web) = URL pública de la API, sin ruta | Fallan las páginas admin, el chat y los reportes. |
| `NEXT_PUBLIC_SUPABASE_URL` (web) y `SUPABASE_URL` (API) = mismo proyecto | La API rechaza tokens emitidos por otro proyecto y los datos no coinciden. |
| Redirect URLs de Supabase Auth incluyen las dos rutas de callback de `APP_URL` | Fallan la confirmación de correo y la recuperación de contraseña. |
| `RAG_EMBEDDING_MODEL` con 1536 dimensiones y el mismo modelo que indexó el corpus | Error `The RAG provider returned an invalid embedding response.` (`openai-embeddings.gateway.ts`), o una búsqueda incoherente hasta reindexar. |
| `RAG_INGESTION_WORKER_ENABLED=true` solo con una clave de proveedor | La API no arranca. |

`WEB_ORIGIN` admite **un solo** origen. Un preview de Vercel con otro dominio no
pasa CORS en las llamadas directas del navegador. Las llamadas de servidor a
servidor (proxy SSE, clientes admin) no dependen de CORS.

Para verificar sin exponer secretos:

```bash
curl -s https://avend-asesor-api.onrender.com/health/ready
```

Con sesión de administrador, `GET /admin/rag/readiness` devuelve
`workerEnabled`, `provider`, `providerConfigured`, `embeddingModel`,
`answerModel`, `matchThreshold`, los conteos de ingesta (`counts`) y `ready`
(`apps/api/src/rag-admin/rag-readiness.service.ts`).

---

## 7. Desarrollo local, CI y scripts

### 7.1 Stack local con Supabase CLI

`infrastructure/local/Invoke-LocalEnvironment.ps1` toma las credenciales de
`supabase status` (solo acepta `localhost` o `127.0.0.1`), las pone en el
proceso y ejecuta el comando:

```powershell
.\infrastructure\local\Invoke-LocalEnvironment.ps1 -Target api npm run dev:api
.\infrastructure\local\Invoke-LocalEnvironment.ps1 -Target web npm run dev:web
```

| Objetivo | Variables que define |
| --- | --- |
| `api` | `SUPABASE_URL` (API local), `SUPABASE_SERVICE_ROLE_KEY` (de `supabase status`), `WEB_ORIGIN=http://localhost:3000`, `NODE_ENV=development`, `PORT=3001` |
| `web` | `NEXT_PUBLIC_SUPABASE_URL` (API local), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (de `supabase status`), `ADMIN_API_URL=http://localhost:3001`, `APP_URL=http://localhost:3000`, `NODE_ENV=development` |

Si prefiere archivos, estos son los mínimos equivalentes. Los marcadores
`<...>` se reemplazan con la salida de `supabase status`. El puerto de la API
local de Supabase es `55321` (`supabase/config.toml`).

`apps/api/.env`:

```dotenv
NODE_ENV=development
PORT=3001
WEB_ORIGIN=http://localhost:3000
SUPABASE_URL=http://127.0.0.1:55321
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY de supabase status>
RAG_INGESTION_WORKER_ENABLED=false
```

`apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY de supabase status>
ADMIN_API_URL=http://localhost:3001
APP_URL=http://localhost:3000
```

Agregue las variables de IA (§3.3 y §3.4) solo si va a probar el RAG, y con
valores reales: nunca las deje vacías.

### 7.2 CI

`.github/workflows/ci.yml` no define variables ni secretos. Lint, typecheck,
tests, e2e y build corren sin `.env`: las pruebas unitarias construyen su
configuración en el código, y la e2e (`apps/api/test/app.e2e-spec.ts`) levanta
`AppModule` con los valores por defecto del esquema y proveedores sustituidos.
En local, esa e2e también lee `apps/api/.env` si existe, así que un archivo con
valores vacíos la hace fallar.

### 7.3 Scripts y herramientas

| Variable | Usada por | Obligatoria | Secreta | Propósito |
| --- | --- | --- | --- | --- |
| `ACCEPTANCE_ENV_FILE` | `npm run acceptance:hito3` (`apps/api/test/acceptance/hito3-client-cases.ts`) | Sí | No (es una ruta) | Ruta a un archivo de entorno fuera de Git con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y una clave de proveedor. El script fuerza `RAG_INGESTION_WORKER_ENABLED=false` y valida con `validateEnvironment`, así que aplican las mismas reglas de valores vacíos. Usa servicios reales y consume saldo del proveedor. Antes de ejecutarlo, confirme a qué proyecto apunta el archivo: el nombre no garantiza el ambiente. |
| `ACCEPTANCE_OUT` | mismo script | No | No | Prefijo de los reportes `.json` y `.md`. Por defecto `test/acceptance/out/hito3-acceptance` (ignorado por Git). |
| `SUPABASE_QA_PILOT_SECRET_KEY` | `infrastructure/qa/Invoke-QAPilot.ps1` | Solo en modo `Apply` o `Cleanup` | **Sí** | Clave temporal moderna con prefijo `sb_secret_`. El script rechaza claves legacy `service_role`. Vive solo en el proceso: nunca en `.env`, Render, Vercel ni Git (`infrastructure/qa/README.md`). |
| `AVEND_LOCAL_STATUS_BASE64` | `infrastructure/local/Test-LocalAdminWeb.ps1`, `Test-LocalAuthRls.ps1`, `Test-LocalDocumentSecurity.ps1`, `Test-LocalDocumentsApi.ps1` y `Test-LocalModulesApi.ps1` | — | Contiene credenciales locales | Variable interna: los scripts la definen para sus pruebas Node embebidas. No se define a mano. |
| `ComSpec` | `scripts/seed-production-demo-data.mjs`, `scripts/backup-production-demo-seed.mjs` | — (del sistema operativo) | No | Ubica `cmd.exe` para invocar `supabase.cmd` en Windows. |
| `LOCALAPPDATA` | `scripts/backup-production-demo-seed.mjs` | — (del sistema operativo) | No | Carpeta base de los respaldos locales; si falta, usa el directorio temporal del sistema. |

Los seeds (`npm run demo:*`) no leen variables de la aplicación. El seed local
toma sus credenciales de `supabase status`. El de producción las toma de
`supabase projects api-keys --project-ref blxrdotroysitfyehmqw` y exige ese
ref exacto (`scripts/seed-production-demo-data.mjs`,
`docs/database/DEMO_SEED.md`).

`supabase/config.toml` contiene referencias `env(...)` de la plantilla de la
CLI: `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`,
`SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`, `S3_HOST`, `S3_REGION`,
`S3_ACCESS_KEY` y `S3_SECRET_KEY`. Corresponden a funciones deshabilitadas
(Twilio, Apple, OrioleDB experimental) y el proyecto no las usa.

---

## 8. Equivalencias con los nombres de `DOCUMENTACION_ESPERADA.md`

`docs/manuals/DOCUMENTACION_ESPERADA.md` propone nombres de ejemplo. Estos son
los nombres reales:

| Nombre de ejemplo | Nombre real |
| --- | --- |
| `DATABASE_URL` | No existe. Ni la API ni la web se conectan con una cadena Postgres: usan Supabase JS (`SUPABASE_URL` + clave). |
| `SUPABASE_URL` | `SUPABASE_URL` (API) y `NEXT_PUBLIC_SUPABASE_URL` (web). |
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (solo web). |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` (solo API). |
| `OPENAI_API_KEY` | `OPENAI_API_KEY`, respaldo de `OPENROUTER_API_KEY` (solo API). |
| `FRONTEND_URL` | `APP_URL` (web) y `WEB_ORIGIN` (API, origen para CORS). |
| `API_URL` | `ADMIN_API_URL` (web). |
| Credenciales SMTP | No son variables: se configuran en Supabase Auth (§5.3). |

---

## 9. Discrepancias

Estas diferencias se detectaron al redactar este documento. **No se
corrigieron**: se dejan registradas para una tarea aparte.

1. **A `apps/api/.env.example` le faltan variables que el código lee y
   valida:** `OPENROUTER_API_KEY`, `AI_GATEWAY_BASE_URL` y
   `RAG_ANSWER_FALLBACK_MODEL`. Hoy OpenRouter es el proveedor de producción.
2. **Al `.env.example` de la raíz le faltan variables de la API:**
   `RAG_INGESTION_LEASE_SECONDS`, `FAQ_MEMORY_FINGERPRINT_SECRET` y
   `CHAT_HISTORY_LIMIT`.
3. **Si se copian los `.env.example` tal como están, la API no arranca.** Las
   líneas vacías llegan como cadena vacía y el esquema Zod las rechaza
   (`Invalid environment configuration.`). En `apps/api/.env.example` son
   `NODE_ENV=`, `PORT=`, `WEB_ORIGIN=`, `FAQ_MEMORY_FINGERPRINT_SECRET=` y
   `OPENAI_API_KEY=`. En el `.env.example` de la raíz son `NODE_ENV=`, `PORT=`,
   `WEB_ORIGIN=`, `OPENROUTER_API_KEY=`, `OPENAI_API_KEY=`,
   `AI_GATEWAY_BASE_URL=`, `RAG_EMBEDDING_MODEL=`, `RAG_ANSWER_MODEL=` y
   `RAG_ANSWER_FALLBACK_MODEL=`. `SUPABASE_URL=` y
   `SUPABASE_SERVICE_ROLE_KEY=`, ambas vacías, no bloquean el arranque (§3.2).
   Se verificó ejecutando `validateEnvironment` con cada caso. El comentario del
   `.env.example` raíz ("Copia este archivo a .env en cada app") lleva a este
   error.
4. **`RAG_MATCH_THRESHOLD=` vacío se convierte en `0` sin avisar**
   (`z.coerce.number()` sobre `""`): desaparece el filtro de similitud mínima y
   solo queda el margen relativo respecto del mejor fragmento
   (`rag.service.ts`), así que fragmentos poco relacionados pueden pasar como
   evidencia. Con `RAG_MATCH_COUNT=`, `CHAT_HISTORY_LIMIT=`,
   `RAG_INGESTION_LEASE_SECONDS=` o `RAG_INGESTION_WORKER_ENABLED=` vacíos, en
   cambio, la API no arranca.
5. **`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` no están en el esquema
   central.** Sin ambas, la API arranca y solo `/health/ready` revela el
   problema (`503`).
6. **El `PORT` por defecto (`3000`) choca con la web.** La web espera la API en
   `http://localhost:3001` (`apps/web/.env.example`,
   `Invoke-LocalEnvironment.ps1`), pero la API usa `3000` si no se define
   `PORT`, que es también el puerto de `next dev`.
7. **El comentario de `ADMIN_API_URL` en `apps/web/.env.example` está
   desactualizado.** Dice que el navegador no debe llamar a la API
   directamente, pero el código pasa ese origen a componentes de cliente para
   la carga de documentos y la importación de usuarios. El `.env.example` de la
   raíz describe la carga directa de PDF, pero no menciona la importación de
   usuarios.
8. **Los modelos de ejemplo no coinciden con producción.** El `.env.example` de
   la raíz y `docs/architecture/INTEGRACION_OPENROUTER.md` dan
   `openai/gpt-5-mini` como modelo de respuesta de producción, pero producción
   usa gpt-4o-mini. Además, los valores por defecto del código (`gpt-4o-mini`,
   `text-embedding-3-small`) no llevan el prefijo de proveedor que pide
   OpenRouter según ese mismo `.env.example`.
9. **No hay configuración declarativa de despliegue.**
   `infrastructure/render/` e `infrastructure/vercel/` están vacías. Las
   variables de Render y Vercel solo están en sus paneles y no quedan
   versionadas.

---

## 10. Pendientes por confirmar (PO)

- Valores reales en Render de `NODE_ENV` y `PORT`, y cómo se fija la versión
  de Node.
- Cadenas exactas de `RAG_EMBEDDING_MODEL` y `RAG_ANSWER_MODEL`, y si existen
  `RAG_ANSWER_FALLBACK_MODEL`, `AI_GATEWAY_BASE_URL`, `OPENAI_API_KEY`,
  `FAQ_MEMORY_FINGERPRINT_SECRET`, `RAG_MATCH_COUNT`,
  `RAG_INGESTION_LEASE_SECONDS` y `CHAT_HISTORY_LIMIT` en Render.
- Si OpenRouter acepta los nombres de modelo sin prefijo de proveedor (los
  valores por defecto del código).
- Valor exacto de `APP_URL` en Vercel y variables del alcance *Preview*.
- Site URL, Redirect URLs y SMTP (Resend) configurados en Supabase Auth de
  producción.
- Qué despliegues usan el proyecto de staging `scepelftmjlabepygrri`.
- Responsables de custodiar y rotar cada secreto (clave de servicio de
  Supabase, clave de OpenRouter/OpenAI, secreto FAQ, API key de Resend).
