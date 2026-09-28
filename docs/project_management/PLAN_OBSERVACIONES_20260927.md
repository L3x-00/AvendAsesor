# Plan de corrección y desarrollo — Observaciones del Product Owner (2026-09-27)

- Rama de trabajo: `feat/observaciones-rag-asesor-20260927` (creada desde `origin/main` @ `ff38877`, PR #71).
- Rama de Claude Code preservada sin tocar: `feat/hito4-pendientes` @ `842fc8e` (ya fusionado vía PR #71; su TSK-0066 — costo real de IA, filtros/paginación de auditoría, índice del aviso al docente, buscador del historial — quedó planificado pero sin commits ni migraciones).
- Alcance de este plan: 34 observaciones del PO sobre RAG/chat, historial, voz, panel de usuarios, módulos, consultas y reportes, gestión documental y anexos.
- Regla de convivencia: no tocar las áreas reclamadas por TSK-0066 sin coordinación (ver §8).

---

## 1. Resumen ejecutivo

Las observaciones se organizan en **10 bloques de trabajo (B0–B9)** y **7 fases de ejecución (F0–F6)**.

Dos cambios de fondo, que requieren decisión explícita del PO y ADR:

1. **RAG de doble carril**: respuestas sustentadas con citas verificables (carril *grounded*) y respuestas de orientación generadas por IA cuando no hay documentos o sustento (carril *advisory*), claramente etiquetadas, sin inventar normas ni cifras.
2. **Citas verificables estilo Justina.IA**: cada referencia como etiqueta cliqueable posterior al punto, individual por aseveración, con tipo de documento abreviado (RM, M, RD…) y artículo/numeral cuando existan.

El resto son correcciones funcionales y UX de alta demanda: historial por módulo con última pregunta, voz/audio, contraseñas y vigencias rápidas, permisos por módulo con casillas, panel de consultas/reportes separado y orientado a resolución, contadores reales de documentos, versiones con año y reemplazo/complemento, y anexos por submódulo.

**Camino crítico**: evidencia de las pruebas recientes (producción no accesible desde esta sesión) → arnés de evaluación → contrato de citas → doble carril → migraciones (con autorización del PO) → paneles → anexos → cierre con cross-review.

---

## 2. Estado verificado (evidencia)

### 2.1 PRs fusionados recientes (#61–#71) y qué resolvieron

| PR | Rama | Qué entregó | Relación con las nuevas observaciones |
| --- | --- | --- | --- |
| #71 | `fix/hito4-responsive-admin` | Admin responsive 375/768 px, UUID de cualquier versión, validación por criterio | Base actual de `origin/main` |
| #70 | `feat/hito4-auditoria-modulos` | Auditoría de módulos; migraciones `20260927100000/100` aplicadas en prod | Actividad auditada legible (base para contadores) |
| #69 | `feat/hito4-consultas-no-resueltas` | Ciclo de consultas sin sustento: grupos por tema, cargar documento, cierre en bloque, aviso al docente | Antecedente directo de O-21/O-22/O-24/O-25 |
| #68 | `feat/chat-panorama-temas` | Panorama por tema con resumen IA y tolerancia a errores de escritura | Tolerancia ortográfica parcial (solo módulos/títulos) |
| #67 | `feat/chat-voz-asesor-identidad` | Dictado por voz con causa real; identidad unificada del chat | Base del bloque de voz (O-11) |
| #66 | `feat/chat-catalogo-documentos` | «¿De qué tienes información?» lista documentos y preguntas recomendadas | Debe ajustarse para no listar cuando no hay documentos (O-05/O-13) |
| #65 | `feat/ux-chat-profesional` | Chat estilo asistente profesional, referencias plegables | Base visual de citas (O-01/O-08) |
| #64 | `feat/ux-historial-eliminar` | Historial en lenguaje llano; eliminar en dos pasos | Historial de documentos, no de chat |
| #63 | `feat/ux-conexion-documentos` | Aviso sin conexión, inicios honestos, biblioteca minimalista | — |
| #62 | `feat/ux-panel-docente` | Errores amables, bienvenida, historial y perfil docente | Saludo por nombre (falta por rol, O-07) |
| #61 | `feat/ux-observaciones-cliente` | Sesión, feedback, «pensando», voz y guía | Antecedente de reportes (O-26) |
| #58 | `feat/hito3-cumplimiento-cliente` | 12 lineamientos Hito 3: evidence-only, fuentes atómicas, SSE, ambigüedad | Contrato vigente del RAG que este plan evoluciona |

### 2.2 Hallazgos de código (estado actual por área)

**Generación y citas**
- El prompt exige citar con `[n]` y «cada cita por separado: [1][2]» (`apps/api/src/rag/prompt.builder.ts:81-98`), pero no hay post-proceso: el parser acepta grupos `[1, 2]`/`[1-3]` (`apps/api/src/rag/citations.ts:6-45`) y la UI los muestra agrupados (`apps/web/src/components/chat/chat-panel.tsx:212-257`).
- No existe fraseo guiado «Según el artículo 49, numeral 5.2»: artículo/numeral viajan al prompt y a la fuente, pero el texto lo decide el modelo sin validación.
- El tipo de documento (RM/M) no viaja a la respuesta ni a la fuente: `ChatSource` no lo incluye (`apps/api/src/chat/chat.service.ts:94-109`), aunque sí existe `documents.document_type` con etiquetas largas (`apps/web/src/lib/admin-api/document-taxonomy.ts:1-19`).
- Los chunks ya extraen artículo y numeral (`apps/api/src/ingestion/chunking.service.ts:62,166-178`) y el retrieval los devuelve (`apps/api/src/rag/retrieval.gateway.ts:12-31`).

**Sin evidencia y asesor**
- Mensaje literal «No encontré sustento suficiente…» (`apps/api/src/rag/rag.constants.ts:1-2`); al cerrar sin evidencia se añade cobertura por temas (`chat.service.ts:1042-1079`). No hay respuesta de orientación generada por IA ni sugerencias accionables.
- El catálogo lista hasta 25 documentos y el panorama hasta 8 (`apps/api/src/chat/catalog/chat-catalog.service.ts:347-390,211-261`); con cero documentos responde un texto fijo. El usuario final no debería ver «no hay documentos» ni inventarios vacíos.

**Alcance y manipulación**
- Clasificador `social/domain/out_of_scope` con fail-closed (`apps/api/src/chat/intent/intent-classifier.ts:383-473`); fuera de ámbito tiene respuesta canned (`conversational-replies.ts:62-63`).
- **No hay carril anti-manipulación**: «ignora tus instrucciones…» cae a `domain` y pasa al RAG; solo defienden el prompt endurecido y el throttle de 10/min. No existe respuesta amigable de límite.

**Historial**
- Título = primera pregunta (255 chars) en `begin_chat_turn`; el listado agrupa solo por fecha (`apps/web/src/components/chat/chat-history-list.tsx:39-46,244-248`); `selected_module_id` se guarda pero no se usa para agrupar; no hay submódulo ni «última pregunta».

**Voz/audio**
- Dictado del navegador (`SpeechRecognition`, `es-PE` → `es-ES`), una frase por activación (`chat-panel.tsx:689-760`); errores mapeados con causa real (403-420). No existe transcripción server-side ni soporte de audio como mensaje: el endpoint de chat acepta solo JSON (`apps/api/src/chat/dto/stream-chat.dto.ts:4-17`) y el composer no tiene adjuntos. El error de audio reportado requiere reproducción en la URL indicada (ver §4, G6).

**Usuarios**
- Alta invita por correo (no define contraseña); «Editar acceso» ya permite rol Docente/Administrador/Superadministrador y estado, con motivo (`users-manager.tsx:133-190`, `actions.ts:677-682`).
- No hay: restablecer contraseña desde admin, vigencias rápidas 3/6 meses (solo fechas), iconos ver/editar/eliminar, ni casillas por módulo. `admin_module_permissions` es **un solo booleano global** (`supabase/migrations/20260903110000_...sql`).

**Módulos**
- El modal de creación existe; el botón «+ Crear módulo/submódulo» está en la esquina derecha de la barra, junto a la búsqueda (`apps/web/src/components/admin/modules-explorer.tsx:443-470`). O-20 pide la esquina opuesta (u otra ubicación inequívoca).

**Consultas y reportes**
- Página única `admin/operations`: dashboard con indicadores y rankings, grupos «¿Qué documentación falta?», filtros de periodo solo `today|week|month` (`apps/api/src/consultation-cases/dto/consultation-period-query.dto.ts:4`).
- «Ver caso» lleva a `/admin/operations/[caseId]` con pregunta, respuesta, fuentes y documentos vinculados; el documento faltante vive agregado en el grupo, no por caso.
- El cierre es un select de estado + nota dentro del detalle; «Cerrar N consultas» es un `<details>` bajo la tarjeta (`unanswered-groups.tsx:158-226`).
- «Agregar documento» desde el caso solo permite **vincular existente** o ir a Módulos; no hay carga con módulo/submódulo.
- «Reportar respuesta» es un botón de texto «Reportar» (no banderita) con modal y motivos ya existentes (`consultation-feedback.tsx:385-402,436-535`).

**Documentos**
- Situación `current/replaced/archived` **es lógica real** y el retrieval la respeta (`20260903123000_rag_document_situation.sql:111-114,273-287`): archivar/reemplazar sí saca del RAG vigente.
- No hay contadores de apertura/descarga ni última descarga; solo eventos de auditoría (`document_audit_events.action='download_url_generated'`).
- Subir nueva versión solo pide archivo y **complementa** (conserva versiones); no pide año ni distingue reemplazo.
- Motivos de archivo sin explicación entre paréntesis (`document-taxonomy.ts:55-71`); el formulario de asociación ya va debajo de la lista (verificar en UI móvil).
- **Defecto confirmado (no reportado por el PO)**: `document_versions_file_size_bytes_check` limita a 20 971 520 bytes (20 MiB) —verificado con `pg_constraint` en la base local— mientras la API acepta 50 MiB (`apps/api/src/documents/pdf-inspection.service.ts:13`) y el bucket se amplió a 50 MiB (`20260910120000`). Toda carga de 20–50 MiB fallaría al persistir. Debe entrar en la fase de datos (T6.4).

**Anexos / jefatura docente**
- No existe modelo de anexos por submódulo; `ANEXO` y `CRONOGRAMA` son valores de `documents.document_type` (`document-taxonomy.ts:14`). El patrón pedido (cronograma, normativa, anexos, preguntas frecuentes con acciones anuales) es organización de contenido + metadatos, no un módulo nuevo obligatoriamente.

### 2.3 Estado de datos en producción (leído vía CLI)

- Migraciones locales y remotas pareadas hasta `20260927100100`.
- `admin_module_permissions`: booleano global por administrador.
- Periodos de consultas: solo hoy/semana/mes en RPC y DTO.
- Sin columnas de contadores, sin año de versión, sin relación complemento/anexo.

### 2.4 Evidencia recibida (2026-09-27) e Incidente RAG-01

El PO aportó la transcripción de las pruebas con rol ADMINISTRADOR: **todas las consultas de dominio fallan** con «Esta consulta no se completó por un problema técnico» / «La respuesta se interrumpió antes de terminar…» (contrato docente ×9, AIP ×2). No hay ninguna respuesta generada. El audio reportado sigue sin reproducirse.

Diagnóstico realizado desde esta sesión:
- El API de producción responde `200` en `/health` y `/health/ready`; el Supabase remoto está pareado hasta `20260927100100`.
- La clave OpenRouter de `apps/api/.env.staging.local` responde `200` en `/chat/completions` (`gpt-4o-mini`) y `/embeddings` (`text-embedding-3-small`, 1536); saldo restante ≈ USD 1.62, así que el proveedor no está agotado para esa clave.
- El turno se crea (la pregunta queda guardada) y luego el cierre falla: el usuario ve el aviso genérico y el caso queda como `technical_error` con código `CHAT_STREAM_FAILED` en la cola administrativa.
- Descartado en código: las RPC de inicio/cierre existen y aceptan las dos formas de `quality_signals`; los 5 fallos de la prueba pgTAP local son interferencia de los datos demo (esperan 1 caso y hay 9), no una regresión.
- Puntos que pueden lanzar el fallo después de crear el turno: generación del proveedor (`OpenAiAnswerGateway`), validación del ruteo de la respuesta (`private.validate_consultation_answer_routing`) y cierre del turno.

Hipótesis principal: **configuración del proveedor en Render** para esta instancia (clave distinta a la local, vencida, modelo alterado o variable ausente) o error del proveedor al generar. No descartable: validación de ruteo con datos reales.

Acciones inmediatas:
1. **Implementado (pendiente de despliegue, sin commitear aún)**: el fallo se clasifica y persiste con código seguro para administración — `AI_PROVIDER_AUTH`, `AI_PROVIDER_CREDITS`, `AI_PROVIDER_MODEL_NOT_FOUND`, `AI_PROVIDER_RATE_LIMIT`, `AI_PROVIDER_UNAVAILABLE`, `AI_PROVIDER_TIMEOUT`, `AI_PROVIDER_UNREACHABLE`, `AI_GATEWAY_NOT_CONFIGURED`; la persona sigue viendo el mensaje genérico (`apps/api/src/rag/ai-provider-failure.ts`, `chat.controller.ts`, pruebas 17/17).
2. **PO**: revisar en Render (servicio `avend-asesor-api`) que `OPENROUTER_API_KEY` sigue presente y es válida, que `RAG_ANSWER_MODEL` no esté alterado, y los *Logs* del error en la hora de las pruebas.
3. **Tarea T0.5**: sonda del proveedor en `GET /admin/rag/readiness` para que el panel muestre «proveedor OK / causa» sin abrir Render.
4. Tras desplegar (autorización del PO), repetir una consulta: el código clasificado cierra la causa raíz.

Límite restante: el CLI de Supabase lista migraciones pero no lee filas de producción desde esta sesión; la conversación `0219b4dd-9399-4f19-9b21-79860a8ce58c` no se pudo inspeccionar.

---

## 3. Principios de arquitectura (RAG v2)

1. **Evidencia primero, dos carriles explícitos.** Carril *grounded*: solo corpus, con citas verificables. Carril *advisory*: orientación general de IA, etiquetada como «Orientación general (sin cita normativa)», prohibido inventar normas, artículos, cifras o plazos; se recomiendan fuentes oficiales (SUNEDU, MINEDU, DRE/UGEL) y se registra el hueco para el administrador.
2. **Citas individuales y verificables.** Una etiqueta cliqueable por referencia, ligada a su aseveración, después del punto; nunca grupos ambiguos `[2, 4]`. Formato: `[RM N° 123-2024-MINEDU, Art. 49, num. 5.2]` → etiqueta corta `[1]` con tarjeta de fuente.
3. **Fraseo con referencia explícita** cuando la fuente tiene artículo/numeral o número de norma, validado por post-proceso (si la fuente lo declara, la respuesta debe nombrarlo).
4. **Límites amables y firmes**: fuera de ámbito educativo y cualquier intento de vulnerar el sistema responden con mensajes fijos revisados, sin revelar instrucciones, configuración ni documentos internos.
5. **Nada queda sin trazabilidad administrativa**: cada respuesta sin sustento o con orientación general genera/actualiza un caso o alerta visible para el administrador («falta documento», «tema sin cobertura»).
6. **Medir antes de cambiar**: arnés de evaluación con golden set y red-team; métricas de citas correctas, afirmaciones sin sustento, rechazos correctos y resistencia a inyección.
7. **UX para 30+**: texto ≥16 px, objetivos táctiles ≥44 px, etiquetas explícitas, sin interacción dependiente de hover, feedback visible, copy en español llano.
8. **Seguridad y datos**: migraciones forward-only; código y migración se aplican juntos (lección ADR-0019); producción solo con autorización del PO; permisos se validan en servidor, no solo en UI.

---

## 4. Decisiones pendientes del Product Owner (gates)

| Gate | Decisión | Bloquea |
| --- | --- | --- |
| G1 | Aprobar el doble carril (advisory) y su etiquetado; redacción de la política de «no inventar normas». Requiere ADR-0021. | B2, F2 |
| G2 | Semántica de «eliminar usuario»: suspender + anonimizar (recomendado, conserva auditoría) vs borrado con Supabase Auth. | B5, F4 |
| G3 | Notas de voz: transcripción server-side (costo por audio, clave de proveedor) vs mantener solo dictado del navegador con mejores mensajes. | B4, F1/F2 |
| G4 | Permisos por módulo: aplican a todo administrador o solo a nuevos; ¿herencia a submódulos?; ¿vigencias por módulo? Requiere ADR-0022. | B5, F3 |
| G5 | Anexos/FAQ: confirmar módulos reales («Jefatura docente», «Reasignación») y si los anexos son documentos del corpus o contenido aparte. | B8, F5 |
| G6 | Evidencia: transcripción recibida (2026-09-27). Falta: verificación de la configuración del proveedor en Render por el PO (ver Incidente RAG-01), reproducción del error de audio, y autorización para el reindexado pendiente (TSK-0053: 3 documentos) y la calibración `RAG_MATCH_THRESHOLD=0.5`. | B0, F0 |

---

## 5. Bloques de trabajo

Convenciones: **P0** imprescindible para el objetivo del PO, **P1** importante, **P2** mejora. Tamaño S (< medio día), M (1–2 días), L (3–5 días), XL (> semana, dividir antes de empezar). «Migración» indica si requiere migración nueva.

### B0 — Evidencia, arnés de evaluación y red-team (habilitador)

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T0.1 | Obtener la evidencia de las pruebas recientes (transcripción o acceso read-only) y catalogar defectos observados | `.ai-shared/coordination/` (local) | No | G6 | 20+ casos reales documentados con pregunta/respuesta esperada | P0 | S |
| T0.2 | Arnés de evaluación RAG ejecutable en local/staging (script + golden set JSON) | `apps/api/test/` (nuevo `rag-eval/`) | No | T0.1 | `npm run rag:eval` produce métricas por caso | P0 | M |
| T0.3 | Set de red-team: manipulación, extracción de prompt, fuera de ámbito, datos internos | `apps/api/test/` + clasificador | No | T0.1 | 100 % de casos bloqueados con mensaje amable | P0 | M |
| T0.4 | Registrar carril de cada respuesta (`grounded`/`advisory`/`refusal`) y motivo en métricas admin | `apps/api/src/chat/`, migración menor | Sí | G1 | Cada respuesta consultable por carril en el panel | P1 | M |
| T0.5 | Sonda del proveedor de IA en `GET /admin/rag/readiness` (llamada mínima con timeout y caché; código de causa) | `apps/api/src/rag-admin/`, `ai-provider-failure.ts` | No | T0.1 | El panel distingue «proveedor OK» de la causa exacta | P0 | M |
| T0.6 | Desplegar el build de diagnóstico (Incidente RAG-01) con autorización del PO y repetir las pruebas | `chat.controller.ts`, `ai-provider-failure.ts` | No | PO | Cada fallo aparece con su causa en la cola administrativa | P0 | S |

### B1 — Contrato de respuesta, citas y tipos documentales (RAG core)

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1.1 | Post-procesador determinista de citas: dividir `[1, 2]`→`[1][2]`, validar contra fuentes reales, descartar índices inválidos | `apps/api/src/rag/citations.ts` + specs | No | B0 | Tests: 0 grupos en salida; 0 citas a índices inexistentes | P0 | M |
| T1.2 | Tipo documental y número en el contrato de fuente (RM, RV, RD, DS, M, Ley…) con abreviatura y nombre corto | RPC de retrieval, `chat.service.ts`, `types.ts`, `chat_message_sources` | Sí | T1.1 | Fuente y cita muestran `RM N° …` / `M N° …` | P0 | L |
| T1.3 | Fraseo guiado «Según el Art. 49, num. 5.2 de la RM …» + validación de coincidencia artículo/numeral | `prompt.builder.ts` + post-check | No | T1.1/T1.2 | Si la fuente declara artículo, la respuesta lo nombra; evaluación B0 lo verifica | P0 | M |
| T1.4 | UI de citas cliqueables estilo Justina.IA: etiqueta tras el punto, tarjeta de fuente, descarga a página | `chat-panel.tsx`, `chat-sources.tsx`, CSS | No | T1.1/T1.2 | Cada cita navega a su fuente individual | P0 | L |
| T1.5 | Estilo de respuesta resumido y amable: resumen inicial breve, bloques, «Sugerencias» al final | Prompt + límites de longitud | No | G1 | Respuestas ≤ ~300 palabras con estructura fija | P1 | S |

### B2 — Asistente asesor: carriles, alcance y naturalidad

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T2.1 | ADR-0021 y diseño del doble carril (activación, etiquetado, prohibiciones, costos) | `.ai-shared/memory/decisions/`, docs | No | G1 | ADR aprobado | P0 | S |
| T2.2 | Implementar carril advisory (gateway OpenRouter existente; prompt propio; sin citas de corpus; máx. tokens; disclaimer) | `apps/api/src/rag/`, `chat.service.ts` | Sí (T0.4) | T2.1 | Respuesta etiquetada «Orientación general», sin normas inventadas | P0 | L |
| T2.3 | Reescribir mensajes sin evidencia: nunca «no hay sustento»; sugerencias accionables y enlaces oficiales | `rag.constants.ts`, `chat.service.ts` | No | T2.2 | 0 ocurrencias del texto prohibido en respuestas y tests | P0 | M |
| T2.4 | Módulo/submódulo sin documentos: no exponer vacío al docente; responder como asesor; registrar hueco para admin | `chat-catalog.service.ts`, `chat.service.ts` | No | T2.2 | Docente recibe orientación; admin ve el tema sin cobertura | P0 | M |
| T2.5 | Carril anti-manipulación y fuera de ámbito: patrones + respuesta fija amable; jamás revelar sistema internos | `intent-classifier.ts`, `conversational-replies.ts` | No | T0.3 | Red-team 100 % bloqueado; «chaufa» responde con límite amable | P0 | M |
| T2.6 | Saludo e identidad por rol (docente/admin/superadmin) y por nombre | `chat.service.ts`, `chat-welcome.tsx` | No | — | Saludo diferenciado verificado en los tres roles | P1 | S |
| T2.7 | Naturalidad: normalización ortográfica para retrieval y catálogo, sinónimos de abreviaturas, intención «descargar documento que menciona X» | `topic-match.ts`, `rag.service.ts`, `intent-classifier.ts` | No | T1.2 | Golden set de lenguaje informal pasa ≥90 % | P1 | L |
| T2.8 | Submódulo sin cobertura: registrar alerta agregada para el administrador (sin exponerla al docente) | `consultation-cases` (alertas automáticas) | No | T2.4 | Cada hueco aparece en «¿Qué documentación falta?» | P1 | M |

### B3 — Historial de chat

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T3.1 | Guardar y mostrar la última pregunta (título/subtítulo) sin perder la primera para trazabilidad | `begin_chat_turn`, `chat-history-list.tsx` | Sí | — | Historial muestra la última consulta por conversación | P1 | M |
| T3.2 | Agrupar por módulo/submódulo; consultas libres bajo «Consultas generales» | RPC de listado + UI | Sí | T3.1 | Agrupación visible por módulo y submódulo | P1 | M |
| T3.3 | Snapshot de nombre de módulo/submódulo en la conversación (robusto a renombres) | migración | Sí | T3.2 | Nombres correctos aunque el módulo cambie de nombre | P2 | S |

### B4 — Voz y audio

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T4.1 | Reproducir y diagnosticar el error de audio en la conversación reportada (navegador, permiso, red, o intento de adjuntar audio) | reproducción con el PO | No | G6 | Causa raíz documentada con pasos | P0 | S |
| T4.2 | Decisión e implementación según G3: notas de voz (MediaRecorder → transcripción server-side) o dictado mejorado (continuo, reintentos, mensajes) | `chat-panel.tsx`, API de transcripción | Sí | G3 | Enviar audio se traduce en consulta o mensaje claro de alternativa | P1 | L |
| T4.3 | Accesibilidad y errores del VoicePill (aria-live, foco, reduce-motion) | `voice-pill.tsx`, CSS | No | T4.2 | axe sin hallazgos; errores anunciados | P2 | S |

### B5 — Usuarios y accesos (panel)

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T5.1 | Vigencias rápidas 3/6/12 meses + fecha manual y resumen («vence el …») | `users-manager.tsx`, `actions.ts` | No | — | Un clic fija la vigencia y se anuncia | P0 | S |
| T5.2 | Restablecer contraseña desde admin (enlace de recuperación; nunca mostrar contraseñas) | API usuarios + UI | Sí (auditoría) | G2 | Acción auditada; el usuario recibe correo | P0 | M |
| T5.3 | Acciones por fila con iconos: ver (ojo), editar (lápiz), eliminar/suspender (tacho) con confirmación | `users-manager.tsx` | No | G2 | Tres acciones accesibles con etiqueta textual | P1 | M |
| T5.4 | Permisos por módulo/submódulo con casillas y habilitar/inhabilitar; enforcement en servidor | `admin_module_permissions` → nueva tabla/RPC; panel | Sí | G4 | Administrador sin permiso no accede a la sección/módulo (probado por API) | P0 | XL |

### B6 — Módulos y gestión documental

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T6.1 | Reubicar «+ Crear módulo/submódulo» a la esquina opuesta, separado de la búsqueda | `modules-explorer.tsx`, CSS | No | — | Botón inequívoco en escritorio y móvil | P1 | S |
| T6.2 | Contadores reales: veces abierto, veces descargado y fecha de última descarga (derivados de auditoría, con RPC agregada) | migración + `document-library-view`, ficha | Sí | — | Números cuadran con `document_audit_events` (prueba) | P0 | L |
| T6.3 | Nueva versión: pedir año y elegir «reemplaza» o «complementa»; UI e historial coherentes | modelo + RPC + UI | Sí | — | Versionado distinguible y auditable | P0 | L |
| T6.4 | Corregir CHECK `file_size_bytes` a 50 MiB (defecto real confirmado) | migración | Sí | — | Carga de 25–50 MiB persiste y se verifica en pgTAP | P0 | S |
| T6.5 | Motivos de desactivación con explicación entre paréntesis + copy comprensible de «Gestión de documentos» | `document-taxonomy.ts`, textos del panel | No | — | Cada motivo explica su efecto; glosario inline | P1 | S |
| T6.6 | Al abrir archivar/desactivar: resaltar el campo de motivo (pulso + foco + aria) | `document-situation-actions.tsx`, CSS | No | — | El usuario identifica el campo sin ayuda | P1 | S |
| T6.7 | Confirmar CTA de asociación bajo la lista en todas las vistas (documento y caso) y en móvil | `document-edit-section`, `case detail` | No | — | Formulario siempre debajo de la lista | P2 | S |
| T6.8 | Comunicar el efecto real de situación: «excluido de respuestas vigentes, disponible como antecedente histórico»; verificar restauración | UI de situación + docs | No | — | Texto claro; prueba de retrieval por scope | P1 | S |

### B7 — Consultas y reportes (operaciones)

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T7.1 | Separar «Consultar» (bandeja en vivo) de «Reportes» (análisis/export) | rutas `admin/operations` | No | — | Dos vistas con propósito claro | P0 | L |
| T7.2 | Filtros 6 h / 24 h / 7 d / 30 d / rango; extender periodo en RPC y DTO | RPC + DTO + UI | Sí | T7.1 | Filtros funcionan y respetan zona horaria | P0 | M |
| T7.3 | Dashboard operativo con KPIs y accesos rápidos (sin recargar) | `operations/page.tsx` | No | T7.2 | Carga útil < 2 s con datos demo | P1 | M |
| T7.4 | «Ver caso» orientado a resolución: preguntas del docente, respuesta IA, fuentes, documento faltante sugerido y mejoras | detalle de caso | No | T2.8 | Admin identifica qué subir en < 1 min | P0 | M |
| T7.5 | Cierre de consulta en pantalla/modal dedicado (no bajo la tarjeta), con resultado, nota y verificación | UI + PATCH | No | — | Cierre completo sin desplegar tarjetas | P0 | M |
| T7.6 | Carga de documento desde el caso con módulo/submódulo preseleccionado, auto-asociación y vínculo al caso | API documentos + caso | Sí (vínculo) | T6.3 | Un flujo sube, asocia y vincula | P0 | L |
| T7.7 | Agrupar reportes por módulo | RPC de listado + UI | No | T7.1 | Agrupación navegable | P1 | S |
| T7.8 | «Reportar respuesta» → banderita roja + modal interactivo (motivo explicado, comentario, captura) | `consultation-feedback.tsx` | No | — | Reporte en ≤3 pasos, accesible | P1 | M |

### B8 — Anexos, cronograma y preguntas frecuentes (Jefatura docente / Reasignación)

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T8.1 | Diseñar secciones estándar por submódulo (Normativa, Cronograma, Anexos, Preguntas frecuentes) basadas en tipo documental | diseño + docs | No | G5 | Secciones visibles al entrar al submódulo | P1 | M |
| T8.2 | Anexos numerados y visibles en primera pantalla con acciones rápidas (nueva versión anual, año, archivar) | UI submódulo + metadato número | Sí | T8.1 | Anexo del año cargado en < 1 min | P1 | L |
| T8.3 | Preguntas frecuentes curadas por módulo con acciones fáciles | modelo/UI | Sí | G5 | FAQ editable y visible para el docente | P2 | M |
| T8.4 | Aplicar plantilla a «Jefatura docente» y «Reasignación» según módulos reales | datos/UI | No | G5 | Ambos módulos ordenados y verificados | P2 | M |

### B9 — Arquitectura transversal, seguridad y release

| ID | Tarea | Archivos/área | Migración | Depende | Criterio de aceptación | P | Tamaño |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T9.1 | ADRs: 0021 doble carril, 0022 permisos por módulo, 0023 contadores, 0024 versión reemplazo/complemento, 0025 secciones/anexos | `.ai-shared/memory/decisions/` | No | G1/G4/G5 | ADRs aprobados antes de implementar | P0 | S |
| T9.2 | Ensayo de migraciones en staging aislado y aplicación a producción con autorización (código y migración juntos) | `supabase/migrations`, runbook | Sí | PO | Sin ventana de caída; historia pareada | P0 | M |
| T9.3 | Panel de calidad RAG: carriles, señales ya existentes, costo real de IA (coordinar con TSK-0066) | `admin/operations`, `rag-admin` | No | T0.4 | Métricas visibles para el admin | P1 | M |
| T9.4 | Verificación final por fase + cross-review independiente + memoria + release | todo | — | todas | Sin BLOCKER/HIGH abiertos; DoD §9 | P0 | M |

---

## 6. Roadmap por fases

| Fase | Contenido | Gate de entrada | Salida verificable |
| --- | --- | --- | --- |
| **F0. Habilitadora** | B0 + G6 + cierre del Incidente RAG-01 (causa raíz identificada con códigos de diagnóstico) + reproducción del audio + reindexado/calibración pendiente | Evidencia y autorización PO | Fallo total corregido y verificado; golden set + arnés |
| **F1. Quick wins sin migración** | T2.3 (copia), T2.5, T2.6, T3.3 (UI), T6.1, T6.5, T6.6, T6.7, T7.3, T7.8 | F0 | PR pequeño, solo web/API sin DB |
| **F2. RAG core** | B1 completo + T2.1/T2.2/T2.4/T2.7/T2.8 + T1.5 | G1 + F0 | Golden set y red-team en verde; citas verificables |
| **F3. Datos** | T6.4, T6.2, T6.3, T5.4, T7.2/T7.6, T0.4, B3 migraciones | G2/G4 + autorización de migración | Migraciones aplicadas con staging pareado |
| **F4. Paneles** | B5 (T5.1–T5.3), B7 (T7.1, T7.4, T7.5, T7.7), B6 UI restante | F1 + F3 | Flujo docente reporta → admin resuelve → cierre |
| **F5. Anexos** | B8 | G5 | Jefatura/Reasignación ordenados |
| **F6. Cierre** | B9 + verificación + cross-review + memoria | F2–F5 | Release autorizado |

Regla permanente: cada fase termina con lint/typecheck/pruebas, actualización de `ACTIVE_TASKS.md` y memoria cuando haya decisiones durables. Producción (migración + deploy) solo con autorización explícita del PO.

---

## 7. Matriz de trazabilidad observación → bloque

| Obs. | Descripción breve | Bloque/Tarea |
| --- | --- | --- |
| O-01 | Citas individuales [1][2], no agrupadas | T1.1, T1.4 |
| O-02 | «Según el artículo 49…» con número | T1.3 |
| O-03 | Sin información: llamar a una IA | T2.2 |
| O-04 | Fuera de tema con límite amable | T2.5 |
| O-05 | Submódulo sin documentos: no exponer vacío | T2.4, T2.8 |
| O-06 | Separar referencias por información | T1.1, T1.4 |
| O-07 | Saludo por rol | T2.6 |
| O-08 | Citas cliqueables estilo Justina.IA tras el punto | T1.4 |
| O-09 | No decir «no hay sustento»; sugerir (SUNEDU) | T2.3 |
| O-10 | Abreviaturas RM, M, etc. | T1.2 |
| O-11 | Error al enviar audio | T4.1, T4.2 |
| O-12 | Respuestas resumidas y amigables | T1.5 |
| O-13 | No listar documentos al usuario final | T2.4 |
| O-14 | Preguntas para vulnerar: límite amable | T2.5, T0.3 |
| O-15 | Conversación natural, errores ortográficos, descargas | T2.7 |
| O-16 | Historial: última pregunta y agrupación | B3 |
| O-17 | Facilitar la vida del maestro | Transversal (todos) |
| O-18 | Contraseña + vigencias 3/6 meses | T5.1, T5.2 |
| O-19 | Promover admin/superadmin con ojo/lápiz/tacho y casillas por módulo | T5.3, T5.4 |
| O-20 | Botón «Crear» en la otra esquina | T6.1 |
| O-21 | Consultas/reportes simple, motivo falta documento, 6 h/24 h, dashboard, diferenciar | T7.1, T7.2, T7.3, T7.4 |
| O-22 | «Ver caso» con preguntas, documento faltante y respuesta IA | T7.4 |
| O-23 | Cerrar consulta en pantalla propia | T7.5 |
| O-24 | Agregar documento desde el caso con módulo/submódulo | T7.6 |
| O-25 | Reportes por módulo; auto-asociar documento | T7.6, T7.7 |
| O-26 | Reportar respuesta con banderita roja + modal | T7.8 |
| O-27 | Contadores reales apertura/descarga y última descarga | T6.2 |
| O-28 | Nueva versión: año y reemplazo/complemento | T6.3 |
| O-29 | Resaltar campo al archivar/desactivar | T6.6 |
| O-30 | Asociación debajo, no arriba | T6.7 |
| O-31 | Vigencias reales, antecedente histórico sin alimentar el RAG, motivos explicados | T6.5, T6.8 |
| O-32 | Semántica de nuevas versiones (no reemplaza a ciegas) | T6.3 |
| O-33 | Anexos/cronograma/FAQ por submódulo con acciones fáciles | B8 |
| O-34 | Mejores prácticas, desarrollo ordenado | Este plan + B9 |

---

## 8. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El modo advisory cambia el invariante evidence-only del Hito 3 | Alto (producto/legal) | ADR-0021, etiqueta visible, prohibición de normas/cifras inventadas, trazabilidad admin, aprobación PO |
| Alucinación normativa en modo orientativo | Alto | Golden set y red-team bloqueantes; «Solicita revisión al administrador» en lugar de afirmar |
| Costos y límites del plan Free de Render (llamadas IA extra) | Medio | Presupuesto por consulta, límite de tokens, caché de orientaciones frecuentes, alertas |
| Auto-deploy de `main` con migraciones | Alto | Código y migración juntos; staging primero; ADR-0019; autorización PO |
| Superficie de seguridad de permisos por módulo | Alto | Enforcement en API/RPC, pruebas de denegación, auditoría de cambios |
| Cruce con TSK-0066 (Claude Code) | Medio | Coordinación en `ACTIVE_TASKS.md`; no tocar sus áreas sin aviso |
| Evidencia de producción no accesible | Medio | Gate G6; mientras tanto, golden set basado en código y observaciones del PO |

---

## 9. Verificación y Definition of Done

- Cada fase: `npm run lint`, `npm run typecheck`, pruebas API/web verdes, pgTAP si hay migración, build de producción.
- RAG: arnés B0 ejecutado antes y después de cada cambio; sin regresión de citas ni de rechazos.
- Migraciones: ensayo en staging aislado, historia local/remota pareada, verificación con `service_role` cuando aplique (lección TSK-0051).
- Cross-review independiente en cambios de contrato, seguridad o datos; BLOCKER/HIGH corregidos y reverificados.
- Accesibilidad: axe/teclado en superficies tocadas; texto ≥16 px; objetivos ≥44 px.
- Memoria y coordinación actualizadas; reporte corto por fase.

---

## 10. Primeros pasos (Sprint 0)

1. Solicitar al PO la evidencia (G6): transcripción de las pruebas recientes o acceso de lectura a producción, y pasos exactos del error de audio en `https://avend-asesor-web.vercel.app/chat/0219b4dd-9399-4f19-9b21-79860a8ce58e`.
2. Confirmar decisiones G1–G5 (o autorizar el diseño propuesto con ADR).
3. Construir el arnés y el golden set (T0.2/T0.3) con los casos conocidos: preguntas fuera de ámbito, sin evidencia, con artículos, con errores ortográficos, multi-turno y manipulación.
4. Ejecutar F1 (quick wins sin migración) mientras se aprueban los ADR.

---

## 11. Observaciones originales ordenadas y plan de auditoría (2026-09-28)

Esta sección conserva la intención del Product Owner y es la lista de aceptación para auditar lo entregado en los PR #72–#85. Las secciones 1–10 describen el plan inicial del 27 de septiembre y contienen estados históricos: ninguna afirmación de «pendiente» o «completado» allí sustituye la verificación actual. Una implementación solo se marca conforme si se comprueba el comportamiento, la autorización correspondiente y la experiencia del docente y del administrador. El trabajo sin commit en `fix/auditoria-observaciones-20260928` se preserva y se revisa antes de integrarlo.

### 11.1 Requisitos agrupados en cuatro bloques

| Bloque y responsable de auditoría | Observaciones que debe verificar | Resultado esperado |
| --- | --- | --- |
| **A. Respuestas del asesor y seguridad — Codex** | O-01 a O-10, O-12 a O-15, O-17; T0.2/T0.3/T0.5; T1.1–T1.5; T2.1–T2.8. Revisar las pruebas RAG con rol Administrador y las respuestas realmente emitidas. | Respuesta breve, natural y amable, con saludo acorde al rol; citas individuales, cliqueables y junto a cada afirmación después del punto; artículo/numeral, número y abreviatura correctos cuando la fuente los tenga. Si falta sustento, orientación general de IA identificada como tal, sugerencia oficial útil y aviso administrativo, sin fingir una cita. Sin inventarios vacíos al docente, revelación de instrucciones internas ni respuestas ajenas al ámbito educativo. Seguimiento de conversación, errores ortográficos, sinónimos y solicitud de un documento mencionado. Diagnóstico visible al administrador si falla el proveedor. |
| **B. Chat, voz y ciclo de consultas — Codex** | O-11, O-16, O-21 a O-26; B3, B4 y B7. | Historial con la última pregunta, agrupado por módulo/submódulo y con chat libre aparte. Dictado o envío de audio funcional, o error reproducido y resuelto con alternativa clara. Consultas y Reportes con objetivos distintos, periodos 6 h/24 h y filtros útiles; caso con preguntas, respuesta IA, fuentes y necesidad documental; cierre en pantalla propia; carga desde el caso en su tema, vinculación comprobada; reportes por módulo. Bandera roja que abre un modal accesible de motivo. |
| **C. Usuarios, permisos y módulos — Claude Code** | O-18 a O-20; B5, T6.1 y permisos de documentos vinculados a T5.4. | Enlace seguro de contraseña; vigencias rápidas de 3 y 6 meses; promoción controlada de rol, ver/editar/suspender con confirmación, habilitar/inhabilitar y casillas por módulo/submódulo. Un administrador sin concesión debe ser denegado por el servidor también en documentos. Botón Crear en la esquina opuesta de la barra según el pedido, comprobado en escritorio y móvil. |
| **D. Gestión documental y contenido por tema — Claude Code** | O-27 a O-33; B6 salvo T6.1, B8. | Aperturas/descargas y fecha de última descarga reales; nueva versión con año y relación reemplaza/complementa; campo de motivo claramente resaltado; asociación debajo de la lista; estados de vigencia con efecto real en retrieval y acceso histórico claro, motivos explicados. Normativa, cronograma, anexos numerados y preguntas frecuentes por submódulo, visibles y fáciles de actualizar, verificando Jefatura docente y Reasignación con datos reales. |

La frase final de la observación sobre versiones («un documento no reemplaz…») quedó incompleta. Se conserva como requisito de no reemplazar automáticamente: el autor elige explícitamente *reemplaza* o *complementa* y la auditoría comprueba el efecto de cada opción. Si el Product Owner precisa otra regla de vigencia, se incorpora sin inferirla.

### 11.2 Orden de ejecución y coordinación

1. **Inventario y evidencia.** Comparar cada fila anterior con el plan, PRs fusionados, rama actual, pruebas RAG del Administrador, migraciones y estado real de producción. Registrar por requisito: conforme, parcial, falla o sin evidencia, con enlace a prueba. El documento de planificación no constituye prueba de aceptación.
2. **División de trabajo.** Codex toma A y B. Claude Code toma C y D mediante encargos verificables y sin editar simultáneamente los archivos de Codex. `ACTIVE_TASKS.md` registra que Claude ya inició TSK-0068; primero recuperar su progreso, resultados y archivos reclamados. Si su ejecución no puede confirmarse, no atribuirle auditoría ni correcciones. Mantener un auditor distinto del implementador final de cada cambio importante.
3. **Corrección.** Priorizar fallas que impidan consultar, citas erróneas, fuga de información, permisos y pérdida de integridad. Corregir después los incumplimientos de flujo y presentación. Preservar el trabajo sin commit de T2.7 y cualquier cambio ajeno. No usar datos o respuestas simuladas como evidencia de producción.
4. **Verificación.** Pruebas focales y de integración para RAG, seguridad, autorización, versiones y casos; pruebas de accesibilidad y pantalla cuando corresponda; suite, tipos, lint y build. Repetir la auditoría sobre la revisión integrada. Las migraciones y el despliegue deben comprobarse por separado del éxito local.
5. **Entrega.** Registrar hallazgos y correcciones en esta matriz, commits solo de producto, push, PR y fusión a `main` después de gates reales. Dejar el repositorio central y la coordinación sin trabajo inconcluso ni ramas activas asumidas como entregadas. Reportar cualquier requisito que dependa de una decisión del Product Owner o de acceso no disponible.

### 11.3 Criterio para cerrar cada bloque

| Bloque | Evidencia mínima de cierre |
| --- | --- |
| A | Casos reales del Administrador y conjunto adversarial; citas cotejadas con fuentes; orientación y límites probados; fallo del proveedor clasificable. |
| B | Recorrido docente → reporte/caso → administrador → documento → cierre; historial y audio probados en navegador o causa concreta documentada. |
| C | Pruebas de concesión y denegación por rol/módulo en API de módulos y documentos, más flujo de usuarios accesible. |
| D | Conteos cotejados con eventos, versiones y estados contra datos/RPC; organización y acciones de ambos temas reales revisadas en pantalla. |

### 11.4 Resultado de la auditoría local del 28 de septiembre

**Alcance de la evidencia:** los PR #72–#85 estaban en `main=fd2eb49` al iniciar. Claude Code ejecutó la auditoría de nueve áreas `wf_e992e97f-80b`, pero agotó su límite antes de implementar correcciones. Codex continuó los cuatro bloques, con revisión independiente de los cambios de chat y operaciones. Los cambios de esta sección están en `fix/auditoria-observaciones-20260928`: la conformidad local no acredita todavía migración, despliegue, datos productivos ni recorrido visual autenticado. El audio (O-11) fue confirmado resuelto por el Product Owner.

| Obs. | Estado local | Evidencia y límite concreto |
| --- | --- | --- |
| O-01 | Corregido | Normalización de citas y pruebas `citation-format`; las etiquetas se asignan por afirmación. Falta cotejo con respuestas reales del Administrador. |
| O-02 | Corregido | Prompt y formato de cita conservan artículo/numeral y número cuando la fuente los ofrece; pruebas `prompt.builder`. |
| O-03 | Corregido | El carril orientativo invoca el proveedor al faltar evidencia y se persiste como `no_evidence`, compatible con la RPC; `chat.service.compliance`. |
| O-04 | Corregido | Cocina se clasifica fuera de ámbito con límite amable; `intent-classifier`. |
| O-05 | Corregido | El submódulo vacío usa orientación sin anunciar ausencia de archivos al docente; `chat.service`. |
| O-06 | Corregido | Separación y validación de índices en citas; `citation-format` y render de fuentes. |
| O-07 | Existente; verificación parcial | Saludo por rol en respuesta; falta sesión real de cada rol para comprobar tono. |
| O-08 | Corregido | Citas junto a la afirmación y etiquetas cliqueables, incluso en el historial; `chat-sources` y `chat-panel`. |
| O-09 | Corregido | El texto al docente evita «no hay sustento» y ofrece orientación o consulta a entidades oficiales; no simula fuente. |
| O-10 | Existente | Mapeo de tipos documentales y abreviaturas RM/M en RAG; pruebas de `document-type`. |
| O-11 | Resuelto por PO | El Product Owner confirmó que el error de audio ya está resuelto; no se modificó esa ruta. |
| O-12 | Verificación parcial | Prompt de respuesta breve y sugerencias más concisas; falta evaluar una muestra de respuestas reales. |
| O-13 | Corregido | Sin evidencia se omite el inventario documental en la respuesta al docente. |
| O-14 | Corregido | Clasificador evita revelar reglas del sistema y distingue «reglas internas del colegio» como consulta educativa; pruebas de intención. |
| O-15 | Parcial | Normalización de errores comunes y sinónimos; «descargar el primer documento» recupera el tema de la respuesta previa antes de buscar. Citas descargables desde fuentes; falta recorrido conversacional autenticado para otras referencias vagas. |
| O-16 | Corregido local; migración pendiente | Historial agrupa por módulo y última pregunta. Migración `20260928010000` repara la fecha y última pregunta históricas; aplicada solo en BD local. |
| O-17 | Criterio transversal | Se comprobó respuesta orientativa y acceso a caso/documento; requiere validación de uso por docentes. |
| O-18 | Corregido | Enlace seguro de contraseña y atajos 3/6 meses; cálculo de meses corregido para fin de mes. |
| O-19 | Corregido local; migración pendiente | Roles, acciones con etiquetas, confirmación y casillas; API de módulos y documentos verifica concesiones. |
| O-20 | Corregido | «Crear módulo» se movió al extremo opuesto del buscador; falta comprobación visual en móvil. |
| O-21 | Corregido | Consultar y Reportes separados, 6 h/24 h, indicadores y motivo de incidencia; DTO ahora admite esos periodos. |
| O-22 | Corregido | Ver caso muestra pregunta/respuesta del incidente, fuentes, motivo, sugerencia de documento y hasta 100 preguntas previas del mismo chat. |
| O-23 | Corregido | Cierre individual y grupal en pantallas propias; el grupo exige resultado y nota, con relectura del servidor. |
| O-24 | Corregido | Carga desde el caso envía `moduleIds` y `specificDependency`, permite elegir submódulo y vincula el documento. |
| O-25 | Corregido | Reportes de docentes agrupados por módulo en la página visible; carga desde el caso usa la ruta seleccionada. El conteo por módulo indica que corresponde a la página, no al total. |
| O-26 | Corregido | Bandera roja y modal de motivo; disponible desde la primera respuesta, con prueba de interfaz. |
| O-27 | Existente | RPC de eventos reales de apertura/descarga y fecha final; ficha documental y pruebas de `usage`. |
| O-28 | Corregido local; migración pendiente | Año y relación explícita reemplaza/complementa; el RAG puede usar base aprobada y complemento aprobado sin tratarlo como sustitución. |
| O-29 | Existente | Al archivar/desactivar se enfoca y resalta el motivo; prueba `document-situation-actions`. |
| O-30 | Existente | Asociación de documentos se muestra bajo la lista; pendiente recorrido visual autenticado. |
| O-31 | Corregido local; migración pendiente | Situación/vigencia gobierna retrieval; histórico separado. Motivos explicados en el formulario y concesión mantiene gestión de módulo inactivo. |
| O-32 | Corregido local; migración pendiente | La cadena de versiones distingue reemplazo de complemento y restringe evidencia a versiones aprobadas. |
| O-33 | Parcial | Secciones Normativa/Cronograma/Anexos/FAQ y anexos numerados existen; CHECK de FAQ corregido localmente. En producción no existe un módulo llamado «Jefatura docente» y «Reasignación docente» tiene cero documentos vinculados: falta cargar/ordenar contenido real y verificarlo con sesión autenticada. |
| O-34 | En curso | Auditoría, pruebas y revisión documentadas; falta cerrar migración/despliegue, PR y contraste funcional productivo. |

**Pruebas de esta auditoría:** API 1046/1048 inicialmente, con dos expectativas obsoletas actualizadas y 31/31 focales posteriores; cumplimiento 43/43; gateway/casos/chat/documentos 79/79; seguimiento de descarga 43/43; API E2E 31/31 tras actualizar dos contratos de autorización y aislar readiness de la configuración local; web 589/589 con un trabajador; typecheck API/web, lint API `src` y web sin errores, build API/web; pgTAP focal 32/32 y asesor de seguridad local sin hallazgos de nivel error. La ejecución web paralela agotó memoria y se repitió correctamente en serie. La suite API completa no se repitió tras actualizar únicamente esas dos expectativas y pruebas focales: el resto había pasado. El lint global de API incluye un archivo temporal de aceptación ignorado y por eso se validó `src` por separado.

**Gates pendientes para entrega productiva:** las seis migraciones se aplicaron y confirmaron en staging `scepelftmjlabepygrri` el 28 de septiembre; `migration list --linked` mostró las seis versiones pareadas. El PR #86 pasó `validate` y Vercel. Antes de producción falta un respaldo recuperable del proyecto `blxrdotroysitfyehmqw` (la consulta de backups devolvió `pitr_enabled:false, backups:[]`), autorización específica para el riesgo de migración, aplicación de migraciones antes del despliegue de código que llama a nuevas RPC y recorridos autenticados de docente/administrador. La CLI permanece enlazada a staging. Las seis migraciones siguen pendientes en producción; no fusionar el PR mientras persista esta dependencia.

### 11.5 Respuestas reales observadas antes de esta corrección

La lectura de solo consulta sobre la base productiva enlazada identificó 13 conversaciones de rol `admin`, 5 de `docente` y 10 de `superadmin`. En una conversación reciente del Administrador (27 de septiembre) se observó: una respuesta con citas agrupadas `[1][4]` y `[2][5]`; varios seguimientos como «quiero descargarlos» y «quiero descargar el primer documento» terminaron en `no_evidence`, anunciaron «No encontré sustento suficiente» y enumeraron categorías de documentos. El Administrador sí había recibido antes una respuesta con fuentes sobre cargos y plazas. Estos ejemplos confirman O-01/O-06/O-09/O-13/O-15 como fallas reales de la versión previa, no solo riesgos teóricos. La corrección actual tiene pruebas locales, pero aún no se ha observado desplegada en esas conversaciones.

La huella de lectura del destino enlazado `blxrdotroysitfyehmqw` fue: 45 módulos no eliminados, 3 documentos no eliminados y 28 conversaciones; una ruta «Reasignación docente» activa con cero documentos asociados y ninguna ruta cuyo nombre contenga «Jefatura». Son datos de contexto para el gate de publicación y una brecha de contenido independiente del código. No se hicieron escrituras en la base remota.
