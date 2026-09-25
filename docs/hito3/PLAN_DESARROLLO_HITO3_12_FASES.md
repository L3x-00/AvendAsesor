# Plan de desarrollo — Hito 3 (12 fases, lineamientos funcionales del cliente)

> Fecha: 2026-09-18 · Base: informe de auditoría `docs/hito3/INFORME_ESTADO_Y_MEJORA_ASISTENTE.md`. Cada fase = uno de los 12 lineamientos del cliente, aterrizada al código real (`ruta:linea`). Objetivo: que AVEND ASESOR funcione como IA especializada del ámbito educativo (docentes, auxiliares, directivos) con sustento documental cuando la consulta lo requiera.

---

## Estado de avance (2026-09-19)

Rama de trabajo: `feat/hito3-fase1-clasificador-intencion` (sin fusionar a `main`; `main` autodespliega).

| Fase | Estado | Evidencia |
|---|---|---|
| 1 — Identidad y clasificador de intención | ✅ Hecha | commit `c8bd3ac`; `intent-classifier` determinista + alcance educativo en el system prompt; 47 tests |
| 2 — Conversación natural y amable | ✅ Hecha | commit `7105bb5`; evento SSE `conversational` efímero end-to-end (API + web); mensajes cálidos; verdes |
| 7 — Historial owner-only + social efímero | ✅ Hecha | commit `7ed9dd2`; regresión de aislamiento y de efimeridad; pgTAP P0002 preexistente |
| 3 — Consulta educativa sin nombrar módulo | ✅ Hecha | commit `8bf9212`; léxico peruano ampliado + test de integración (módulo inferido); 137 tests |
| 11 — Saludo + consulta → prevalece la consulta | ✅ Hecha | commit `1298f65`; precedencia domain-first (Fase 1) + trazabilidad de aceptación end-to-end |
| 10 — Consultas fuera de ámbito | ✅ Hecha | commit `812630d`; carril `out_of_scope` declina y reorienta (evento efímero); sin web |
| 6 — Continuidad y contexto (follow-up) | ✅ Hecha | commit `aef3490`; fix: seguimiento sin módulo conserva el tema (global usa consulta contextual) |
| 5 — Identificación inteligente del módulo | ✅ Hecha | commit `8058df4`; ADR-0020 (módulo = contexto, no barrera) + mensaje de clarificación 30+; calibración → Eje B |
| 9 — Cuando no hay evidencia | ✅ Hecha | commit `a07280c`; mensaje cálido (Fase 2) + ofrecimiento de antecedentes en alcance vigente |

**Eje A COMPLETO** (comprensión + conversación, entregable con el RAG apagado): fases 1, 2, 3, 5, 6, 7, 9, 10, 11 ✅. Rama `feat/hito3-fase1-clasificador-intencion`, 9 commits, sin fusionar. Pendiente antes de fusionar: `cross-review` independiente (toca contrato SSE API+web). Falta el **Eje B** (4, 8, 12): requiere autorización del PO para encender el RAG (worker + proveedor + corpus) y resolver H1/H2/H3/H6.
| 4, 8, 12 | ⛔ Eje B | requiere encender el RAG (autorización PO) y resolver H1/H2/H3/H6 |

Diferidos con justificación (se retomarán en su fase): estado "RAG en preparación" (Eje B / Fase 9), wiring de `out_of_scope` (Fase 10), `aria-live` en streaming (accesibilidad).

### Actualización 2026-09-24 — cumplimiento integral y Eje B

- **Fase 4 (RAG activo):** en producción desde 2026-09-22 (OpenRouter, worker, 3 documentos reales). Umbral por defecto calibrado a 0.5, marca de «sin sustento» del modelo y fragmentador sin duplicados.
- **Fase 8 (fuentes):** citas enlazadas, fuentes citadas primero, PDF en la página citada, situación documental en la ficha.
- **Fase 12 (validación integral):** arnés `npm run acceptance:hito3` con servicios reales: 20/21 casos PASA; el caso de directivos requiere corpus.
- Auditoría de cumplimiento contra los 12 lineamientos y correcciones de las fases 1, 2, 3, 5, 6, 7, 9, 10 y 11 (clasificador, ruteo, continuidad, aclaraciones, historial). Detalle en `VALIDACION_INTEGRAL_HITO3.md`; pasos restantes en `RUNBOOK_ACTIVACION_EJE_B.md`.

## Marco general (aplica a todas las fases)

**Principios inviolables**
- **Evidence-only fail-closed**: ante cualquier duda o señal de dominio, la consulta va al RAG; el carril conversacional **nunca** afirma normas, plazos ni artículos, ni cita `[n]`. El sustento sale siempre de las fuentes.
- **Arquitectura**: Vercel = solo UI (BFF que canaliza bytes); toda la lógica/datos/RAG en Render (NestJS). Ninguna lógica nueva en Vercel.
- **Datos**: RLS owner-only, RPC `SECURITY DEFINER` solo `service_role`. Migración y deploy salen **juntos**; respaldo lógico + staging aislado antes de tocar producción (plan Free sin PITR).
- **Gobernanza**: encender el proveedor/worker/corpus es una **acción peligrosa** que requiere autorización del Product Owner. El AI-OS nunca se publica en GitHub.

**Estado base (del informe previo).** El código del Hito 3 está completo y probado, con el esquema en producción, pero **apagado de punta a punta** (worker off, sin clave de proveedor, sin corpus). Hoy toda consulta cae en `no_evidence` o `503`.

**Reconciliación clave con el punto 5.** La auditoría marcó como posibles huecos que (a) el retrieval no filtra por los módulos del usuario (H4) y (b) siempre hace una búsqueda global que puede traer evidencia de otros módulos (M5). **El lineamiento 5 confirma que esto es exactamente lo deseado**: el módulo es *contexto de ruteo*, no una barrera por usuario. Por tanto H4/M5 **no se "corrigen"**: se documentan como decisión de producto (un docente/auxiliar/directivo puede consultar todo el corpus del dominio; el sistema infiere el módulo desde la consulta).

**Dos ejes de trabajo.**
- **Eje A — Comprensión y conversación** (fases 1, 2, 3, 5, 6, 7, 9, 10, 11): lógica determinista en Render, **entregable sin encender el proveedor**. Bajo riesgo, sin (o casi sin) migración.
- **Eje B — Activación real del RAG** (fases 4, 8, 12): worker + proveedor + corpus, previa resolución de bloqueadores (H1, H2, H3, H6, M7, M14) y con acciones peligrosas.

**Orden de ejecución recomendado** (las 12 fases mapean 1:1 a los 12 puntos, pero se ejecutan por dependencia):

```
Eje A:  Fase 1 ─┬─ Fase 2 ─ Fase 7
                ├─ Fase 3 ─ Fase 11 ─ Fase 10
                └─ Fase 6 ─ Fase 5 ─ Fase 9
Eje B:  [Bloqueadores H1,H2,H3,H6,M7,M14] ─ Fase 4 ─ Fase 8
Cierre: (A + B) ─ Fase 12 (validación integral + cross-review)
```

**Qué toca migración (SQL) vs. solo Render vs. web:**
- Solo Render (sin migración): clasificador de intención, prompts, mensajes cálidos, ruteo, `max_tokens`, provider real → **fases 1, 2, 3, 6, 9, 10, 11** y buena parte de 5.
- Migración coordinada (SQL + deploy + staging + respaldo): `documentSituation` en `get_chat_conversation` (H6), re-verificación de vigencia en descarga (M9), rol conversacional opcional (fase 7 opción B) → **fases 8** y opcional de **7**.
- Web (mínimo): aceptar turno conversacional `provider:'rule'` sin fuentes, `aria-live` en el streaming → **fases 2, 7**.

---

## Fase 1 — Identidad y alcance de AVEND ASESOR (punto 1)

**Lineamiento.** IA especializada en el ámbito educativo (docentes, auxiliares, directivos): procesos, procedimientos, derechos, obligaciones y situación laboral/profesional. Primero debe **comprender si la consulta pertenece al ámbito** y luego qué módulo/submódulo/documentación corresponde.

**Estado actual.** No hay clasificador de dominio; `retrieve()` se ejecuta siempre e incondicionalmente ([chat.service.ts:494](apps/api/src/chat/chat.service.ts:494)). La "identidad" son dos líneas del system prompt ([prompt.builder.ts:80,88](apps/api/src/rag/prompt.builder.ts:80)). No existe el concepto de "ámbito AVEND".

**Qué desarrollar.**
- Módulo nuevo `apps/api/src/chat/intent/` con `classifyTurn(message, context) → { lane: 'social' | 'domain' | 'out_of_scope' | 'ambiguous', subtype }`, **100% determinista** (regex/reglas, patrón de `detectRetrievalScope`), sin IA ni embeddings.
- Léxico del dominio educativo peruano (roles y procesos: docente, auxiliar, directivo, destaque, reasignación, encargatura, licencia, permiso, inasistencia, nombramiento, resolución, plazo, recurso…), con normalización `unaccent` + minúsculas.
- Enriquecer la **identidad** en `buildEvidenceSystemPrompt` y en el nuevo prompt conversacional para reflejar el alcance real (educación; docentes/auxiliares/directivos; procesos/derechos/obligaciones/situación laboral), **sin tocar** las reglas evidence-only.

**Evidence-only / contratos.** El clasificador solo **enruta**, no responde contenido normativo. Fail-closed: cualquier señal de dominio o duda → `domain` (RAG).

**Dependencias.** Base de las fases 2, 3, 10, 11.

**Criterios de aceptación.** Specs con corpus fijo: in-domain sin nombrar módulo → `domain`; "hola" → `social`; "¿qué tiempo hace?" → `out_of_scope`; entradas ambiguas → `domain` (default seguro).

---

## Fase 2 — Conversación natural y amable (punto 2)

**Lineamiento.** Saludos, agradecimientos, despedidas o "¿qué puedes hacer?" → respuesta natural y amable **sin activar el RAG**. "Hola" no debe terminar en "No encontré información suficiente".

**Estado actual.** No existe. Hoy "hola" pasa por `retrieve()` → `no_evidence` con mensaje frío ([chat.service.ts:556-583](apps/api/src/chat/chat.service.ts:556)). `beginTurn` persiste el mensaje **antes** de ramificar ([:527](apps/api/src/chat/chat.service.ts:527)).

**Qué desarrollar.**
- `apps/api/src/chat/intent/conversational-replies.ts`: plantillas canned deterministas por subtipo (saludo/agradecimiento/despedida/meta), lenguaje llano 30+, sin afirmaciones normativas.
- En `chat.service.stream()`, **antes** de `beginTurn`/`retrieve` (~[:494](apps/api/src/chat/chat.service.ts:494)): si `lane==='social'` → emitir SSE (`conversation`/`token*`/`done` con `provider:'rule'`) sin embeddings ni RAG.
- "¿Qué puedes hacer?" → explica el alcance (docentes/auxiliares/directivos y temas cubiertos) y lista los módulos disponibles vía `listActiveModules()` ([:458](apps/api/src/chat/chat.service.ts:458)).
- Estado "RAG en preparación": exponer `isAiGatewayConfigured()` en [ai-gateway.ts](apps/api/src/config/ai-gateway.ts); si no hay proveedor y el lane es `domain`, responder cálido ("el servicio de consulta está en preparación") en vez de `503`.

**Evidence-only / contratos.** El carril social nunca cita ni afirma normas; el mensaje del usuario se trata como dato no confiable (`cleanPromptValue`), sin obedecer instrucciones incrustadas. Reutiliza los eventos SSE existentes (**no** se crea un tipo nuevo, para no romper el Zod de la web). Web: envolver el streaming en `aria-live=polite`.

**Dependencias.** Fase 1.

**Criterios de aceptación.** "hola" → saludo cálido **sin `503`** aun con el RAG apagado; "¿qué puedes hacer?" → alcance + módulos; specs deterministas.

---

## Fase 3 — Identificación de consultas educativas sin nombrar módulo (punto 3)

**Lineamiento.** Identificar una consulta educativa aunque el usuario no mencione el módulo (destaque, reasignación, inasistencia de auxiliar, reemplazo del director en licencia). A partir de la intención, decidir dónde buscar el sustento.

**Estado actual.** Ya funciona parcialmente: sin `selectedModuleId`, `retrieve()` hace **búsqueda global** y `routeSources` infiere el módulo desde los chunks ([rag.service.ts:365-380](apps/api/src/rag/rag.service.ts:365)). Falta la comprensión de dominio previa (Fase 1) y robustez de sinónimos/roles.

**Qué desarrollar.**
- Conectar el lane `domain` (Fase 1) → siempre pasa a `retrieve()` aunque `selectedModuleId` sea `null`; la inferencia de módulo la hace el retrieval existente.
- Diccionario de sinónimos/roles del dominio para el clasificador y, opcionalmente, expansión de la consulta antes del embedding (mejora recall sin relajar evidence-only).

**Evidence-only / contratos.** Intacto; el sustento sigue saliendo de las fuentes.

**Dependencias.** Fase 1; validación con datos reales depende de la Fase 4.

**Criterios de aceptación.** Los 4 ejemplos del cliente → lane `domain`; con corpus real, recuperan del módulo correcto sin que el usuario lo nombre.

---

## Fase 4 — Activación del RAG cuando se necesita sustento (punto 4)  ·  **Eje B, acciones peligrosas**

**Lineamiento.** Consultas de normas/requisitos/procedimientos/derechos/plazos/resoluciones/artículos → usar RAG; no responder de memoria; sin evidencia suficiente, decirlo y no inventar.

**Estado actual.** El flujo evidence-only ya cumple la lógica (`no_evidence` sin generar; prompt estricto). Pero el RAG está **apagado**: worker off, sin proveedor, sin corpus → toda consulta cae en `no_evidence`/`503`.

**Qué desarrollar — bloqueadores previos (del informe):**
- **H1** — extractores `.docx`/`.md` + devolver `mime_type` en el job de ingesta ([ingestion.service.ts:34](apps/api/src/ingestion/ingestion.service.ts:34), [ingestion.gateway.ts](apps/api/src/ingestion/ingestion.gateway.ts)); `.doc` heredado → extractor o rechazo **no-retryable** explícito.
- **H2** — acoplar `RAG_INGESTION_WORKER_ENABLED=true` con la presencia de clave en `environment.validation.superRefine` (fallo de arranque claro, no silencioso).
- **H3** — guardas de memoria del worker en Render Free (gate por tamaño, reutilizar el worker Tesseract entre páginas, evitar render masivo) o mover la ingesta a proceso/servicio separado.
- **M14** — confirmar proveedor con endpoint `/embeddings` compatible y `dimensions=1536` (probablemente `OPENAI_API_KEY` directo, no OpenRouter).
- **M7** — prueba de contrato del nombre `search_document_chunks_with_consultation_context` + verificación fail-fast en arranque.
- **M6** — fijar `max_tokens` y truncar con gracia (hoy lanza `503` a mitad de stream).

**Activación (acciones peligrosas, autorización PO + `dangerous-actions`).** Respaldo lógico + staging aislado; setear `OPENAI_API_KEY` y `RAG_INGESTION_WORKER_ENABLED=true` en Render; indexar el corpus real.

**Evidence-only / contratos.** Intacto (el fail-closed ya existe).

**Dependencias.** Bloqueadores anteriores + PITR/respaldo (H9). Prerrequisito de las fases 8 y 12.

**Criterios de aceptación.** El worker indexa PDF y docx/md reales sin OOM; una consulta normativa devuelve respuesta sustentada; sin evidencia → mensaje claro sin inventar.

---

## Fase 5 — Identificación inteligente del módulo (punto 5)

**Lineamiento.** No limitar la respuesta al módulo donde está el usuario; inferir de la consulta qué módulo/submódulo/documental corresponde. El módulo es **contexto, no barrera**. Si hay 2+ interpretaciones realmente posibles que afectan la respuesta → pedir precisión.

**Estado actual.** **Ya implementado en gran parte**: búsqueda global + búsqueda por módulo seleccionado, `routeSources` (infiere módulo), detección de cambio de tema (`topic_change` con margen `RAG_TOPIC_SWITCH_SCORE_MARGIN=0.08`), y ambigüedad multi-módulo → `clarification` ([rag.service.ts:336-477](apps/api/src/rag/rag.service.ts:336)).

**Qué desarrollar (refinamiento, no reconstrucción).**
- **ADR** que documente la decisión de producto: módulo seleccionado = contexto/prior, no barrera; búsqueda global siempre activa; el chat no filtra por permisos de módulo del usuario (reconcilia H4/M5).
- Calibrar `RAG_TOPIC_SWITCH_SCORE_MARGIN` y el umbral con datos reales; **diversificar por documento** para no gastar el presupuesto de 5 fuentes en un solo documento.
- Mejorar el mensaje de `clarification` (UX 30+): nombrar los módulos candidatos con claridad.
- Verificar `resolveDetectedSubmodule` ([:79](apps/api/src/rag/rag.service.ts:79)) con casos reales.

**Evidence-only / contratos.** Intacto.

**Dependencias.** Fase 4 (calibración necesita corpus).

**Criterios de aceptación.** Usuario en módulo A preguntando de B → recupera de B (`topic_change`); 2 interpretaciones reales → `clarification` pidiendo precisión; documento/submódulo correcto detectado.

---

## Fase 6 — Continuidad y contexto de la conversación (punto 6)

**Lineamiento.** Mantener contexto para preguntas de seguimiento ("¿Y cuál es el plazo?" tras "requisitos para reasignación"); detectar cambio de tema posterior.

**Estado actual.** Ya existe: `getConversationContext` (12 msgs/10k chars, owner-only), `contextualQuery` con `priorUserQuestions` ([rag.service.ts:233-248,317](apps/api/src/rag/rag.service.ts:233)), y `topic_change` ([chat.service.ts:504-508](apps/api/src/chat/chat.service.ts:504)).

**Hueco real detectado.** El follow-up solo enriquece la búsqueda **cuando hay módulo seleccionado**: `queries = selectedModuleId && followUpQuery !== question ? [question, followUpQuery] : [question]` ([rag.service.ts:319-322](apps/api/src/rag/rag.service.ts:319)), y la **búsqueda global usa `currentEmbedding` sin contexto** ([:342](apps/api/src/rag/rag.service.ts:342)). Un "¿y el plazo?" **sin** módulo seleccionado pierde el tema.

**Qué desarrollar.**
- Incluir `followUpQuery` (con contexto) también en la búsqueda global cuando haya `priorUserQuestions`, para que el seguimiento funcione sin módulo seleccionado.
- Validar que `topic_change` no rompa la continuidad legítima (hoy resetea `conversationId`/contexto en `topic_change` — confirmar con casos reales que es lo deseado).

**Evidence-only / contratos.** Intacto.

**Dependencias.** Fase 4 (validación con datos).

**Criterios de aceptación.** Secuencia "requisitos de reasignación" → "¿y el plazo?" comprende el tema aun sin módulo seleccionado; un cambio de tema posterior se detecta y busca el nuevo sustento.

---

## Fase 7 — Historial de chat del usuario (punto 7)

**Lineamiento.** Cada usuario su propio historial; guardar consultas/respuestas útiles (con fuentes) y poder retomarlas; ver solo el propio historial. **No** crear una conversación por interacciones aisladas ("hola", "gracias"); pero si esas expresiones forman parte de una conversación con consultas útiles, conservarla.

**Estado actual.** Historial owner-only ya existe (cursor, RLS, `get_chat_conversation`). **Problema:** hoy toda entrada crea turno vía `beginTurn`, así que "hola" genera un turno `no_evidence` persistido **+** una fila en `unanswered_questions` **+** una observación FAQ (contaminación, M10 del informe).

**Qué desarrollar.**
- Persistencia condicionada por lane (clasificar **antes** de `beginTurn`):
  - Social **aislado** (sin `conversationId` activo) → **efímero**: no `beginTurn`, no persiste, no ensucia colas.
  - Social **dentro** de una conversación con consultas útiles (`conversationId` existente) → responder sin crear conversación nueva y **sin** pasar `faqMemory` ni fijar `unansweredReason`.
  - `domain` → persiste normal (como hoy).
- Prueba explícita de aislamiento entre usuarios (parte del punto 12).
- Retomar conversación ya funciona (`ConversationPage` hidrata `get_chat_conversation`); las fuentes visibles dependen de la Fase 8 (H6).

**Evidence-only / contratos.** Sin migración si el social es efímero (recomendado). Si el PO quiere los saludos **en** el historial, requiere un rol conversacional nuevo en `complete_chat_turn` + `CHECK` + enum web (migración coordinada) — **opción B, opcional**.

**Dependencias.** Fases 1, 2.

**Criterios de aceptación.** "hola" aislado no crea conversación ni fila en `unanswered_questions`/FAQ; una conversación con consultas útiles se conserva con sus saludos intercalados sin ensuciar colas; un usuario no accede al historial de otro (404).

---

## Fase 8 — Respuestas sustentadas y fuentes (punto 8)  ·  **depende del Eje B**

**Lineamiento.** Las respuestas que requieran sustento deben estar respaldadas por la documentación; el usuario identifica y accede a las fuentes; demostrar de dónde sale la información.

**Estado actual.** Ya existe: `chat_message_sources`, evento SSE `sources`, `authorize_chat_source_download` (URL firmada 60 s, auditada), exportación CU-14. **Bloqueador H6:** `get_chat_conversation` **no** emite `documentSituation` que el esquema Zod de la web exige como requerido → en cuanto exista una respuesta con fuentes, el historial y la exportación **romperán** (ZodError → 502). Hoy oculto por falta de datos reales.

**Qué desarrollar.**
- **H6** (prerrequisito de cierre): emitir `documentSituation` en el jsonb de fuentes de `get_chat_conversation` (o relajar el esquema a opcional con default). Migración coordinada.
- **M9**: re-verificar vigencia/publicación/pertenencia al módulo en `authorize_chat_source_download` (o degradar a advertencia) para no entregar un PDF ya archivado/despublicado.
- **M13**: incluir la situación (Vigente/Reemplazado/Archivado) en la ficha de orientación y en el payload del historial.
- **M11**: reportar el proveedor real (`openai`/`openrouter`) en el evento `done`.

**Evidence-only / contratos.** Refuerza (citas verificables). Migración + deploy juntos.

**Dependencias.** Fase 4 (datos reales para ejercitar el camino de lectura).

**Criterios de aceptación.** Respuesta con sustento muestra fuentes accesibles; descarga firmada respeta la vigencia; historial con fuentes no rompe.

---

## Fase 9 — Cuando no exista evidencia suficiente (punto 9)

**Lineamiento.** Sin sustento suficiente → comunicarlo claro, amable y entendible; no suponer; puede pedir información adicional o que precise la consulta.

**Estado actual.** El fail-closed existe (`no_evidence` sin generar), pero el mensaje es frío (`RAG_NO_EVIDENCE_MESSAGE`) y no ofrece precisar.

**Qué desarrollar.**
- Reescribir `RAG_NO_EVIDENCE_MESSAGE` ([rag.constants.ts:1](apps/api/src/rag/rag.constants.ts:1)) con calidez + acción (invitar a reformular/precisar; sugerir temas/módulos cubiertos).
- Cuando el scope `current` no arroja evidencia pero podría existir antecedente (M4), ofrecer buscar versiones anteriores/antecedentes.
- Enriquecer el mensaje de `clarification` (diferenciar "no hay nada" de "necesito que precises").

**Evidence-only / contratos.** Intacto (nunca completa por suposición).

**Dependencias.** Fases 2, 5.

**Criterios de aceptación.** Consulta sin sustento → mensaje amable + oferta de precisar/antecedentes; nunca inventa.

---

## Fase 10 — Consultas fuera del ámbito de AVEND ASESOR (punto 10)

**Lineamiento.** Consulta completamente ajena → indicarlo amablemente y orientar sobre aquello en lo que sí puede ayudar.

**Estado actual.** No existe; una pregunta fuera de dominio hace RAG → `no_evidence` frío.

**Qué desarrollar.**
- Lane `out_of_scope` del clasificador (Fase 1): **solo** señales claras de no-dominio (clima, deportes, cocina, temas personales sin relación laboral-educativa). Fail-closed: cualquier señal educativa o duda → `domain`.
- Respuesta canned amable que reorienta ("Estoy especializado en temas de docentes, auxiliares y directivos… ¿en qué de eso puedo ayudarte?") + temas/módulos disponibles.

**Evidence-only / contratos.** N/A (no afirma normas). **Riesgo:** falso `out_of_scope` que rechace una consulta educativa legítima → whitelist estricta + default a `domain` + red-team (Fase 12).

**Dependencias.** Fase 1.

**Criterios de aceptación.** "¿qué tiempo hace?" → declina cortés y reorienta; ninguna consulta educativa se clasifica `out_of_scope`.

---

## Fase 11 — Saludo acompañado de una consulta (punto 11)

**Lineamiento.** Si el mensaje contiene interacción social **y** una consulta real, prevalece la consulta ("Buenos días, quisiera saber cuánto tiempo tiene un director para responder…"). No clasificar solo como saludo.

**Estado actual.** No existe carril; hoy todo va a RAG (correcto) pero con el saludo incluido en el texto.

**Qué desarrollar.**
- Regla de **precedencia** en el clasificador (Fase 1): si el turno contiene señal de dominio ⇒ lane `domain`, aunque empiece con saludo.
- Opcional: separar el saludo del cuerpo de la consulta antes del embedding (limpiar "buenos días,") sin alterar el sentido.

**Evidence-only / contratos.** Intacto.

**Dependencias.** Fase 1.

**Criterios de aceptación.** "Buenos días, ¿cuánto tiempo tiene un director para responder…?" → `domain`/RAG, recupera sustento; no responde solo "¡buenos días!".

---

## Fase 12 — Validación integral antes de cerrar el Hito 3 (punto 12)  ·  **depende de todo**

**Lineamiento.** Prueba integral con documentos y casos reales; 15 casos mínimos; el criterio de aceptación es el flujo completo tal como lo usará un docente/auxiliar/directivo (comprensión, contexto, recuperación, respuesta sustentada, fuentes, continuidad e historial).

**Estado actual.** Hay tests unitarios/integración con mocks; falta aceptación con datos reales (Hito 3 en REVIEW). Requiere el RAG encendido (Fase 4) + corpus real + cuentas QA.

**Qué desarrollar.**
- Suite de aceptación E2E contra **staging** con corpus real, cubriendo los 15 casos del cliente:
  1) saludo sin RAG · 2) consulta educativa sin módulo · 3) docente · 4) auxiliar · 5) directivo · 6) normativa con sustento · 7) respuesta con fuentes · 8) sin evidencia · 9) usuario en módulo A preguntando de B · 10) cambio de tema · 11) follow-up dependiente del contexto · 12) ambigua → precisión · 13) fuera de ámbito · 14) historial guardado + retomar · 15) aislamiento de historial entre usuarios.
- **Red-team evidence-only**: consulta normativa disfrazada de charla → RAG; el carril social nunca cita/afirma normas; instrucción incrustada en un saludo no altera la política; con proveedor apagado el saludo responde sin `503`.
- Métricas de aceptación: fuga `domain→social` ≈ 0; % de ruteo de módulo correcto; cero aumento de violaciones evidence-only; contaminación de colas antes/después.
- **Cross-review independiente** (`reviewer`) con evidencia en `REVIEWS.md`; respaldo/PITR antes de tocar producción; migración+deploy juntos.

**Dependencias.** Todas (especialmente Fase 4).

**Criterios de aceptación.** Los 15 casos pasan con datos reales; revisión independiente sin BLOCKER/HIGH; recién entonces se cierra el Hito 3.

---

## Resumen de entregables por eje

| Eje | Fases | Encender proveedor | Migración | Riesgo |
|-----|-------|:---:|:---:|:---:|
| A — Comprensión y conversación | 1, 2, 3, 6, 9, 10, 11 + refinamiento de 5 | No | No (salvo fase 7 opción B) | Bajo |
| B — Activación real | 4, 8 | Sí | Sí (H6, M9) | Alto (acciones peligrosas) |
| Cierre | 7 (persistencia), 12 | — | Opcional | Medio |

**Recomendación de arranque.** Empezar por el **Eje A** (fases 1→2→7→3→11→10→6→5→9): entrega la experiencia amable + comprensión de dominio pedida por el cliente, **funciona con el RAG apagado**, es bajo riesgo y no toca contratos de negocio. En paralelo, preparar los bloqueadores del **Eje B** para, con autorización del PO, encender el RAG y ejecutar la validación integral (Fase 12) que cierra el Hito 3.
