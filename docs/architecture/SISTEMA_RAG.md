# Sistema RAG — AVEND ASESOR

## Propósito y límite de alcance

El núcleo RAG responde consultas normativas únicamente cuando existe evidencia
recuperada desde una versión vigente de un PDF privado. No usa conocimiento
general del modelo como fuente, no habilita DOCX/TXT/imágenes independientes y
no entrega al navegador acceso a Storage, PostgREST, vectores ni claves de
servidor.

El alcance implementado corresponde al Hito 3. Reranking, reescritura de
consultas, caché semántica, GraphRAG y evaluación con corpus productivo son
evoluciones posteriores, no comportamientos implícitos del sistema actual.

La memoria de mejora continua no es una excepción: agrega patrones de preguntas
terminadas para revisión humana, pero no se incorpora al retrieval, prompt,
embeddings ni corpus de evidencia. Su contrato se documenta en
[`MEJORA_CONTINUA_RAG.md`](MEJORA_CONTINUA_RAG.md).

## Fuente de verdad y filtros obligatorios

La recuperación considera, en este orden, solo:

1. documentos activos y no eliminados;
2. su versión vigente con estado de ingesta `indexed`;
3. fragmentos derivados de esa versión;
4. asociaciones vigentes con módulos activos;
5. un módulo seleccionado explícitamente, si existe.

Un fragmento pertenece al documento y a su versión inmutable, nunca a un único
módulo. Así, un documento asociado a varios módulos conserva un solo vector y
el filtro de módulo se resuelve mediante `document_modules`.

## Ingesta durable

```text
PDF privado y versión inmutable
  -> trabajo durable con lease e intentos
  -> extracción por página
  -> OCR local selectivo para páginas con texto insuficiente
  -> normalización y segmentación estructural
  -> embeddings de 1536 dimensiones
  -> persistencia por lotes de chunks y vectores
  -> estado indexed solo cuando el trabajo termina de forma coherente
```

La cola es idempotente por versión y permite reintentos controlados. Un error
de OCR, extracción, vector o persistencia deja un estado reintentable; nunca
publica como indexado un contenido incompleto. El worker se mantiene apagado
por defecto (`RAG_INGESTION_WORKER_ENABLED=false`).

## Retrieval y decisiones de respuesta

La búsqueda combina similitud vectorial y texto completo. Su umbral inicial es
configurable y por defecto es `0.70`; el máximo de resultados también está
acotado. Con un módulo seleccionado, el filtro es duro. Sin selección, si la
evidencia no comparte un módulo común, el sistema devuelve una aclaración en
lugar de elegir un tema de manera arbitraria.

Hay tres resultados mutuamente excluyentes:

- `evidence`: se puede llamar al generador con los chunks recuperados.
- `ambiguous`: se persiste una aclaración y se registra la consulta no
  resuelta; el generador no se invoca.
- `no_evidence`: se persiste la falta de sustento y la consulta no resuelta;
  el generador no se invoca.

El proveedor de respuestas está encapsulado. En ejecución normal se requiere
una clave autorizada para el modelo configurado (`gpt-4o-mini` por defecto).
Si falta la clave o el proveedor falla, el API falla de forma segura: no crea
una respuesta extractiva o simulada que pudiera confundirse con una respuesta
normativa validada.

## Guardrails y fuentes

Los fragmentos son datos no confiables. El prompt los delimita explícitamente
y prohíbe seguir instrucciones encontradas en el propio documento, revelar
secretos, llamar herramientas o inventar hechos. La respuesta debe limitarse a
la evidencia entregada y referenciar sus posiciones.

Una respuesta de asistente se guarda solo después de terminar el streaming. En
la misma transacción un trigger revalida cada chunk citado contra el documento,
la versión actual e indexada y al menos un módulo activo no eliminado; si la
fuente se despublicó, reemplazó o desactivó durante la generación, toda la
finalización falla de forma atómica. Solo entonces se guardan instantáneas de
título, versión, página, sección, artículo/numeral y relevancia. Una
desconexión, fallo del proveedor o fuente revocada no persiste texto parcial ni
fuentes parciales.

## Chat e historial

NestJS es la frontera de autorización. `docente`, `admin` y `superadmin` usan
el chat autenticado mediante `POST /chat/stream`; el endpoint aplica límite de
consultas y emite SSE tipados (`conversation`, `sources`, `token`,
`clarification`, `no_evidence`, `done` o un error seguro). Las conversaciones
e historial están siempre acotados y se consultan solo por su propietario.

Next.js usa un BFF server-only: verifica la sesión y el rol del perfil antes de
reenviar el bearer a NestJS. La interfaz solo muestra eventos SSE, mensajes y
fuentes recibidos del API; no simula respuestas, citas ni resultados de RAG.

## Seguridad y verificación

- Las tablas de RAG, conversaciones y consultas no resueltas tienen RLS y
  revocaciones explícitas para `anon` y `authenticated`.
- Las RPCs de conversación se ejecutan bajo funciones con `search_path`
  vaciado y solo conceden ejecución a `service_role` del backend.
- Las entradas y respuestas se validan, tienen límites de longitud y los
  errores externos se sustituyen por mensajes seguros.
- La aceptación local se reproduce con
  `infrastructure/local/Test-LocalHito3Closure.ps1`: contratos pgTAP,
  asesores, cobertura API/Web, E2E, lint, tipos, build, auditoría de
  dependencias y revisión de diff. No usa una clave de proveedor ni despliega
  servicios remotos.

La evidencia local demuestra el contrato y sus guardas, pero no reemplaza una
calibración posterior con documentos aprobados, credenciales de proveedor
autorizadas y validación contractual en un ambiente remoto separado.

El runbook y gate de esta calibración están en
[`CALIBRACION_PRODUCCION_RAG.md`](CALIBRACION_PRODUCCION_RAG.md). No se activa
un worker ni se procesa información real hasta cumplirlos.
