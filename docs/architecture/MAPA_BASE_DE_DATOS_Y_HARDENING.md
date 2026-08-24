# Mapa de Base de Datos y Hardening — AVEND ASESOR

**Estado:** verificado localmente el 2026-08-22.  
**Fuente de verdad:** migraciones versionadas en `supabase/migrations/`.  
**Límite importante:** el proyecto remoto contiene Hitos 1 y 2; Hito 3 y este
hardening permanecen locales hasta una promoción autorizada desde un checkout
limpio.

## 1. Ambientes y alcance efectivo

| Capa | Migraciones | Estado |
| --- | --- | --- |
| Identidad y perfiles (Hito 1) | `20260809045322` | Remoto y local |
| Módulos, PDFs, versiones y auditoría (Hito 2) | `20260809194717` a `20260809220458` | Remoto y local |
| Ingesta, vectores, chat y fuentes (Hito 3) | `20260821064610` a `20260822065915` | Solo local |
| Hardening de integridad y rutas de consulta | `20260822083000` a `20260822090000` | Solo local |

No se debe ejecutar `supabase db push` desde el árbol de trabajo ordinario:
contiene migraciones Hito 3 que no están autorizadas para el proyecto remoto.

## 2. Modelo de datos y propietarios

| Dominio | Tablas | Propietario de escritura | Integridad principal |
| --- | --- | --- | --- |
| Identidad | `profiles` | Trigger privado de `auth.users` y backend controlado | Perfil 1:1, rol por enum, RLS por propietario |
| Organización | `modules` | API administrativa | Jerarquía sin ciclos, baja lógica sin hijos activos |
| Documento | `documents`, `document_versions`, `document_modules` | API administrativa mediante RPC | PDF privado, versiones inmutables, versión vigente del mismo documento |
| Trazabilidad | `document_audit_events` | RPCs documentales | Solo inserción; no se modifica ni elimina |
| Ingesta | `document_ingestion_jobs`, `document_chunks` | Worker de servidor | Lease, reintentos, transición de estado controlada y chunks por versión |
| Conversación | `chat_conversations`, `chat_messages`, `chat_message_sources` | API de chat mediante RPC | Historial por propietario, fuentes instantáneas y una respuesta por pregunta |
| Mejora continua | `unanswered_questions`, `faq_memory_candidates`, `faq_memory_observations`, `faq_memory_reviews` | RPC de chat y backend administrativo | Resúmenes operativos sin texto literal del chat más señales FAQ agregadas; historial de observación/revisión append-only, sin ser fuente RAG |

## 3. Flujos protegidos

```text
Auth.users -> trigger privado -> profiles

ADMIN/SUPERADMIN -> API -> RPC documental -> documentos/versiones/auditoría
                              -> Storage privado (URL firmada de 60 s)

Nueva versión PDF -> trabajo de ingesta -> lease con SKIP LOCKED
  -> extracción/OCR -> chunks + vector -> versión indexed

Consulta autenticada -> begin_chat_turn -> recuperación filtrada
  -> generación con evidencia -> complete_chat_turn -> mensaje + fuentes
                              -> observación FAQ reducida y agregada
```

El navegador no recibe privilegios de datos, acceso a Storage, vectores ni
funciones de escritura. NestJS verifica identidad y rol; la cuenta de servidor
es la única que ejecuta RPCs restringidas.

## 4. Seguridad e integridad verificada

- Todas las tablas de aplicación tienen RLS activado.
- `anon` y `authenticated` no tienen privilegios directos en dominios de
  administración, documentos, RAG o chat; `profiles` solo permite que un
  usuario autenticado lea su propio perfil.
- Las funciones sensibles tienen `search_path` explícito y ejecución revocada
  para navegador. Las RPCs de chat/ingesta son `SECURITY DEFINER` y se conceden
  únicamente a `service_role`; las RPCs documentales son `SECURITY INVOKER` con
  el mismo límite de ejecución. La recuperación vectorial limita su
  `search_path` a `pg_catalog` y califica explícitamente los objetos de
  `extensions` que necesita.
- Los triggers impiden ciclos de módulos, padre eliminado, baja lógica con
  hijos activos, mutación/eliminación de versiones y modificación de auditoría.
- `chat_messages.in_reply_to_message_id` y su índice único parcial establecen
  exactamente una respuesta terminal por pregunta. El trigger privado valida
  que la respuesta apunte a una pregunta del mismo historial. Un segundo
  trigger bloquea el cambio de rol o conversación de una pregunta ya respondida.
- `faq_memory_observations` y `faq_memory_reviews` son append-only. Un
  fingerprint HMAC calculado en el backend permite contar recurrencia sin
  replicar la pregunta del chat ni incorporarla como evidencia. La aprobación
  administrativa no cambia `search_document_chunks` ni el prompt.

La migración se niega a avanzar si detecta respuestas antiguas sin vínculo. No
intenta adivinar la pregunta origen: cualquier entorno con historial Hito 3
anterior requiere primero una migración de datos diseñada y validada para ese
corpus. Actualmente no existe tal entorno remoto.

No se añade `FORCE ROW LEVEL SECURITY`: las funciones de servidor necesitan
operar explícitamente bajo su cuenta restringida y no hay una tabla expuesta
con políticas permisivas. El aislamiento real se obtiene mediante RLS,
revocaciones y el límite de ejecución de funciones.

## 5. Índices y justificación

| Índice / estructura | Consulta o garantía | Decisión |
| --- | --- | --- |
| PK/únicos de perfiles, módulos, documentos y versiones | Identidad y claves compuestas | Ya existente |
| `modules_active_hierarchy_order_idx` | Árbol visible ordenado | Ya existente, parcial por baja lógica |
| `document_versions_document_version_idx` | Historial de versiones | Ya existente |
| `document_modules` PK + índice inverso | Asociaciones por documento y por módulo | Ya existente |
| `documents_live_list_order_idx` | Listado paginado por `updated_at`, título e ID | Añadido; el ID elimina paginación inestable |
| `document_ingestion_jobs_next_job_idx` | Cola pendiente/procesando | Ya existente; usa `SKIP LOCKED` |
| HNSW + GIN de `document_chunks` | Vecinos semánticos y capacidad léxica | HNSW activado por la ruta de consulta; GIN se conserva para evolución híbrida |
| `chat_conversations_user_updated_idx` | Historial por propietario | Ya existente, parcial por baja lógica |
| `chat_messages_conversation_created_id_idx` | Mensajes con desempate estable | Añadido y sustituye al índice prefijo redundante |
| `chat_messages_one_reply_per_question_idx` | Idempotencia de finalización | Añadido, parcial para respuestas |
| `unanswered_questions_pending_review_idx` | Bandeja de revisión pendiente | Añadido, parcial por `reviewed_at is null` |

No se crean índices para cada FK por defecto. Las FKs sin índice adicional
pertenecen a relaciones que no se eliminan físicamente en el flujo normal o no
son rutas de lectura actuales. Añadirlos hoy aumentaría escritura y memoria sin
evidencia de beneficio. Se revisarán con estadísticas reales antes de crecer.

## 6. Recuperación vectorial escalable

`search_document_chunks` usa ahora el operador de distancia coseno directamente
en `ORDER BY ... LIMIT`, forma que permite al planificador usar el índice HNSW.
Los filtros de documento vigente, ingesta indexada y módulo activo permanecen
dentro de la consulta. Con pgvector 0.8+ se habilita `hnsw.iterative_scan` con
orden estricto y un `ef_search` acotado para obtener resultados cuando los
filtros sean selectivos.

El umbral de evidencia se aplica fuera del CTE materializado de vecinos, sin
alterar el contrato funcional. La relevancia léxica sigue siendo un desempate
entre candidatos semánticos; una futura búsqueda léxica independiente deberá
usar el índice GIN y una batería de evaluación con corpus real antes de cambiar
la ponderación.

## 7. Observabilidad y operación

Antes de producción y después de disponer de corpus aprobado:

1. Ejecutar `EXPLAIN (ANALYZE, BUFFERS)` en staging con consultas representativas
   y sin datos personales en el resultado compartido.
2. Revisar en Supabase Query Performance/`pg_stat_statements` latencia, scans
   secuenciales, ratio de caché y consultas costosas.
3. Repetir `supabase db advisors --linked --fail-on warn` en cada promoción.
4. Vigilar cola: pendientes, leases vencidos, intentos, fallos y edad máxima.
5. Vigilar crecimiento de chunks, tamaño/recall de HNSW y bloat de tablas de
   auditoría/historial. No ejecutar `VACUUM FULL` ni reconstrucciones de índice
   en producción sin ventana, respaldo y autorización explícita.
6. Definir retención de historial, auditoría y consultas no resueltas antes de
   que exista volumen real; no eliminar evidencia histórica por defecto.

Las copias de seguridad, recuperación a un punto en el tiempo y cualquier
política de retención dependen del plan y configuración del proyecto Supabase;
deben validarse en el panel antes del primer uso productivo, no asumirse desde
el código.

## 8. Promoción, reversión y pendientes

Las migraciones `20260822083000` a `20260822090000` son aditivas salvo por la
sustitución de una función y un índice de historial que es prefijo del nuevo
índice. Su promoción
futura exige: respaldo verificable, checkout limpio con la secuencia exacta de
migraciones autorizadas, dry-run que no exponga credenciales, aprobación del
Product Owner y prueba de contratos en staging. No hay rollback automático para
una migración aplicada; la reversión se diseña como una nueva migración.

Pendientes deliberados:

- Rotación de la clave de servidor expuesta, aplazada por decisión del Product
  Owner; no se manipuló ni registró ninguna clave aquí.
- Métricas de carga, particionado, réplicas y caché: se deciden con telemetría,
  no preventivamente.
- Índices adicionales por FK: se evalúan al incorporar borrado físico o una
  ruta de consulta que los use.
- Calibración de HNSW/recall, evaluación RAG y ruta FTS independiente: requieren
  documentos reales aprobados y staging.
