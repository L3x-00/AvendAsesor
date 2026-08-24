# Render — API de staging

## Propósito y límite

`render.yaml` declara exclusivamente la API de **staging** de AVEND ASESOR.
No declara una base de datos de Render, un worker, un proveedor de IA, un
secreto de FAQ ni una migración automática. El proyecto Supabase de staging es
el único almacenamiento remoto de esta instancia.

La rama fijada es `codex/hito3-hito4-staging-fix`; `main` y la API de
producción quedan fuera de este Blueprint. Los cambios de esquema se aplican
por el runbook de release y se validan antes de desplegar la aplicación: el
proceso de Render no debe ejecutar `supabase db push`.

El plan `free` se acepta solo para staging: Render puede detener el servicio
tras inactividad y su siguiente solicitud puede tardar aproximadamente un
minuto. No es un entorno productivo.

## Creación desde el Blueprint

1. Antes de crear el servicio, abrir el proyecto Supabase **staging** y confirmar
   que su Project Ref es `scepelftmjlabepygrri`. Copiar la Project URL desde ese
   proyecto y verificar que su host contiene ese mismo identificador. La secret
   key debe ser la recién creada con nombre `renderapistaging` en ese mismo
   proyecto; no usar la credencial legacy ni ningún valor del proyecto de
   producción.
2. Esperar a que el Preview Vercel de la rama quede en estado **Ready** y usar
   su alias fijo de rama. Este alias será el único `WEB_ORIGIN`; nunca usar una
   URL efímera de deployment ni añadir `/` final.
3. En Render, crear un **Blueprint** desde el repositorio `L3x-00/AvendAsesor`
   y seleccionar la rama `codex/hito3-hito4-staging-fix`.
4. Confirmar el archivo raíz `render.yaml`. Debe crear un único Web Service
   llamado `avend-asesor-api-staging` en Ohio, con la comprobación de
   disponibilidad `/health/ready`.
5. En los campos que Render solicita durante la creación, ingresar directamente
   en el panel, sin pegarlos en Git ni en documentación:

   | Variable                    | Valor del entorno staging                                  |
   | --------------------------- | ---------------------------------------------------------- |
   | `SUPABASE_URL`              | Project URL del proyecto Supabase `avend-asesor-staging`   |
   | `SUPABASE_SERVICE_ROLE_KEY` | La nueva secret key `renderapistaging`                     |
   | `WEB_ORIGIN`                | URL estable del Preview Vercel de esta rama, sin `/` final |

6. No agregar `OPENAI_API_KEY`, `FAQ_MEMORY_FINGERPRINT_SECRET` ni habilitar
   `RAG_INGESTION_WORKER_ENABLED`: los proveedores, la ingesta y la memoria FAQ
   permanecen deshabilitados en esta etapa.
7. Tras el primer deploy, comprobar `/health/ready` antes de conectar Vercel.
   Ese endpoint solo responde satisfactoriamente cuando la clave de servidor es
   aceptada por la Project URL configurada. Si falla, corregir Render y no
   actualizar Vercel.
8. Solo después de esa comprobación, copiar la URL HTTPS publicada por Render y
   usarla como `ADMIN_API_URL` en la sobrescritura **Preview** de Vercel para
   esta misma rama. `WEB_ORIGIN` y `ADMIN_API_URL` se actualizan como un par
   cuando cambie el alias Vercel. No modificar las variables de producción ni
   las de otros previews.

## Verificación posterior

Con la URL real publicada por Render, comprobar:

```powershell
Invoke-RestMethod -Uri 'https://<url-real-de-render>/health'
Invoke-RestMethod -Uri 'https://<url-real-de-render>/health/ready'
```

La primera respuesta esperada es `service = avend-asesor-api` y `status = ok`.
La segunda debe tener `status = ready`; no expone usuarios, claves ni detalles
del proveedor. Después de actualizar `ADMIN_API_URL`, comprobar desde el
Preview autenticado que la API acepte únicamente el origen Vercel configurado y
que no exista una llamada hacia la API o Supabase de producción.

La clave legacy `service_role` permanece habilitada por decisión del Product
Owner, pero este servicio no la utiliza. Su rotación o revocación queda como
deuda de seguridad independiente; nunca se debe reutilizar para staging.
