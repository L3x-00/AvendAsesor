# Guía de instalación local — AVEND ASESOR

Esta guía explica cómo obtener el código, instalarlo y levantar AVEND ASESOR en una
estación de desarrollo: base de datos Supabase local, API NestJS (`apps/api`) y web
Next.js (`apps/web`). También explica cómo ejecutar las pruebas y las mismas
verificaciones que corre la integración continua.

Todo lo descrito aquí se ejecuta contra servicios locales. No se necesitan
credenciales de staging ni de producción, y no deben usarse. El despliegue
(Render, Vercel y Supabase remoto) queda fuera del alcance de esta guía.

> Estado verificado el 2026-09-25, rama `docs/hito5-documentacion-tecnica`.
> Los comandos citados existen en `package.json`, `apps/api/package.json`,
> `apps/web/package.json` o en los scripts de `infrastructure/local/`.

---

## 0. Resumen rápido

Desde la raíz del repositorio, con Docker Desktop encendido:

```powershell
git clone https://github.com/L3x-00/AvendAsesor.git
cd AvendAsesor
npm ci
supabase start                      # levanta Postgres, Auth y Storage locales y aplica las migraciones
supabase status                     # muestra las URL y las claves locales
# crear apps/api/.env y apps/web/.env.local (ver sección 5)
npm run demo:seed                   # opcional: usuarios, módulos y documentos ficticios
npm run dev:api                     # terminal 1 → http://localhost:3001
npm run dev:web                     # terminal 2 → http://localhost:3000
```

---

## 1. Requisitos

| Herramienta | Versión | Dónde se define | Para qué |
| --- | --- | --- | --- |
| Node.js | `24.14.0` (rango permitido `>=24.14.0 <25`) | `.nvmrc`, `engines` en `package.json` | Ejecutar API, web, pruebas y scripts |
| npm | `>=11.16.0 <12` | `engines` en `package.json` | Gestor de paquetes (npm workspaces) |
| Git | cualquiera reciente | — | Obtener el código |
| Docker Desktop | cualquiera reciente (en Windows, con backend WSL 2) | — | Contenedores de Supabase local |
| Supabase CLI | 2.x (verificado con `2.109.0`) | no es dependencia del repo; debe estar en el `PATH` como `supabase` | `supabase start`, migraciones y pruebas pgTAP |
| PowerShell | 5.1 o superior | — | Scripts `infrastructure/local/*.ps1` (opcionales) |

Notas:

- El repositorio usa **npm workspaces** (`"workspaces": ["apps/*", "packages/*"]`) con
  `package-lock.json`. **No use pnpm ni yarn**: no hay configuración para ellos y la
  integración continua instala con `npm ci`.
- No existe `.npmrc` con `engine-strict`. Con otra versión de Node, npm solo muestra
  avisos `EBADENGINE` y no se detiene, pero la versión soportada es la de `.nvmrc`. La
  integración continua usa Node 24 (`.github/workflows/ci.yml`).
- Con nvm-windows: `nvm install 24.14.0` y luego `nvm use 24.14.0`.
- Para usar el chat o indexar documentos en local se necesita una clave de OpenRouter
  u OpenAI (sección 5.2). Sin clave, el resto del sistema funciona.

---

## 2. Obtener el código

```powershell
git clone https://github.com/L3x-00/AvendAsesor.git
cd AvendAsesor
```

Estructura relevante:

| Ruta | Contenido |
| --- | --- |
| `apps/api` | API NestJS 11: autenticación, autorización, módulos, documentos, ingesta RAG y chat |
| `apps/web` | Web Next.js 16 (React 19): interfaz y BFF. No contiene lógica de negocio |
| `packages/shared` | Paquete `@avend/shared` (sin scripts propios) |
| `supabase/` | `config.toml`, migraciones (`supabase/migrations/`) y pruebas pgTAP (`supabase/tests/database/`) |
| `infrastructure/local/` | Scripts PowerShell para levantar y verificar el entorno local |
| `scripts/` | Seed de datos demo (`seed-demo-data.mjs`) y utilidades de demo productiva |
| `.github/workflows/ci.yml` | Integración continua |

---

## 3. Instalar dependencias

Desde la **raíz** del repositorio:

```powershell
npm ci
```

- `npm ci` instala exactamente lo que fija `package-lock.json`. Es el mismo comando de
  la integración continua.
- Las dependencias de todos los workspaces se instalan en `node_modules/` de la raíz.
  No ejecute `npm install` dentro de `apps/api` ni de `apps/web`.
- Use `npm install <paquete> --workspace=api` (o `--workspace=web`) solo cuando vaya a
  cambiar dependencias. Ese comando actualiza `package-lock.json`, y el cambio se
  confirma junto con el código.

---

## 4. Supabase local

### 4.1 Levantar el stack

Con Docker Desktop en ejecución, desde la raíz:

```powershell
supabase start
```

La primera vez descarga las imágenes y aplica, en orden, todas las migraciones de
`supabase/migrations/` (51 archivos a la fecha). La configuración está en
`supabase/config.toml` (`project_id = "AvendAsesor"`, Postgres 17). Los contenedores
se llaman `supabase_<servicio>_AvendAsesor` (por ejemplo, `supabase_db_AvendAsesor`).

El proyecto usa un rango de puertos propio, distinto del predeterminado de Supabase
(comentario en `supabase/config.toml`):

| Servicio | URL / puerto local |
| --- | --- |
| API de Supabase (REST, Auth, Storage) | `http://127.0.0.1:55321` |
| Postgres | `127.0.0.1:55322` (usuario `postgres`) |
| Studio | `http://127.0.0.1:55323` |
| Bandeja de correo local | `http://127.0.0.1:55324` |
| Base *shadow* | `55320` |
| Analytics | `55327` |

Para ver las URL y las claves locales:

```powershell
supabase status
```

Los valores `API_URL`, `ANON_KEY` y `SERVICE_ROLE_KEY` alimentan las variables de
entorno (sección 5). Son claves de desarrollo del stack local: no las copie a ningún
ambiente remoto ni las confirme en Git.

Para detener el stack sin perder los datos locales: `supabase stop`.

### 4.2 Migraciones

| Tarea | Comando |
| --- | --- |
| Ver las migraciones aplicadas en local | `supabase migration list --local` |
| Crear una migración nueva | `supabase migration new <nombre_descriptivo>` (crea `supabase/migrations/<timestamp>_<nombre>.sql`) |
| Recrear la base local desde cero y reaplicar todas las migraciones | `supabase db reset --local` |

- `supabase db reset --local` **borra todos los datos locales**. Úselo solo en una
  base descartable y luego vuelva a correr `npm run demo:seed` si necesita datos.
- El seed SQL de Supabase está desactivado (`[db.seed] enabled = false`). Los datos de
  ejemplo se cargan con el script de la sección 4.3.
- Después de escribir una migración, pruébela con `supabase db reset --local` y con las
  pruebas pgTAP (sección 7.4).
- **Nunca** ejecute `supabase db push` desde su copia de trabajo: aplicaría todas las
  migraciones locales, incluidas las que no se han fusionado, al proyecto enlazado. Las
  migraciones remotas se aplican una por una y antes de fusionar a `main` el código que
  las necesita, porque fusionar a `main` despliega la API y la web. Ese procedimiento
  pertenece al manual de despliegue.

### 4.3 Datos de demostración (opcional)

```powershell
npm run demo:seed      # crea o actualiza los datos demo
npm run demo:verify    # verifica sin modificar datos
```

- El script `scripts/seed-demo-data.mjs` obtiene las credenciales mediante
  `supabase status` y **rechaza cualquier destino que no sea `localhost` o
  `127.0.0.1`**. No lee los archivos `.env`.
- Crea usuarios ficticios del dominio `@demo.avend.local` (superadministradora,
  administradores y docentes), módulos, documentos, consultas y casos. Los usuarios
  y su contraseña de prueba se describen en `docs/database/DEMO_SEED.md`.
- Los documentos demo llevan el marcador `metadata.demoSeed = "avend-demo-2026"` y
  **están excluidos del RAG** (migración
  `20260908151631_excluir_documentos_demo_del_rag.sql`). Sirven para los paneles de
  administración, no para obtener respuestas del chat.
- Los scripts `demo:*:production` son exclusivos del proyecto productivo y exigen
  confirmaciones y respaldo. No forman parte de la instalación local.

### 4.4 Correo local

Supabase Auth exige confirmar el correo (`[auth.email] enable_confirmations = true`).
En local, los correos de registro y de recuperación no salen a Internet: se capturan
en la bandeja `http://127.0.0.1:55324` (`[local_smtp]` en `supabase/config.toml`).
Las redirecciones de Auth permitidas en local son
`http://localhost:3000/auth/callback?next=/auth/confirmed` y
`http://localhost:3000/auth/callback?next=/auth/update-password`.

Existe además `infrastructure/mailpit/compose.yaml`, un Mailpit independiente en los
puertos 8025/1025. La configuración actual de `supabase/config.toml` no define
`[auth.email.smtp]`, así que Auth no le envía correos. No hace falta levantarlo.

---

## 5. Variables de entorno

### 5.1 Dónde van

| App | Archivo local | Quién lo lee | Plantilla |
| --- | --- | --- | --- |
| API | `apps/api/.env` | `ConfigModule` de NestJS (`apps/api/src/app.module.ts`), que lee `.env` en el directorio de trabajo; `npm run dev:api` se ejecuta en `apps/api` | `apps/api/.env.example` |
| Web | `apps/web/.env.local` (también sirve `apps/web/.env`) | Next.js, al arrancar en `apps/web` | `apps/web/.env.example` |

- `.env.example` en la raíz reúne las variables de ambas apps en un solo archivo.
- `.gitignore` ignora todo `.env*` excepto `.env.example`. **Nunca confirme un archivo
  `.env` con valores reales.**
- La API **solo** lee `apps/api/.env`, no `.env.local`. Las variables definidas en el
  proceso (la terminal) tienen prioridad sobre el archivo.
- La API valida su configuración al arrancar. Si algo no cumple el esquema, se detiene
  con `Invalid environment configuration.` sin detallar la variable. Revise la tabla
  5.2.

### 5.2 API (`apps/api/.env`)

Esquema: `apps/api/src/config/environment.validation.ts`, salvo las dos variables de
Supabase, que valida `apps/api/src/supabase/supabase.server-client.ts`.

| Variable | Obligatoria | Por defecto | Valor local | Propósito y reglas |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development` | `development`, `test`, `staging` o `production` |
| `PORT` | No | `3000` | **`3001`** | Puerto de la API. Fíjelo en `3001`: la web usa el 3000 y espera la API en `http://localhost:3001` |
| `WEB_ORIGIN` | No | `http://localhost:3000` | `http://localhost:3000` | Origen exacto permitido por CORS. Sin ruta, query ni credenciales. HTTPS obligatorio en `staging` y `production` |
| `SUPABASE_URL` | Sí, para usar la base | — | `API_URL` de `supabase status` | URL de Supabase. Debe definirse junto con la clave de servicio: con una sola, la API no arranca (`Supabase server configuration is invalid.`); sin ninguna, arranca pero `/health/ready` responde 503 |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí, para usar la base | — | `SERVICE_ROLE_KEY` de `supabase status` | Clave de servicio. Solo servidor; nunca se expone a la web |
| `OPENROUTER_API_KEY` | No | — | la suya, si prueba el chat | Si existe, embeddings y respuestas pasan por OpenRouter (`apps/api/src/config/ai-gateway.ts`) |
| `OPENAI_API_KEY` | No | — | alternativa a la anterior | Se usa solo si no hay `OPENROUTER_API_KEY` |
| `AI_GATEWAY_BASE_URL` | No | con OpenRouter: `https://openrouter.ai/api/v1`; con OpenAI: el del SDK | vacío | Sustituye el endpoint compatible con la API de OpenAI. Debe ser una URL |
| `RAG_EMBEDDING_MODEL` | No | `text-embedding-3-small` | con OpenRouter: `openai/text-embedding-3-small` | Debe producir vectores de 1536 dimensiones (`RAG_EMBEDDING_DIMENSIONS`, columna `vector(1536)`) |
| `RAG_ANSWER_MODEL` | No | `gpt-4o-mini` | con OpenRouter: `openai/gpt-4o-mini` | Modelo de respuesta. Con OpenRouter, use el nombre con prefijo del proveedor |
| `RAG_ANSWER_FALLBACK_MODEL` | No | — | vacío | Modelo de respaldo, solo ante error técnico del primario |
| `RAG_INGESTION_WORKER_ENABLED` | No | `false` | `false` | `true` enciende el worker de ingesta, que revisa la cola cada 5 s (`apps/api/src/ingestion/ingestion.worker.ts`). Con `true` exige `OPENROUTER_API_KEY` u `OPENAI_API_KEY` |
| `RAG_INGESTION_LEASE_SECONDS` | No | `300` | `300` | Duración del bloqueo de un trabajo de ingesta (30–900) |
| `RAG_MATCH_THRESHOLD` | No | `0.5` | `0.5` | Similitud mínima (0–1) para aceptar un fragmento como evidencia (`RAG_DEFAULT_MATCH_THRESHOLD` en `apps/api/src/rag/rag.constants.ts`) |
| `RAG_MATCH_COUNT` | No | `5` | `5` | Fragmentos recuperados por consulta (1–10) |
| `CHAT_HISTORY_LIMIT` | No | `20` | `20` | Límite de historial del chat (1–50) |
| `FAQ_MEMORY_FINGERPRINT_SECRET` | No | — | vacío | Si se define, mínimo 32 caracteres. Según `apps/api/.env.example`, es necesaria antes de habilitar la agregación compartida de memoria FAQ. Solo servidor |

Sin clave de IA, la API arranca igual. Las operaciones que necesitan el proveedor
(chat e ingesta) fallan con 503 (`The AI gateway is not configured.`) al invocarse.

### 5.3 Web (`apps/web/.env.local`)

| Variable | Obligatoria | Valor local | Validación y reglas |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | `API_URL` de `supabase status` | `apps/web/src/lib/supabase/config.ts` (`Supabase public configuration is incomplete.` si falta) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | `ANON_KEY` de `supabase status` | Clave pública o *anon*. **Nunca** la clave de servicio |
| `ADMIN_API_URL` | Sí, para los paneles y el chat | `http://localhost:3001` | `apps/web/src/lib/admin-api/config.ts`: solo el origen, sin ruta ni barra extra. Exige HTTPS, salvo `http` en `localhost` o `127.0.0.1`. No lleva prefijo `NEXT_PUBLIC` |
| `APP_URL` | No en desarrollo | `http://localhost:3000` | `apps/web/src/lib/auth/site-url.ts`: si falta y `NODE_ENV` no es `production`, usa `http://localhost:3000`. Fuera de localhost exige HTTPS |

### 5.4 Alternativa sin archivos `.env`: `Invoke-LocalEnvironment.ps1`

`infrastructure/local/Invoke-LocalEnvironment.ps1` lee `supabase status` y rechaza
cualquier URL que no sea local. Define las variables solo para el proceso y ejecuta el
comando indicado desde la raíz:

```powershell
.\infrastructure\local\Invoke-LocalEnvironment.ps1 -Target api npm run dev:api
.\infrastructure\local\Invoke-LocalEnvironment.ps1 -Target web npm run dev:web
```

- `-Target api` define `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `WEB_ORIGIN=http://localhost:3000`, `NODE_ENV=development` y `PORT=3001`.
- `-Target web` define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `ADMIN_API_URL=http://localhost:3001`, `APP_URL=http://localhost:3000` y
  `NODE_ENV=development`.
- No define claves de IA. Si las necesita, póngalas en `apps/api/.env`: la API sigue
  leyendo ese archivo, y las variables del proceso prevalecen sobre él.

---

## 6. Ejecutar la aplicación

Orden: Supabase local → API → web.

```powershell
# Terminal 1 — API NestJS en modo watch (nest start --watch)
npm run dev:api

# Terminal 2 — Web Next.js (next dev)
npm run dev:web
```

| Comprobación | Resultado esperado |
| --- | --- |
| `http://localhost:3001/health` | `{"service":"avend-asesor-api","status":"ok"}` |
| `http://localhost:3001/health/ready` | `{"service":"avend-asesor-api","status":"ready"}`. Responde 503 si no alcanza Supabase en 3 s o si faltan las variables de Supabase (`apps/api/src/health/`) |
| `http://localhost:3000` | Página de inicio de la web |

- Abra la web en **`http://localhost:3000`**, no en `127.0.0.1:3000`. Las
  redirecciones de Auth y la verificación de origen de rutas como `/auth/sign-out`
  comparan contra `APP_URL`, y con otro origen responden 403.
- Para entrar a los paneles de administración use las cuentas del seed demo
  (sección 4.3). Toda cuenta registrada desde la web nace con el rol `docente`.
- Con `RAG_INGESTION_WORKER_ENABLED=false` (valor por defecto), los documentos que
  suba quedan con estado técnico «Pendiente». Para indexarlos en local encienda el
  worker y configure una clave de IA. Cada indexación consume saldo del proveedor.
- El chat responde con evidencia solo si hay documentos reales indexados. Los
  documentos demo no cuentan.

Otras formas de ejecución:

| Objetivo | Comando |
| --- | --- |
| API con depurador (`--debug --watch`) | `npm run start:debug --workspace=api` |
| API compilada, como en producción | `npm run build --workspace=api` y luego `npm run start:prod --workspace=api` (`node dist/main`) |
| Web compilada | `npm run build --workspace=web` y luego `npm run start --workspace=web` (`next start`) |

---

## 7. Pruebas

Ninguna de estas suites requiere claves de IA. Solo pgTAP necesita Supabase local. La
integración continua ejecuta unitarias y e2e sin base de datos.

### 7.1 API — unitarias (Jest)

| Comando | Qué hace |
| --- | --- |
| `npm run test --workspace=api` | Ejecuta `apps/api/src/**/*.spec.ts` |
| `npm run test --workspace=api -- <patrón>` | Solo los specs cuyo nombre coincide |
| `npm run test:cov --workspace=api` | Con cobertura y `--runInBand`. Umbral global: ramas 80 %, funciones, líneas y sentencias 90 % (`jest.coverageThreshold` en `apps/api/package.json`) |
| `npm run test:watch --workspace=api` | Modo watch |

### 7.2 API — e2e (Jest + Supertest)

```powershell
npm run test:e2e
```

Equivale a `npm run test:e2e --workspace=api`, con la configuración
`apps/api/test/jest-e2e.json`. Levanta `AppModule` y reemplaza los servicios de
dominio por *mocks* (`overrideProvider` en `apps/api/test/app.e2e-spec.ts`). Prueba
rutas, autorización, validación y SSE sin tocar la base.

### 7.3 Web — Vitest (jsdom + Testing Library)

| Comando | Qué hace |
| --- | --- |
| `npm run test --workspace=web` | `vitest run` sobre `apps/web/src/**/*.spec.{ts,tsx}` |
| `npm run test --workspace=web -- <filtro>` | Solo los archivos que coinciden |
| `npm run test:cov --workspace=web` | Con cobertura v8. Umbral global 80/90/90/90, más umbrales por archivo para `chat-panel.tsx`, `chat-sources.tsx` y `teacher-shell.tsx` (`apps/web/vitest.config.mts`) |

Ejecute Vitest siempre mediante `npm run`. Invocar directamente el binario puede
cargar otra instancia de Vitest y romper `src/test/setup.ts`.

### 7.4 Base de datos — pgTAP

Con Supabase local levantado y las migraciones aplicadas:

```powershell
supabase test db --local
```

Ejecuta los 22 archivos de `supabase/tests/database/*.sql`. Cada archivo corre dentro
de una transacción que termina en `rollback`, así que no deja datos. Es el mismo
comando que usan los scripts de cierre de `infrastructure/local/`. No existe un
script npm para pgTAP.

Para depurar un solo archivo desde Git Bash con `psql` dentro del contenedor (este
método no forma parte de los scripts del repositorio):

```bash
docker cp supabase/tests/database supabase_db_AvendAsesor:/tmp/tests
MSYS_NO_PATHCONV=1 docker exec supabase_db_AvendAsesor \
  psql -U postgres -d postgres -X -q -f /tmp/tests/<archivo>_test.sql
```

`supabase test db` habilita pgTAP por su cuenta. Con `psql` directo, la extensión
`pgtap` debe existir en la base local. Si `plan()` no existe, use
`supabase test db --local`.

### 7.5 Todo junto y verificación integral local

| Comando | Qué hace |
| --- | --- |
| `npm run test` | Unitarias de API y web |
| `npm run test:coverage` | Unitarias con cobertura de ambos workspaces (igual que la integración continua) |
| `.\infrastructure\local\Test-LocalHito4Closure.ps1` | pgTAP, `supabase db advisors --local --fail-on warn`, `supabase migration list --local`, cobertura API, e2e, typecheck, lint, pruebas, build, `npm audit --omit=dev --audit-level=high` y `git diff --check` |
| `.\infrastructure\local\Test-LocalHito3Closure.ps1` | Igual, con foco en chat y RAG (incluye cobertura web) |

Los scripts de cierre exigen `supabase`, `node`, `npm` y `git` en el `PATH`, y se
niegan a correr si Supabase no es local en el puerto 55321. Algunos scripts reinician
la base local, siempre con una opción explícita: `Test-LocalHito2Closure.ps1` exige
`-AllowLocalReset` y `Test-LocalDocumentsApi.ps1 -ResetAfter` ejecuta
`supabase db reset --local` al terminar.

---

## 8. Lint, typecheck y build (igual que la integración continua)

`.github/workflows/ci.yml` corre en cada *pull request* y en cada *push* a `main`
(Ubuntu, Node 24), en este orden:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
npm run verify:build-artifacts
```

| Script raíz | API (`apps/api`) | Web (`apps/web`) |
| --- | --- | --- |
| `npm run lint` | `eslint "{src,apps,libs,test}/**/*.ts"` con Prettier (`endOfLine: "auto"`) | `eslint` (`eslint-config-next`) |
| `npm run lint:fix` | `eslint ... --fix` | no tiene `lint:fix` |
| `npm run typecheck` | `tsc --noEmit` | `next typegen && tsc --noEmit` |
| `npm run build` | `nest build` → `apps/api/dist` | `next build` → `apps/web/.next` |
| `npm run verify:build-artifacts` | — | `node scripts/verify-orientation-trace.mjs` |

`verify:build-artifacts` necesita un `next build` previo. Comprueba que la traza de la
ruta de descarga de la ficha de orientación
(`/api/chat/conversations/[conversationId]/messages/[messageId]/orientacion/[format]`)
incluya los módulos de `pdfkit` y `fontkit` que Vercel debe empaquetar.

`npm run format --workspace=api` reescribe con Prettier **todos** los archivos de
`apps/api/src` y `apps/api/test`. Prefiera `npm run lint:fix` o formatear solo los
archivos que tocó (sección 10).

---

## 9. Arnés de aceptación RAG (`acceptance:hito3`)

`apps/api/test/acceptance/hito3-client-cases.ts` ejecuta los 15 casos mínimos del
cliente y un *red-team* con los servicios **reales**: clasificador, recuperación
contra la base configurada, embeddings y generación del proveedor. El historial se
simula en memoria, así que la corrida no crea conversaciones ni pendientes. Además,
fuerza `RAG_INGESTION_WORKER_ENABLED=false`. Cada caso se marca `PASA`, `FALLA` o
`REQUIERE_CORPUS`.

**Requisitos**

- Un archivo de entorno **fuera de Git** en `apps/api`, por ejemplo
  `apps/api/.env.acceptance.local`. El patrón `.env*` de `.gitignore` lo excluye.
  Debe contener `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `OPENROUTER_API_KEY` u
  `OPENAI_API_KEY`, y opcionalmente las variables `RAG_*` de la sección 5.2.
- Formato `NOMBRE=valor`, una por línea y **sin comillas**: el lector del arnés no las
  quita.
- Un corpus de documentos reales ya indexados en la base de destino. Los documentos
  demo no cuentan. Las preguntas del arnés corresponden al corpus actual; si cambia,
  ajústelas.

**Ejecución** (la ruta del archivo es relativa a `apps/api`):

```powershell
# PowerShell
cd apps/api
$env:ACCEPTANCE_ENV_FILE = '.env.acceptance.local'
npm run acceptance:hito3
Remove-Item Env:ACCEPTANCE_ENV_FILE
```

```bash
# Git Bash
cd apps/api && ACCEPTANCE_ENV_FILE=.env.acceptance.local npm run acceptance:hito3
```

**Resultado**

- En consola aparece un `RESUMEN` con el conteo por veredicto.
- Los reportes quedan en `apps/api/test/acceptance/out/hito3-acceptance.json` y
  `.md`. Esa carpeta está ignorada por Git (`apps/api/.gitignore`) porque contiene
  respuestas y fuentes. Para cambiar la ruta base use `ACCEPTANCE_OUT`.
- El proceso termina con código 1 solo ante un error de ejecución. Los casos `FALLA`
  no cambian el código de salida: revise el resumen.

**Precauciones**

- La corrida consume saldo del proveedor, unas 25 consultas.
- Si el archivo de entorno apunta a un ambiente remoto, el arnés **lee** los datos de
  ese ambiente con la clave de servicio, aunque no escriba en él. Hacerlo contra
  producción requiere autorización del responsable del proyecto.
- Contexto y últimos resultados: `docs/hito3/VALIDACION_INTEGRAL_HITO3.md` y
  `docs/hito3/RUNBOOK_ACTIVACION_EJE_B.md` (sección 5).

---

## 10. Problemas comunes en Windows

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `supabase start` no conecta con Docker | Docker Desktop apagado o sin WSL 2 | Inicie Docker Desktop y espere a que el motor esté activo |
| `supabase start` falla por un puerto ocupado | Otro stack de Supabase u otro proceso usa el rango 55320–55329 | Detenga el otro stack (`supabase stop` en su carpeta) o libere el puerto |
| `supabase` no se reconoce en PowerShell | La CLI no está en el `PATH` | Instale la CLI y abra una terminal nueva; los scripts la invocan como `supabase` |
| La API ocupa el puerto 3000 y la web arranca en otro puerto o no encuentra la API | `PORT` sin definir (valor por defecto 3000) | `PORT=3001` en `apps/api/.env` |
| `Invalid environment configuration.` al iniciar la API | Una variable no cumple el esquema (por ejemplo, `WEB_ORIGIN` con ruta o `RAG_MATCH_COUNT` mayor que 10) | Revise la tabla 5.2 |
| `Supabase server configuration is invalid.` | Solo está definida una de `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` | Defina ambas |
| La API ignora `apps/api/.env.local` | La API solo lee `apps/api/.env` | Renombre el archivo a `.env` |
| `/health/ready` responde 503 | Supabase local detenido o sin variables de Supabase | `supabase status` y la sección 5.2 |
| La web falla con `Administrative API configuration is invalid.` | `ADMIN_API_URL` con ruta o barra extra, o `http` fuera de localhost | Use exactamente `http://localhost:3001` |
| Cerrar sesión o enviar reportes responde 403 | Abrió la web en `127.0.0.1` y `APP_URL` es `localhost` (o al revés) | Use `http://localhost:3000` |
| No llega el correo de confirmación | En local los correos no salen a Internet | Ábralos en `http://127.0.0.1:55324` |
| El chat responde 503 | No hay `OPENROUTER_API_KEY` ni `OPENAI_API_KEY` | Configure una clave en `apps/api/.env` |
| Un documento subido queda «Pendiente» | Worker de ingesta apagado (valor por defecto) | `RAG_INGESTION_WORKER_ENABLED=true` más una clave de IA, solo si necesita indexar |
| `VAR=valor npm run ...` no funciona en PowerShell | Esa sintaxis es de bash | `$env:VAR = 'valor'; npm run ...` |
| PowerShell bloquea un `.ps1` de `infrastructure/local` | Política de ejecución | `powershell -NoProfile -ExecutionPolicy Bypass -File .\infrastructure\local\<script>.ps1` (afecta solo a ese proceso) |
| `docker exec ... psql -f /tmp/...` no encuentra el archivo en Git Bash | Git Bash convierte la ruta a formato Windows | Anteponga `MSYS_NO_PATHCONV=1` |
| `npm run test:debug --workspace=api` falla | El script apunta a `node_modules/.bin/jest` dentro de `apps/api`, y npm workspaces instala en la raíz | Desde `apps/api`: `node --inspect-brk ../../node_modules/jest/bin/jest.js --runInBand` |
| Avisos `EBADENGINE` durante `npm ci` | Versión de Node o npm fuera de `engines` | `nvm use 24.14.0` |
| Errores al instalar o probar con pnpm | El repositorio es de npm workspaces | Use `npm ci` y `npm run ...` |
| Muchos archivos cambian tras `npm run format --workspace=api` | Prettier escribe LF sobre archivos con CRLF (`core.autocrlf=true`) | Formatee solo los archivos que tocó (`npx prettier --write <archivo>`) o use `npm run lint:fix`; el lint de la API acepta ambos finales de línea (`endOfLine: "auto"`) |

---

## 11. Relación con los ambientes remotos

La instalación local no necesita ni debe usar credenciales remotas. Como referencia:

| Ambiente | Supabase | API | Web |
| --- | --- | --- | --- |
| Local | stack de `supabase start` (`127.0.0.1:55321`) | `http://localhost:3001` | `http://localhost:3000` |
| Staging | proyecto `scepelftmjlabepygrri` (`avend-asesor-staging`, us-east-2) | Por confirmar (PO) | Por confirmar (PO) |
| Producción | proyecto `blxrdotroysitfyehmqw` (`AVENDSESOR`, us-west-2, Postgres 17, plan Free sin PITR) | `https://avend-asesor-api.onrender.com` (Render, `avend-asesor-api`) | `https://avend-asesor-web.vercel.app` (Vercel, `avend-asesor-web`) |

Fusionar a `main` despliega automáticamente la API (Render) y la web (Vercel). Nunca
apunte un `.env` local a producción para desarrollar.

---

## 12. Fuentes

- `package.json`, `apps/api/package.json`, `apps/web/package.json`, `.nvmrc`
- `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`, `.gitignore`
- `apps/api/src/config/environment.validation.ts`, `apps/api/src/config/ai-gateway.ts`,
  `apps/api/src/supabase/supabase.server-client.ts`, `apps/api/src/health/`
- `apps/web/src/lib/supabase/config.ts`, `apps/web/src/lib/admin-api/config.ts`,
  `apps/web/src/lib/auth/site-url.ts`, `apps/web/vitest.config.mts`
- `supabase/config.toml`, `supabase/migrations/`, `supabase/tests/database/`
- `infrastructure/local/*.ps1`, `infrastructure/mailpit/`, `scripts/seed-demo-data.mjs`,
  `docs/database/DEMO_SEED.md`
- `apps/api/test/jest-e2e.json`, `apps/api/test/acceptance/hito3-client-cases.ts`
- `.github/workflows/ci.yml`
