# Manual de despliegue — AVEND ASESOR

Fecha de referencia: 2026-09-25. Este manual describe cómo se despliega hoy el
sistema en producción: web en Vercel, API en Render, base de datos, Auth y
Storage en Supabase, y validación en GitHub Actions. Solo documenta lo que
existe en el repositorio o en la operación registrada. Lo que no se pudo
verificar figura como **Por confirmar (PO)**.

Fuera de alcance:

- Respaldos y restauración: son un entregable separado del Hito 5 (ver §5.7).
- Instalación y ejecución local:
  [`GUIA_INSTALACION_LOCAL.md`](GUIA_INSTALACION_LOCAL.md).
- Referencia completa de variables de entorno:
  [`VARIABLES_DE_ENTORNO.md`](VARIABLES_DE_ENTORNO.md). Aquí solo figuran las
  que importan para desplegar.

> Regla de oro: **fusionar a `main` es desplegar a producción.** Render y
> Vercel toman `main` automáticamente. Una migración que el código necesita se
> aplica **antes** de fusionar.

---

## 1. Panorama

| Componente | Código | Plataforma | URL de producción | Cómo se despliega |
| --- | --- | --- | --- | --- |
| Web (UI/BFF) | `apps/web` (Next.js 16.3, React 19) | Vercel, proyecto `avend-asesor-web` | https://avend-asesor-web.vercel.app | Automático al llegar un commit a `main` |
| API | `apps/api` (NestJS 11) | Render, web service `avend-asesor-api` | https://avend-asesor-api.onrender.com | Automático al llegar un commit a `main` |
| Base de datos, Auth, Storage | `supabase/` (migraciones SQL) | Supabase | Proyecto `blxrdotroysitfyehmqw` | Manual y controlado (§5.2) |
| Proveedor de IA | `apps/api/src/config/ai-gateway.ts` | OpenRouter (respaldo: OpenAI directo) | — | Se configura con variables en Render |
| CI | `.github/workflows/ci.yml` | GitHub Actions | — | En cada PR y en cada push a `main` |

Repositorio: `https://github.com/L3x-00/AvendAsesor`.

Flujo de peticiones:

```text
Navegador ──► Vercel (páginas, Server Actions, route handlers /api/*) ──► API Render ──► Supabase
    │                                                                     │
    └──► API Render directo (carga de documentos e importación de       └──► OpenRouter
         usuarios; evita el límite de payload de Vercel)                     (embeddings y respuestas)
```

Vercel solo aloja la interfaz; la lógica, los datos, Storage y el RAG viven en
la API de Render. La web habla directamente con Supabase con la clave anon y bajo
RLS solo para dos cosas: la sesión de Auth (`apps/web/src/lib/supabase/`) y la
lectura del perfil y los permisos propios (`apps/web/src/lib/authorization/`). El navegador llama a la API directamente solo para subir
archivos (`apps/web/src/components/admin/document-pdf-upload-form.tsx` y
`users-import-form.tsx`), con el token de Supabase en la cabecera
`Authorization: Bearer`.

**Configuración no versionada.** No existen `vercel.json` ni `render.yaml`, y las
carpetas `infrastructure/vercel/` e `infrastructure/render/` están vacías. La
configuración de ambas plataformas vive en sus paneles. Si se cambia algo allí,
se debe actualizar este manual.

---

## 2. Ambientes

| Ambiente | Supabase | API | Web |
| --- | --- | --- | --- |
| Producción | `blxrdotroysitfyehmqw`, nombre «AVENDSESOR», región us-west-2, Postgres 17, plan Free sin PITR | Render `avend-asesor-api` (región oregon) | Vercel `avend-asesor-web` (producción) |
| Staging | `scepelftmjlabepygrri`, nombre «avend-asesor-staging», región us-east-2 | No hay evidencia de un servicio Render de staging. Por confirmar (PO) | Previews de Vercel (§3.5). No hay evidencia de un proyecto de staging. Por confirmar (PO) |
| Local | `supabase start` (puertos en `supabase/config.toml`) | `npm run dev:api` | `npm run dev:web` |

Cuidado: el nombre «AVENDSESOR» no dice que sea producción. Identifique siempre
el proyecto por su **ref**, no por su nombre.

---

## 3. Frontend en Vercel

### 3.1 Proyecto y build

| Ajuste | Valor | Fuente |
| --- | --- | --- |
| Proyecto | `avend-asesor-web` | Operación; enlace local de la CLI de Vercel |
| Root Directory | `apps/web` | Enlace local de la CLI (`.vercel/repo.json`, ignorado por git) |
| Framework | Next.js 16.3.0 | `apps/web/package.json` |
| Build | script `build` de `apps/web` → `next build` | `apps/web/package.json` |
| Instalación | monorepo npm workspaces con `package-lock.json` en la raíz | `package.json` raíz |
| Comandos personalizados de install/build en el panel | Por confirmar (PO) | No versionado |
| Versión de Node en Vercel | Por confirmar (PO). El repositorio exige `>=24.14.0 <25` (`engines`) y `.nvmrc` fija `24.14.0` | `package.json`, `.nvmrc` |

Particularidades de `apps/web/next.config.ts`:

- `outputFileTracingRoot` apunta a la raíz del monorepo, porque las
  dependencias se instalan (hoisting) en `node_modules/` de la raíz.
- `outputFileTracingIncludes` fuerza el empaquetado de `pdfkit`, `fontkit` y sus
  dependencias para la ruta de generación documental
  `/api/chat/conversations/*/messages/*/orientacion/*` (CU-14). Sin esto, la
  función falla en Vercel.
- `serverExternalPackages: ["fontkit", "pdfkit"]`.
- El paso de CI `npm run verify:build-artifacts`
  (`apps/web/scripts/verify-orientation-trace.mjs`) comprueba después del build
  que el trazado de esa ruta incluya los módulos y las fuentes `.woff`.

### 3.2 Variables de entorno (Vercel)

| Variable | Requerida | Uso | Validación |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL pública del proyecto Supabase | `apps/web/src/lib/supabase/config.ts`: error si falta |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Clave publicable/anon de Supabase | Igual que la anterior |
| `ADMIN_API_URL` | Sí | Origen de la API de Render (producción: `https://avend-asesor-api.onrender.com`) | `apps/web/src/lib/admin-api/config.ts`: exige HTTPS (HTTP solo en `localhost`/`127.0.0.1`), sin ruta, query, fragmento ni credenciales |
| `APP_URL` | Sí fuera de desarrollo | URL canónica de la web. Con ella se arman los enlaces de los correos de Auth, y los route handlers `/api/consultation-feedback/*`, `/api/chat/conversations/*/messages/*/orientacion/*` y `/auth/sign-out` rechazan con `403` toda cabecera `Origin` distinta de su origen | `apps/web/src/lib/auth/site-url.ts`: HTTPS obligatorio fuera de localhost. Si falta y `NODE_ENV` no es `production`, cae a `http://localhost:3000` |

Reglas:

- **Nunca** cargue en Vercel la `SUPABASE_SERVICE_ROLE_KEY` ni las claves del
  proveedor de IA. La web no las usa.
- `ADMIN_API_URL` no lleva prefijo `NEXT_PUBLIC_`. Aun así, el servidor pasa su
  origen a los formularios de carga, que llaman a la API desde el navegador.
- Las variables `NEXT_PUBLIC_*` se incrustan en el build. En Vercel, además,
  todo cambio de variable aplica solo a los despliegues nuevos. Tras cambiar
  cualquier variable, **redespliegue** producción.
- Los valores de las variables en el scope *Preview* son Por confirmar (PO).

### 3.3 Dominio

- Producción: `https://avend-asesor-web.vercel.app` (alias de Vercel).
- Dominio propio: no hay evidencia de uno. Por confirmar (PO).
- Si cambia el dominio canónico, actualice **los cuatro** puntos en la misma
  ventana:
  1. `APP_URL` en Vercel, y redespliegue. Si no coincide con el dominio real,
     fallan los route handlers que validan `Origin` (§3.2).
  2. `WEB_ORIGIN` en Render. Es el único origen CORS permitido por la API.
  3. En Supabase Auth: Site URL y Redirect URLs (§5.5).
  4. El remitente o dominio de correo, si aplica (§5.6).

### 3.4 Cómo ocurre un despliegue

1. Un commit llega a `main` (normalmente al fusionar un PR).
2. La integración Git de Vercel construye `apps/web` y, si el build termina en
   *Ready*, asigna el alias de producción.
3. Vercel **no** espera al CI de `main`. Por eso el PR debe estar en verde antes
   de fusionar (§6).

**Incidente conocido (2026-08-24).** El despliegue automático no llegó a
construir por una restricción de autor del repositorio en Vercel. Se publicó con
un despliegue manual autenticado, hecho desde una exportación exacta del commit
publicado (`docs/hito4/fase5/RELEASE_HITO3_HITO4.md`). Si se repite:

- Use solo archivos versionados de ese commit, por ejemplo con `git archive <sha>`
  hacia una carpeta limpia. Enlácela al proyecto `avend-asesor-web` y ejecute
  `vercel deploy --prod` con una cuenta que tenga acceso al proyecto.
- **Nunca** despliegue desde el árbol de trabajo. Puede contener archivos
  locales no versionados o trabajo sin fusionar.

### 3.5 Previews

- Los pushes a ramas distintas de `main` generan *Preview Deployments*
  (comportamiento por defecto de la integración Git de Vercel). Los previews
  están protegidos por inicio de sesión en Vercel.
- Limitación real: la API solo acepta CORS desde `WEB_ORIGIN` (el origen de
  producción; `apps/api/src/application.factory.ts`). Desde la URL de un preview
  fallan las llamadas directas del navegador a la API: carga de documentos e
  importación de usuarios. Las llamadas del servidor de Next (Server Actions,
  route handlers) no están sujetas a CORS, pero los route handlers que validan
  `Origin` contra `APP_URL` (§3.2) responden `403` si el `APP_URL` del scope
  *Preview* no es la URL del preview.
- A qué API y a qué Supabase apuntan los previews: Por confirmar (PO). Revise el
  scope *Preview* antes de probar con datos.

---

## 4. Backend en Render

### 4.1 Servicio

| Ajuste | Valor |
| --- | --- |
| Servicio | `avend-asesor-api` (Web Service, runtime Node) |
| Plan / región | Free / oregon |
| Rama | `main`, con auto-deploy en cada commit |
| Build Command | `npm ci --include=dev && npm run build --workspace=api` |
| Start Command | `npm run start:prod --workspace=api` (ejecuta `node dist/main`) |
| Health Check Path | `/health/ready` |
| URL | https://avend-asesor-api.onrender.com |
| Versión de Node | Por confirmar (PO). El repositorio exige `>=24.14.0 <25` |

Notas:

- Los comandos corren en la raíz del repositorio y seleccionan el workspace con
  `--workspace=api`.
- `--include=dev` es necesario porque `nest build` usa `@nestjs/cli`, que es
  devDependency. Con `NODE_ENV=production`, `npm ci` omitiría las
  devDependencies.
- La API escucha en `0.0.0.0:$PORT` (`apps/api/src/main.ts`). Render inyecta
  `PORT`.
- No hay prefijo global de rutas: los endpoints cuelgan de la raíz del dominio.

### 4.2 Health checks

Definidos en `apps/api/src/health/health.controller.ts` y `health.service.ts`.

| Endpoint | Qué comprueba | Respuesta OK | Falla |
| --- | --- | --- | --- |
| `GET /health` | Que el proceso responde (liveness). No toca dependencias | `200 {"service":"avend-asesor-api","status":"ok"}` | — |
| `GET /health/ready` | Que Supabase responde: `select` de solo cabecera sobre `profiles`, con timeout de 3 s (`apps/api/src/supabase/supabase-health.gateway.ts`) | `200 {"service":"avend-asesor-api","status":"ready"}` | `503`, sin detalles internos |

No existe `/health/live`. Render usa `/health/ready`: si Supabase no está
configurado o no responde, el servicio se considera no sano.

### 4.3 Variables de entorno (Render)

Se validan al arrancar con Zod en `apps/api/src/config/environment.validation.ts`,
salvo las de Supabase, que se validan en
`apps/api/src/supabase/supabase.server-client.ts`. `ConfigModule` usa
`cache: true`: las variables se leen **solo al arrancar**, así que cada cambio
exige reiniciar o redesplegar.

| Variable | Req. | Default | Propósito y reglas |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, `staging` o `production`. En producción debe ser `production`: solo así se exige HTTPS en `WEB_ORIGIN`. Valor actual en Render: Por confirmar (PO) |
| `PORT` | No | `3000` | Lo inyecta Render |
| `WEB_ORIGIN` | Sí en producción | `http://localhost:3000` | Origen exacto permitido por CORS (hoy `https://avend-asesor-web.vercel.app`). Sin ruta, query, fragmento ni credenciales. En `staging`/`production` debe ser HTTPS |
| `SUPABASE_URL` | Sí | — | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | — | Clave de servidor. Solo en Render, nunca en Vercel |
| `OPENROUTER_API_KEY` | Condicional | — | Si existe, todo el tráfico de IA va por OpenRouter |
| `OPENAI_API_KEY` | Condicional | — | Se usa solo si no hay `OPENROUTER_API_KEY` |
| `AI_GATEWAY_BASE_URL` | No | `https://openrouter.ai/api/v1` con OpenRouter | Cambia el endpoint compatible con OpenAI |
| `RAG_EMBEDDING_MODEL` | No | `text-embedding-3-small` | Debe producir vectores de **1536** dimensiones (§5.3). Con OpenRouter, use el identificador de OpenRouter, por ejemplo `openai/text-embedding-3-small` (`.env.example`) |
| `RAG_ANSWER_MODEL` | No | `gpt-4o-mini` | Modelo de respuesta. En producción: gpt-4o-mini vía OpenRouter |
| `RAG_ANSWER_FALLBACK_MODEL` | No | — | Modelo de respaldo, solo ante error técnico del primario. Si está cargado en producción: Por confirmar (PO) |
| `RAG_INGESTION_WORKER_ENABLED` | No | `false` | Solo acepta `true` o `false` (otro valor impide arrancar). `true` enciende el worker de ingesta (§8) y exige `OPENROUTER_API_KEY` u `OPENAI_API_KEY` |
| `RAG_INGESTION_LEASE_SECONDS` | No | `300` | Entre 30 y 900 s. Tiempo de *lease* de un trabajo de ingesta |
| `RAG_MATCH_THRESHOLD` | No | `0.5` | Similitud mínima (0 a 1). Calibrada con el corpus real; **no** volver a 0.7 (`docs/hito3/RUNBOOK_ACTIVACION_EJE_B.md`) |
| `RAG_MATCH_COUNT` | No | `5` | Entre 1 y 10 fragmentos |
| `FAQ_MEMORY_FINGERPRINT_SECRET` | No | — | Mínimo 32 caracteres, solo de servidor. Si falta, la memoria FAQ queda desactivada (`apps/api/src/learning/faq-memory.service.ts`) |
| `CHAT_HISTORY_LIMIT` | No | `20` | Entre 1 y 50 |

Qué pasa si la configuración es inválida:

- Si falla la validación Zod, por ejemplo con `WEB_ORIGIN` sin HTTPS en
  producción o con el worker encendido sin clave de IA, el proceso no arranca.
  El log muestra solo `Invalid environment configuration.`; por diseño no dice
  qué variable falló.
- Solo una de `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: el arranque falla con
  `Supabase server configuration is invalid.`
- Ninguna de las dos: la API arranca, pero `/health/ready` responde `503` y el
  health check de Render falla.

Para verificar los modelos y el umbral en uso sin abrir el panel, use
`GET /admin/rag/readiness` (§7.3).

### 4.4 Plan Free: arranque en frío y límites

- La instancia se apaga tras un periodo sin tráfico. La primera petición que la
  despierta puede tardar o recibir un `503` de Render, que no viene del código.
  El formulario de carga de documentos lo explica e invita a reintentar
  (`document-pdf-upload-form.tsx`). Si un usuario reporta «no se pudo cargar»,
  sospeche primero de un arranque en frío.
- Memoria de 512 MB. Por eso el OCR local de PDF se limita a 40 páginas por
  trabajo (`apps/api/src/ingestion/ingestion.service.ts`).
- El worker de ingesta corre **dentro** de este mismo proceso. Solo procesa
  mientras la instancia está despierta.

### 4.5 Logs

Render → servicio `avend-asesor-api` → **Logs**. Mensajes útiles al arrancar y
en operación:

| Mensaje | Significado |
| --- | --- |
| `Ingestion worker enabled; polling for pending document versions.` | Worker encendido |
| `Ingestion worker is DISABLED (...)` | Worker apagado: los documentos nuevos quedarán en `pending` |
| `Retrieval RPC contract OK (search_document_chunks_with_consultation_context).` | La RPC de búsqueda del chat existe en la base |
| `RAG retrieval RPC ... is missing or its signature changed` (ERROR) | Hay desajuste entre migración y código: el chat responderá `503` hasta aplicar la migración (`apps/api/src/rag/retrieval-contract.probe.ts`) |
| `Invalid environment configuration.` | Variables inválidas (§4.3) |
| `Document ingestion failed for job <id>.` | Falló un trabajo de ingesta. El detalle queda en la base (§8.4) |

### 4.6 Cómo ocurre un despliegue

1. Un commit llega a `main`.
2. Render ejecuta el Build Command y luego el Start Command.
3. Render consulta `/health/ready`. Solo cuando la nueva instancia está sana
   reemplaza a la anterior; si no lo está, el deploy falla y sigue la versión
   previa.
4. Render tampoco espera al CI de `main`.

Para redesplegar sin un commit nuevo, por ejemplo después de cambiar variables,
use **Manual Deploy** en el panel del servicio.

---

## 5. Supabase

### 5.1 Proyectos y CLI

| Ref | Nombre | Rol | Región | Plan |
| --- | --- | --- | --- | --- |
| `blxrdotroysitfyehmqw` | AVENDSESOR | **Producción** | us-west-2 | Free, sin PITR |
| `scepelftmjlabepygrri` | avend-asesor-staging | Staging | us-east-2 | Por confirmar (PO) |

- `supabase link` guarda el proyecto enlazado en `supabase/.temp/project-ref`
  (ignorado por git). Todo comando con `--linked` actúa sobre **ese** proyecto.
  En la máquina del equipo original apuntaba a producción. Revíselo antes de
  cada comando remoto.
- `supabase/config.toml` configura **solo el stack local** (`supabase start`).
  No se aplica automáticamente a los proyectos remotos. No ejecute
  `supabase config push`: copiaría al proyecto enlazado valores locales como
  `site_url = "http://localhost:3000"`.

### 5.2 Migraciones

- Ubicación: `supabase/migrations/<timestamp>_<nombre>.sql`. Al 2026-09-25 hay
  51; la última es `20260910130000_inline_document_mime_type.sql`.
- Solo hacia adelante: **nunca** edite ni borre una migración ya aplicada. Para
  corregir, cree una migración compensatoria.
- Pruebas locales (el CI no las ejecuta):

  ```powershell
  supabase db reset --local                 # recrea la base local aplicando todas las migraciones
  supabase test db --local                  # pgTAP: supabase/tests/database/*.sql
  supabase db lint --local --fail-on warning
  supabase db advisors --local --fail-on warn
  ```

**Orden respecto al despliegue.** Si el código fusionado llama a una tabla o RPC
que producción todavía no tiene, la sección afectada se cae apenas termina el
deploy. Por eso la migración se aplica **antes** de fusionar, o en la misma
ventana controlada.

**Procedimiento para aplicar migraciones remotas.** Aplicar en producción es una
acción controlada: requiere autorización explícita del Product Owner y un
respaldo previo según el procedimiento de respaldos.

1. Trabaje desde un checkout limpio del commit exacto del release. **Nunca**
   ejecute `supabase db push` desde un árbol de trabajo: puede contener
   migraciones de otras ramas y las aplicaría todas.
2. Staging primero:

   ```powershell
   supabase link --project-ref scepelftmjlabepygrri
   supabase migration list --linked          # compara historial local y remoto
   supabase db push --dry-run                # lista exactamente qué aplicaría
   supabase db push
   supabase migration list --linked
   supabase db advisors --linked --fail-on warn
   ```

3. Pruebe contra staging.
4. Repita en producción con `supabase link --project-ref blxrdotroysitfyehmqw`,
   revisando que el `--dry-run` liste solo las migraciones autorizadas.
5. Recién entonces fusione el PR.

Si hay dudas sobre qué base está enlazada, confírmelo con datos y una consulta
de solo lectura: conteos de `public.documents` y `public.profiles`, y
`max(version)` de `supabase_migrations.schema_migrations`.

Trampas conocidas al escribir o aplicar migraciones:

- **`search_path` de producción.** Producción no incluye `extensions` en el
  `search_path`. Califique los objetos de extensiones, por ejemplo
  `extensions.vector_cosine_ops`. En la promoción de Hitos 3–4 (agosto de 2026)
  la creación de un índice HNSW falló en producción por esto; la transacción se
  revirtió sin cambios parciales (`docs/hito4/fase5/RELEASE_HITO3_HITO4.md`).
- **SQLSTATE 55006** (`cannot ALTER TABLE ... because it has pending trigger
  events`). Aparece cuando un backfill (`update`) sobre una tabla con FK
  `deferrable initially deferred` precede a un `ALTER TABLE`. Escriba
  `set constraints all immediate;` antes del `ALTER TABLE`, como hace
  `20260903120000_module_document_governance.sql`. No se reproduce en local ni
  en CI, donde las tablas están vacías.
- **Migraciones aplicadas fuera de la CLI** (por ejemplo, desde el SQL Editor):
  registre la versión (el prefijo del archivo) en el historial con
  `supabase migration repair --status applied <versión> --linked`. Si no, un
  `db push` posterior intentará reaplicarla.

### 5.3 pgvector y extensiones

| Elemento | Detalle | Fuente |
| --- | --- | --- |
| Extensión `vector` | En el esquema `extensions`. Producción: pgvector 0.8.2 (verificado el 2026-08-24) | `20260821064610_create_hito3_rag_foundation.sql`, `RELEASE_HITO3_HITO4.md` |
| Columna | `public.document_chunks.embedding extensions.vector(1536)` | misma migración |
| Índice | HNSW con `extensions.vector_cosine_ops` | misma migración |
| `unaccent`, `pg_trgm` | Búsqueda de la biblioteca de documentos | `20260906120000_document_library_search_and_filters.sql` |
| RPC de búsqueda del chat | `public.search_document_chunks_with_consultation_context` | `20260905100000_consultation_reports_and_quality.sql`, `apps/api/src/rag/retrieval.constants.ts` |

La dimensión 1536 es fija (`RAG_EMBEDDING_DIMENSIONS` en
`apps/api/src/config/ai-gateway.ts`). Si se cambia a un modelo de embeddings de
otra dimensión, hay que migrar la columna y reindexar todo el corpus.

### 5.4 Storage

Buckets creados por migraciones. Ambos son **privados**: la API los accede con
la clave de servidor y entrega URLs firmadas.

| Bucket | Límite | MIME permitidos | Migración |
| --- | --- | --- | --- |
| `normative-documents` | 50 MiB | PDF, DOCX, DOC, Markdown | Creado en `20260809194717_create_document_management_foundation.sql` (20 MiB, solo PDF); ampliado en `20260910120000_document_upload_formats_and_size.sql` |
| `consultation-case-attachments` | 10 MiB | JPEG, PNG, WebP, PDF, DOC, DOCX | `20260905100000_consultation_reports_and_quality.sql` |

Los archivos `.doc` se almacenan, pero el worker no los indexa: los rechaza con
`INGESTION_UNSUPPORTED_FORMAT` (`apps/api/src/ingestion/ingestion.service.ts`).

### 5.5 Auth

Supabase Auth gestiona credenciales, confirmación de correo, recuperación de
contraseña y sesiones. Todo usuario nuevo recibe el rol `docente` desde la base
de datos (`infrastructure/supabase/README.md`).

Configuración local de referencia (`supabase/config.toml`):

| Ajuste | Valor local |
| --- | --- |
| Registro por correo | habilitado, con confirmación obligatoria |
| Inicio anónimo | deshabilitado |
| Contraseña | mínimo 8 caracteres, con minúsculas, mayúsculas y dígitos |
| JWT | expira en 3600 s, con rotación de refresh token |
| MFA, SMS, proveedores externos | deshabilitados |
| Reenvío de correo | 1 por minuto |

En los proyectos remotos se configura en el panel de Supabase
(Authentication → URL Configuration):

- **Site URL**: el `APP_URL` del ambiente.
- **Redirect URLs**: solo las dos rutas que usa la web
  (`apps/web/src/app/auth/actions.ts`):
  - `<APP_URL>/auth/callback?next=/auth/confirmed`
  - `<APP_URL>/auth/callback?next=/auth/update-password`
- Las invitaciones que envía la API al crear usuarios desde el panel
  (`inviteUserByEmail` en
  `apps/api/src/supabase/supabase-user-administration.gateway.ts`) no fijan
  `redirectTo`, así que su enlace usa la **Site URL**.

Si los ajustes remotos coinciden con los locales: Por confirmar (PO).

### 5.6 Correo

- Ni la web ni la API envían correos por su cuenta. Registro, confirmación,
  recuperación e invitaciones los envía Supabase Auth.
- Configuración prevista para ambientes remotos (`infrastructure/email/README.md`):
  Resend como SMTP personalizado de Supabase Auth. Host `smtp.resend.com`,
  puerto `587` (STARTTLS), usuario `resend`, contraseña = API key de Resend
  (solo en el proveedor) y remitente de un dominio verificado con SPF, DKIM y
  DMARC.
- Si Resend está configurado hoy en producción: Por confirmar (PO).
- Mailpit (`infrastructure/mailpit/`) es solo para desarrollo local.

### 5.7 Respaldos

Los respaldos y la restauración son un **entregable separado del Hito 5** y no
se cubren aquí. Como el plan Free no tiene PITR, toda migración de producción
debe ir precedida de un respaldo según ese procedimiento.

---

## 6. CI — GitHub Actions

Archivo: `.github/workflows/ci.yml`. Se dispara en todo `pull_request` y en cada
`push` a `main`. Usa `concurrency` para cancelar la corrida anterior del mismo
ref y permisos de solo lectura (`contents: read`).

Job `validate` (ubuntu-latest, Node 24, caché de npm):

| Paso | Qué ejecuta |
| --- | --- |
| `npm ci` | Instalación limpia del monorepo |
| `npm run lint` | ESLint en cada workspace que tiene script `lint` (api y web) |
| `npm run typecheck` | api: `tsc --noEmit`; web: `next typegen && tsc --noEmit` |
| `npm run test:coverage` | api: Jest con cobertura y umbrales (`apps/api/package.json`, `jest.coverageThreshold`); web: Vitest con cobertura y umbrales (`apps/web/vitest.config.mts`). Incluye la prueba de contrato que verifica que la RPC de búsqueda exista en `supabase/migrations` con sus argumentos (`apps/api/src/rag/retrieval.contract.spec.ts`) |
| `npm run test:e2e` | E2E HTTP de la API con supertest y servicios simulados (`apps/api/test/app.e2e-spec.ts`); no usa base de datos |
| `npm run build` | Build de los workspaces que tienen script `build` (api y web) |
| `npm run verify:build-artifacts` | Verifica el trazado de la función CU-14 de la web (§3.1) |

El CI **no** hace esto:

- No levanta Supabase ni ejecuta las pruebas pgTAP.
- No aplica migraciones.
- No despliega.

Los despliegues ocurren por las integraciones de Render y Vercel con `main`, que
no esperan al CI. Si `main` tiene protección de rama o checks obligatorios en
GitHub: Por confirmar (PO).

---

## 7. Procedimiento de release

### 7.1 Antes de fusionar

1. Trabaje en una rama del repositorio (`git switch -c <rama>`) y abra un PR
   contra `main`.
2. El CI (`validate`) debe estar en verde en el PR.
3. Haga una revisión independiente del diff.
4. Si el PR trae migraciones, aplíquelas primero en staging y luego en
   producción (§5.2), con autorización del PO y respaldo previo.
5. Si el PR necesita una variable nueva o un valor distinto, cárguelo **antes**
   en Render o Vercel. La API no arranca si la validación falla (§4.3).
6. Opcional: pruebe el preview de Vercel, sabiendo sus limitaciones (§3.5).

### 7.2 Fusión = despliegue

Fusionar el PR en `main` dispara en paralelo el deploy de Render (API) y el de
Vercel (web), aunque el cambio toque solo una de las dos apps. En `main` también
corre el CI, pero los deploys no lo esperan.

### 7.3 Verificación posterior

```bash
# Liveness y readiness de la API (la primera llamada puede tardar por arranque en frío).
curl -i https://avend-asesor-api.onrender.com/health
curl -i https://avend-asesor-api.onrender.com/health/ready

# CORS: la respuesta debe traer access-control-allow-origin con el origen de producción.
curl -i -H "Origin: https://avend-asesor-web.vercel.app" https://avend-asesor-api.onrender.com/health
```

Lista de comprobación:

| Comprobación | Esperado |
| --- | --- |
| `GET /health` | `200`, `status: "ok"` |
| `GET /health/ready` | `200`, `status: "ready"` |
| Logs de Render al arrancar | `Retrieval RPC contract OK (...)` y el estado del worker (§4.5) |
| Deploy de Vercel | Estado *Ready*, con el alias de producción asignado |
| `https://avend-asesor-web.vercel.app/admin` sin sesión | Redirige a `/auth/sign-in` |
| Endpoint administrativo de la API sin token | `401` |
| Prueba funcional | Iniciar sesión y hacer una consulta en el chat |

**Readiness del RAG (solo administradores).** `GET /admin/rag/readiness` exige
el rol `admin` o `superadmin`, con correo confirmado. Tiene un límite de 20
peticiones por minuto (`apps/api/src/rag-admin/rag-readiness.controller.ts`).
El panel web no muestra esta vista: se llama a la API con el access token de
Supabase de esa cuenta. Trate el token como secreto y no lo pegue en tickets ni
documentos.

```bash
curl -s https://avend-asesor-api.onrender.com/admin/rag/readiness \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Respuesta esperada en producción (forma definida en
`apps/api/src/rag-admin/rag-readiness.service.ts`):

```json
{
  "workerEnabled": true,
  "provider": "openrouter",
  "providerConfigured": true,
  "embeddingModel": "<modelo de embeddings configurado>",
  "answerModel": "<modelo de respuesta configurado>",
  "matchThreshold": 0.5,
  "counts": { "pending": 0, "processing": 0, "indexed": 0, "failed": 0, "total": 0 },
  "ready": true
}
```

`ready` es `true` solo si el worker está encendido, hay proveedor configurado y
Supabase está configurado (`counts` distinto de `null`). Si Supabase está
configurado pero no responde, el endpoint devuelve `503`. `provider: "openai"` indica que falta
`OPENROUTER_API_KEY` y se usa el respaldo; `"none"` indica que no hay proveedor.

**Aceptación RAG (opcional, consume saldo del proveedor).** Desde `apps/api`:

```bash
ACCEPTANCE_ENV_FILE=.env.acceptance.local npm run acceptance:hito3
```

El archivo de entorno queda fuera de git y apunta al ambiente que se valida. La
corrida usa servicios reales, pero simula el historial en memoria, así que no
crea conversaciones. El reporte queda en `apps/api/test/acceptance/out/`
(`apps/api/test/acceptance/hito3-client-cases.ts`).

---

## 8. Worker de ingesta RAG y reindexación

### 8.1 Funcionamiento

- Vive en la API (`apps/api/src/ingestion/ingestion.worker.ts`). Cada 5 s toma
  un trabajo pendiente de `public.document_ingestion_jobs`, extrae el texto,
  genera los embeddings con el proveedor y guarda los fragmentos en
  `public.document_chunks`.
- Formatos que indexa: PDF (con OCR local de páginas casi vacías), DOCX y
  Markdown. `.doc` no se indexa.
- Estados de la versión (`document_ingestion_status`): `pending` →
  `processing` → `indexed` o `failed`. Cada trabajo admite hasta 3 intentos
  (`max_attempts`, por defecto 3).
- Estado en producción al 2026-09-24: worker encendido con OpenRouter
  (`gpt-4o-mini`, `text-embedding-3-small` de 1536 dimensiones)
  (`docs/hito3/RUNBOOK_ACTIVACION_EJE_B.md`).

### 8.2 Encender y apagar (interruptor de emergencia)

- Encender: `RAG_INGESTION_WORKER_ENABLED=true` en Render, con
  `OPENROUTER_API_KEY` u `OPENAI_API_KEY` presente. Sin clave, la API no arranca.
- Apagar: `RAG_INGESTION_WORKER_ENABLED=false` en Render y redespliegue o
  reinicio. Efecto:
  - Se deja de indexar y los documentos nuevos quedan en `pending`.
  - El chat sigue respondiendo con lo ya indexado, porque la búsqueda no depende
    del worker.
- Corte total del proveedor de IA: quite `OPENROUTER_API_KEY` y `OPENAI_API_KEY`
  **y** ponga el worker en `false`. Si el worker queda en `true` sin clave, la
  API no arranca. Sin claves, las consultas del chat fallan de forma cerrada:
  nunca se inventa una respuesta (`apps/api/src/config/ai-gateway.ts`).

### 8.3 Reindexar documentos

El panel no tiene un botón de reprocesamiento: ni la API ni la web invocan esta
función. La reindexación se hace con la RPC `public.retry_document_ingestion`
(`20260821064610_create_hito3_rag_foundation.sql`). El permiso de ejecución
está revocado a `anon` y `authenticated` y solo se concede a `service_role`. En
producción se ejecuta desde el SQL Editor de Supabase, con autorización del PO.

```sql
-- 1) Versiones indexadas y su conteo de fragmentos (solo lectura).
select dv.id, d.title, count(c.id) as chunks,
       count(distinct md5(c.chunk_content)) as distintos
from public.document_versions dv
join public.documents d on d.id = dv.document_id
left join public.document_chunks c on c.document_version_id = dv.id
where dv.ingestion_status = 'indexed'
group by dv.id, d.title;

-- 2) Reencolar una versión (p_actor_id: id del SUPERADMIN que autoriza).
select public.retry_document_ingestion('<document_version_id>', '<superadmin_user_id>');
```

- La RPC reinicia el trabajo (`attempt_count = 0`, sin lease ni error) y
  devuelve la versión a `pending`. **No** use un `UPDATE` manual sobre
  `document_ingestion_jobs`: dejaría la versión en su estado anterior y el
  trabajo no podría tomarse.
- Errores de la RPC:
  - `P0002`: la versión no tiene trabajo.
  - `55000`: ya se está procesando con un lease vigente. Espere a que termine.
- Reindexe **después** de desplegar el código que motiva la reindexación: el
  worker usa el código desplegado.
- Tiempos y costo: la API debe estar despierta. Cada documento deja de aparecer
  en la búsqueda mientras se reindexa. En la reindexación de los 3 documentos
  de producción (2026-09) cada uno tardó alrededor de un minuto y el costo de
  embeddings fue de centavos (`docs/hito3/RUNBOOK_ACTIVACION_EJE_B.md`); depende
  del tamaño del documento.
- Verificación: la versión vuelve a `indexed` y, en la consulta 1,
  `chunks = distintos`.

### 8.4 Diagnóstico de fallos

Vea `last_error_code` y `last_error_message` en `public.document_ingestion_jobs`
de la versión, corrija la causa y reencole con la RPC. El worker registra
siempre `last_error_code = 'INGESTION_FAILED'` y deja el detalle en
`last_error_message` (`apps/api/src/ingestion/ingestion.service.ts`). La base
usa además `LEASE_EXPIRED` (se agotaron los intentos con el lease vencido) y
`UNREADABLE_PDF` (falló el procesamiento al cargar). Casos ya observados en
`last_error_message`:

| Mensaje | Causa |
| --- | --- |
| `401 User not found.` | Llegó a OpenRouter con una `OPENROUTER_API_KEY` inválida |
| `Incorrect API key provided` | Falta `OPENROUTER_API_KEY` y la petición cayó a OpenAI directo |
| `INGESTION_UNSUPPORTED_FORMAT` | Archivo `.doc`, o un Markdown que no es texto |
| Documentos en `pending` sin avanzar | Worker apagado (revise los logs de §4.5) o instancia dormida |

---

## 9. Rollback

| Situación | Acción |
| --- | --- |
| Defecto en la API o en la web | Revierta el merge en `main`: botón *Revert* del PR en GitHub, o `git revert -m 1 <sha-del-merge>` en una rama nueva. Luego PR, CI y fusión. Render y Vercel redespliegan la versión anterior |
| Urgencia antes de que termine el revert | En Vercel, use *Instant Rollback* (en plan Hobby solo permite volver al despliegue de producción inmediatamente anterior). En Render, use *Rollback* a un deploy previo desde el panel del servicio. Ambos **congelan** producción: Vercel desactiva la asignación automática del dominio de producción y el rollback de Render desde el panel desactiva *Auto-Deploy*, así que los commits nuevos en `main` **no** se publican solos. Tras fusionar el revert, en Vercel use *Undo Rollback* (o promueva el despliegue nuevo) y en Render reactive *Auto-Deploy* en Settings y despliegue |
| Problema en la ingesta o en el costo del proveedor | `RAG_INGESTION_WORKER_ENABLED=false` en Render (§8.2) |
| Migración con defecto | No hay migraciones *down*. Corrija con una migración compensatoria; no edite ni borre la aplicada. Antes de revertir código, confirme que la versión anterior funciona con el esquema nuevo |
| Pérdida o corrupción de datos | Procedimiento de respaldos y restauración (entregable separado del Hito 5). Plan Free sin PITR |

---

## 10. Pendientes por confirmar (PO)

- Plan, costos y responsables de Vercel, Render (más allá de Free), Supabase y
  OpenRouter, y los límites de gasto configurados en OpenRouter.
- Ajustes de build no versionados de Vercel: install/build personalizados y
  versión de Node. Versión de Node en Render.
- Dominio propio y valores de las variables en el scope *Preview* de Vercel.
- Existencia de un servicio Render o proyecto Vercel de staging, y plan del
  proyecto Supabase de staging.
- Configuración real de Auth (Site URL, Redirect URLs, SMTP Resend) en los
  proyectos remotos.
- Si `RAG_ANSWER_FALLBACK_MODEL` y `FAQ_MEMORY_FINGERPRINT_SECRET` están
  cargadas en producción, y el valor de `NODE_ENV` en Render.
- Plan del workspace de Vercel (limita qué despliegues admite *Instant
  Rollback*).
- Reglas de protección de la rama `main` en GitHub.
