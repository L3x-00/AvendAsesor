# Runbook — Activación y cierre del RAG (Hito 3, Eje B)

Estado al 2026-09-24. Las secciones marcadas 🔴 son acciones sobre producción
(datos, despliegue o costo del proveedor): requieren autorización explícita del
Product Owner antes de ejecutarse.

## 0. Estado actual

- **RAG activo en producción** (`blxrdotroysitfyehmqw` + Render
  `avend-asesor-api`): worker encendido, proveedor OpenRouter
  (`gpt-4o-mini`, `text-embedding-3-small` de 1536 dimensiones), 3 documentos
  reales indexados (80 fragmentos).
- **Correcciones de cumplimiento en la rama `feat/hito3-cumplimiento-cliente`**
  (incluye M7 y M8): clasificador y ruteo, flujo evidence-only con la marca de
  «sin sustento», aclaraciones, continuidad, fuentes citadas y la interfaz web.
  Detalle y evidencia en `VALIDACION_INTEGRAL_HITO3.md`.
- **Validación integral** con documentos reales: 20 de 21 casos pasan; el caso
  de directivos requiere cargar documentos de ese tema.

## 1. 🔴 Fusionar y desplegar

Fusionar a `main` despliega Render (API) y Vercel (web) a la vez. La rama no
trae migraciones: el despliegue no requiere tocar la base.

Tras el despliegue:

```bash
curl -s https://avend-asesor-api.onrender.com/health/ready
```

Con una sesión de administrador, `GET /admin/rag/readiness` debe informar el
worker activo, el proveedor configurado, `matchThreshold: 0.5` y los conteos de
ingesta.

## 2. Umbral de similitud

El código ya usa 0.5 por defecto (calibrado con el corpus real). En Render,
`RAG_MATCH_THRESHOLD` puede quedar en `0.5` o eliminarse. **No** volver a 0.7:
con ese valor casi toda consulta real cae en «sin evidencia».

## 3. 🔴 Reindexar los 3 documentos ya cargados (después del despliegue)

**Obligatorio.** El fragmentador anterior guardaba el último tramo de cada
párrafo largo dos veces, dejaba tramos contenidos en el vecino, separaba el
título de un artículo de su cuerpo y etiquetaba el solapamiento con la página
siguiente. El retrieval ya descarta los fragmentos repetidos o contenidos en
otro de la misma versión, pero las páginas y los artículos solo se corrigen al
reindexar. Debe hacerse **después** del despliegue (el worker usa el código
desplegado). Cada documento deja de aparecer en la búsqueda durante su
reindexado (alrededor de un minuto) y el costo de embeddings es de centavos.

```sql
-- 1) Versiones indexadas y su conteo actual de fragmentos (solo lectura).
select dv.id, d.title, count(c.id) as chunks,
       count(distinct md5(c.chunk_content)) as distintos
from public.document_versions dv
join public.documents d on d.id = dv.document_id
left join public.document_chunks c on c.document_version_id = dv.id
where dv.ingestion_status = 'indexed'
group by dv.id, d.title;

-- 2) Reencolar cada versión (p_actor_id: el SUPERADMIN que autoriza).
select public.retry_document_ingestion('<document_version_id>', '<superadmin_user_id>');
```

Verificación: al cabo de uno o dos minutos la versión vuelve a `indexed` y la
consulta 1) muestra `chunks = distintos`. Si alguna queda en `failed`, revisar
`document_ingestion_jobs.last_error_code/last_error_message` y reencolar.

## 4. 🔴 Cargar el corpus completo

Para que los casos de docentes, auxiliares y directivos tengan sustento, cargar
por el panel (PDF, Word o Markdown, hasta 50 MiB) los documentos de al menos:
destaque, reasignación, permuta, encargatura de dirección, licencias,
inasistencias y tardanzas (incluidas las de auxiliares), vacaciones y
remuneraciones. El worker los indexa solo; el estado técnico pasa de
«Pendiente» a «Listo».

## 5. Validación integral (punto 12)

Con el corpus cargado, desde `apps/api`:

```bash
ACCEPTANCE_ENV_FILE=.env.acceptance.local npm run acceptance:hito3
```

El archivo de entorno (fuera de git) apunta al ambiente a validar. La corrida
usa los servicios reales pero simula el historial en memoria, así que no crea
conversaciones. Ajustar las preguntas de `test/acceptance/hito3-client-cases.ts`
al corpus cargado. El reporte queda en `test/acceptance/out/`.

Además, dos pruebas manuales en la aplicación con dos cuentas de docente:

- **Historial (caso 14):** consultar, cerrar sesión, volver, abrir el Historial,
  retomar la conversación, ver sus fuentes y hacer un seguimiento.
- **Aislamiento (caso 15):** con la segunda cuenta, abrir la URL
  `/chat/<id>` de una conversación de la primera: debe responder «no
  encontrada».

## 6. Rollback

- Comportamiento del chat: revertir el merge en `main` (redepliega la versión
  anterior; no hay migraciones que deshacer).
- Worker: `RAG_INGESTION_WORKER_ENABLED=false` en Render lo apaga de inmediato.
