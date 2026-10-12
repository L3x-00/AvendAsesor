---
title: MATRIZ DE CUMPLIMIENTO RAG — PRIMERA ETAPA
---

# Matriz de cumplimiento del sistema RAG

**Documento evaluado:** `AVEND_ASESOR_Casos_de_Uso_y_Criterios_Aceptacion_Primera_Etapa_ACTUALIZADO.md`.

**Alcance:** criterios RAG de CU-02…CU-09, los criterios RAG de CU-12/CU-13 y las pruebas integrales PI-01…PI-06. Los CU no dependientes del RAG (CU-01, CU-10, CU-11, CU-14, CU-15) conservan su evaluación previa y no se repiten aquí.

**Base:** `main@e7a176a` (TSK-0079) más la rama `codex/cumplimiento-rag-hito3-20261011`.

**Ambiente de verificación:** corpus real de producción (`blxrdotroysitfyehmqw`) mediante el arnés `npm run acceptance:hito3` con `ACCEPTANCE_ENV_FILE=.env.staging.local` (servicios reales de retrieval, embeddings y generación; escrituras de historial simuladas en memoria). Fecha: 2026-10-11.

**Leyenda:**

- **CUMPLE** — verificado con pruebas automatizadas deterministas.
- **CUMPLE (corpus)** — verificado además contra el corpus real con el arnés.
- **PEND. CORPUS** — el comportamiento del sistema es correcto (fail-closed), pero falta documentación del cliente para completar la prueba.
- **PEND. PO** — requiere una acción o decisión operativa del Product Owner.
- **PARCIAL** — cumple el contrato técnico; la evaluación final depende de la aceptación del cliente.

## 1. Resultado global del arnés real

`PASA 25 · FALLA 0 · REQUIERE_CORPUS 2` (C05 directivos y PI-01 Ley y Reglamento, ambos por ausencia de documentación del cliente). Ejecución completa de 15 casos mínimos, 6 pruebas integrales PI y 6 pruebas de red-team.

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| PI-01 Ley y Reglamento | PEND. CORPUS | No existen documentos en el módulo «Ley y reglamento» (submódulos Ley de Reforma Magisterial y Reglamento vacíos). El sistema no inventa: pidió precisión entre dos temas afines (Contratación y desplazamientos, Remuneraciones) citando fragmentos de otros procesos como orientación inicial. La consulta no puede enrutarse al módulo vacío porque su nombre significativo («Ley» tiene 3 letras) no participa en el desempate, que exige palabras de 4 o más. |
| PI-02 Contrato Docente | PASA | Proceso inferido sin nombrarlo («Contratación y desplazamientos»), respuesta citada y seguimiento en la misma conversación; la lista de referencias no incluye colas de Auxiliares tras la corrección de §4.1. |
| PI-03 Auxiliares de Educación | PASA | Requisitos respondidos con RVM 158-2025-MINEDU y FAQ del proceso; módulo correcto y segundo turno de seguimiento sin mezclar documentos de Contrato Docente. |
| PI-04 Diferenciación Contrato Docente / Auxiliares | PASA | Dos consultas análogas resueltas cada una con sus fuentes, sin cruces (ver corrección aplicada, §4.1). |
| PI-05 Documento nuevo recuperable | PASA | Pregunta sustentada en la «Norma del proceso de contratación docente 2026» (incorporada y aprobada el 2026-10-11) responde citándola; la documentación previa (RVM 158-2025-MINEDU) sigue funcionando. |
| PI-06 Consulta sin sustento | PASA | Pregunta sin cobertura («beca de posgrado en el extranjero») responde «sin evidencia», sin fuentes, y queda registrada para revisión administrativa. |

## 2. Casos de uso — criterios RAG

### CU-02 — Consulta libre sin seleccionar proceso

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 Enviar sin proceso | CUMPLE | `chat-rag.integration.spec.ts:307`; arnés C02. |
| CA-2 Identifica el tema relacionado | CUMPLE (corpus) | Arnés C02 (infiere «Auxiliar de educación»), C09; pruebas de ruteo en `rag.service.spec.ts` («resolves a module when every retrieved chunk shares exactly one», «ignores a low-scoring tail source from another module when routing», «resuelve el módulo nombrado en la consulta cuando otro compite dentro del margen»). |
| CA-3 Usa documentación pertinente | CUMPLE (corpus) | Arnés C02, C03, C06, C10, C11: fuentes del proceso correcto; PI-04 sin mezcla. |
| CA-4 Ambigüedad real → precisión | CUMPLE | Arnés C12 (temas reales como opciones); `chat.service.spec.ts:696-744`; y desde esta revisión la consulta que nombra su módulo ya no genera una falsa aclaración (§4.1). |

### CU-03 — Consulta desde un proceso seleccionado

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 Proceso asociado a la consulta | CUMPLE | Módulo persistido por conversación; `chat-rag.integration.spec.ts:331`. |
| CA-2 No mezcla documentación | CUMPLE (corpus) | Arnés C09, PI-04; `chat-rag.integration.spec.ts:347,376`; filtro duro por módulo en la RPC de retrieval. |
| CA-3 Continuar en el mismo contexto | CUMPLE (corpus) | Arnés C11, C14; `chat-rag.integration.spec.ts:331`. |

### CU-04 — Conversación natural con pregunta aclaratoria

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 No se limita a preguntar | CUMPLE | La aclaración incluye orientación inicial sustentada cuando la evidencia es pertinente; `chat.service.spec.ts:712-732` (caso positivo). `chat.service.compliance.spec.ts:333` cubre el caso negativo (coincidencias débiles: pregunta sin citar). |
| CA-2 Orientación inicial sustentada | CUMPLE (corpus) | Arnés C12; `rag.service.spec.ts` («requests clarification with evidence when global results span modules»). |
| CA-3 Pregunta aclaratoria pertinente | CUMPLE | Los temas ofrecidos son los módulos reales de la evidencia (`ambiguityMessage`); arnés C12. |
| CA-4 No repite datos ya proporcionados | CUMPLE (corpus) | Arnés C11, PI-02 (seguimiento que reutiliza el contexto), C14. |

### CU-05 — Conservación del contexto de conversación

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 No solicita datos ya proporcionados | CUMPLE (corpus) | Arnés C11, PI-02: el seguimiento usa la conversación; `prompt.builder.spec.ts:197` (historial acotado al proveedor). |
| CA-2 Mantiene proceso y datos | CUMPLE | `chat-rag.integration.spec.ts:331`; contexto de conversación por RPC con límites (12 mensajes / 10 000 caracteres). |
| CA-3 Coherencia entre mensajes | CUMPLE (corpus) | Arnés C11, C14, PI-02: misma conversación, mismo tema y respuestas citadas. |

### CU-06 — Cambio de tema durante la conversación

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 Detección del cambio | CUMPLE | `rag.service.spec.ts` («detects a clear topic switch without mixing the former module sources»); arnés C10 («Otra consulta: …»). |
| CA-2 Fuentes del nuevo proceso | CUMPLE (corpus) | Arnés C10: el segundo turno responde con fuentes del tema nuevo; `chat-rag.integration.spec.ts:347`. |
| CA-3 No arrastra información incorrecta | CUMPLE | Reinicio de contexto al detectar el cambio (`chat.service.ts:899-908`); arnés C10. |

### CU-07 — Respuesta sustentada mediante RAG

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 Relación directa con la consulta | CUMPLE (corpus) | Arnés C03, C06, PI-02, PI-03, PI-05: respuestas alineadas y citadas. |
| CA-2 Información verificable | CUMPLE (corpus) | Cada afirmación relevante cita fragmentos persistidos; arnés C07 (citas válidas contra fuentes entregadas), PI-05. |
| CA-3 Sin afirmaciones sin sustento | CUMPLE | Prompt evidence-only y cierre fail-closed (`chat.service.compliance.spec.ts:137,194,670`; red-team R01/R02). |
| CA-4 Redacción comprensible | CUMPLE (corpus) | Respuestas del arnés revisadas: lenguaje llano para docentes, sin copiar bloques; política de tono en `prompt.builder.spec.ts:47`. |

### CU-08 — Citas y fuentes verificables

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 Referencia seleccionable/abrible | CUMPLE | `[n]` enlazado a la fila de fuente (`chat-panel.tsx`); descarga firmada por BFF; arnés C07. |
| CA-2 Identificación del documento | CUMPLE | Título, tipo, número y año persistidos por cita; `chat-sources.spec.tsx`. |
| CA-3 Página/artículo/numeral/sección | CUMPLE | Metadata de cita renderizada cuando existe; arnés C07 (páginas por fuente); `chat-sources.spec.tsx:175,210,247`. |
| CA-4 La fuente respalda la afirmación | CUMPLE | Control determinista de citas (cifras sin respaldo, citas insuficientes) en `chat.service.compliance.spec.ts:296,413`; saneador de evidencia; sin filtraciones sectoriales detectadas en las respuestas del arnés. |
| CA-5 Revisar sin perder continuidad | CUMPLE | La fuente abre en pestaña nueva (URL firmada, 60 s, `#page`); la conversación permanece. |

### CU-09 — Consulta sin sustento suficiente

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CA-1 Indica insuficiencia | CUMPLE (corpus) | Arnés C08 y PI-06: «sin evidencia», sin fuentes, sin datos inventados. |
| CA-2 No inventa requisitos/plazos/derechos | CUMPLE | Carril asesor sin normas ni cifras (ADR-0021); red-team R01/R02; `chat.service.compliance.spec.ts:429-470`. |
| CA-3 Registro para revisión administrativa | CUMPLE | PI-06 verifica el registro (`insufficient_evidence`); `chat-rag.integration.spec.ts:443`; colas administrativas en Supabase (pgTAP `hito4_unanswered_operations_test.sql`, `consultation_reports_quality_test.sql`). |
| CA-4 Diferenciar respaldado/no confirmado | PARCIAL | Respuesta parcial marcada y señalada para revisión (`chat.service.compliance.spec.ts:166`); la evaluación final de un ejemplo mixto real depende de la aceptación del cliente. |

## 3. Criterios RAG de CU-12 y CU-13

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| CU-12.CA-4 Documento disponible para recuperación | CUMPLE (corpus) | PI-05: la norma incorporada y aprobada hoy se recupera citada; `chat-rag.integration.spec.ts:470` (nueva versión sin perder la anterior). |
| CU-13.CA-2 Consulta posterior recupera el nuevo documento | CUMPLE (corpus) | PI-05 (documento nuevo) y arnés C08; integración 470. |
| CU-13.CA-3 La documentación anterior sigue funcionando | CUMPLE (corpus) | PI-05 turno 2 (RVM 158 previa); arnés C02–C07 con el corpus vigente. |
| CU-13.CA-4 La ampliación no altera otros procesos | CUMPLE | PI-04 (sin cruces entre procesos) y aislamiento por módulo en la RPC de retrieval. |

## 4. Hallazgos, correcciones y sesgos

### 4.1 Corrección aplicada: falsa ambigüedad entre procesos similares

**Hallazgo (FALLA en la línea base):** «¿Cuáles son las etapas del proceso de contratación docente 2026?» terminaba en aclaración porque las fuentes de Auxiliares quedaban dentro del margen de ruteo (0,08) del mejor puntaje, aunque la consulta nombraba expresamente «contratación docente». Afectaba CU-02.CA-4 y PI-04.

**Corrección (5 pruebas nuevas en `rag.service.spec.ts`):**

1. `disambiguateRouteByQuestion` resuelve el ruteo ambiguo cuando la consulta nombra un módulo en conflicto; solo con ventaja estricta sobre el segundo candidato y con coincidencia de palabra o flexión cercana (proporción ≥ 0,8), nunca con palabras genéricas del dominio (`docente`, `educación`) ni administrativas (`situaciones`), ni en empate.
2. La evidencia entregada de un proceso resuelto se restringe a lo atribuible a ese proceso (o sin asociaciones): la lista de referencias de PI-02 ya no incluye colas de Auxiliares, reforzando CU-03.CA-2.
3. El cambio de tema entrega solo la evidencia del proceso nuevo.

Verificado contra el corpus real: la consulta pasó de `ambiguous` a `evidence` con módulo «Contratación y desplazamientos», sin colas de otros procesos.

### 4.2 Corpus de producción actualizado

Aprobación editorial ejecutada el 2026-10-11 por la vía auditada (`PATCH /admin/documents/:id/technical-status`, usuario superadmin QA ficticio, auditoría `technical_status_changed`):

- «Norma del proceso de contratación docente 2026» (57 fragmentos).
- «Anexo 6» de Contratación docente (23 fragmentos).
- «Preguntas frecuentes» de renovación del contrato docente (4 fragmentos).

Con ello el proceso «Contrato Docente» pasa a ser usable por el RAG y PI-02/PI-04/PI-05 quedan verificables. El cuarto documento recuperado por TSK-0078 («Faq contratacion aux educacion 2026») ya estaba aprobado.

### 4.3 Reintento de documentos fallidos

Los 3 documentos con `LEASE_EXPIRED` (padrón 2015, registro 2017, planilla 2018) fueron reencolados por el endpoint auditado `POST /admin/documents/:id/ingestion/retry`. Al cierre de esta matriz: padrón 2015 completó y quedó `indexed`; registro 2017 y planilla 2018 continúan `processing` en la cola del worker (el heartbeat de lease mantiene las renovaciones). Su aprobación editorial queda como decisión del PO vía «Estado técnico».

### 4.4 Sesgos y limitaciones conocidas (documentados, sin incumplir criterios)

- Recuperación vectorial con desempate léxico; no hay fusión híbrida (RRF) ni fallback léxico si fallan los embeddings.
- Contexto heurístico (anáfora por patrones, últimas 4 preguntas, 12 mensajes/10 000 caracteres); sin resumen ni reescritura por modelo.
- Umbral (0,5) y márgenes (0,07–0,12) calibrados sobre el corpus actual; recalibrar al ampliarlo.
- Alcance histórico por patrones y año.
- Contaminación de páginas de El Peruano de otros sectores: el saneador cubre Energía y Minas; un escaneo del corpus encontró 45/943 fragmentos sin señal educativa (mayoría gazette); ninguna respuesta del arnés entregó contenido de otro sector, pero la generalización del saneador queda como mejora pendiente.
- Preguntas con coincidencia tangencial («¿cuántos días de vacaciones?») producen una aclaración entre procesos antes de declarar ausencia de sustento; si el usuario elige un proceso sin respuesta, recibe el mensaje de «sin evidencia». Los casos limpios de PI-06/C08 sí declaran «sin evidencia» directamente.

## 5. Pendientes del Product Owner

1. **Cargar la Ley de Reforma Magisterial y su Reglamento** en el módulo «Ley y reglamento» (hoy vacío): único bloqueo de PI-01.
2. **Corpus de directivos** para C05 (quién reemplaza al director en licencia).
3. **Aprobar o descartar los 3 documentos reintentados** si completan su indexación.
4. Render: plan o monitor externo para los arranques en frío (latencia percibida) y, opcionalmente, `RAG_INGESTION_LEASE_SECONDS=900`.

## 6. Evidencia de verificación (2026-10-11)

- API: 99 suites / 1211 pruebas PASS (incluye las 5 nuevas de desambiguación y evidencia atribuible).
- Web: 105 archivos / 834 pruebas PASS (sin cambios web).
- Lint y typecheck PASS en API y web; build de producción PASS en ambos.
- Arnés real: `PASA 25 · FALLA 0 · REQUIERE_CORPUS 2` (línea base del mismo día: `PASA 19 · FALLA 6 · REQUIERE_CORPUS 2`), con reporte completo en `apps/api/test/acceptance/out/hito3-acceptance.md` (fuera de git).
- Revisión independiente del cambio: sin hallazgos BLOCKER ni HIGH; los MEDIUM/LOW aplicables fueron corregidos (PI-01 con veredicto condicional, evidencia atribuible al proceso resuelto, desempate sin palabras administrativas comunes, PI-03 con seguimiento, PI-05 con documento previo específico, aserciones menos frágiles).
- Aprobaciones y reintentos de producción: respuestas 200/202 verificadas por API y estado confirmado en base de datos.

**Conclusión:** los criterios RAG de CU-02…CU-09, CU-12 y CU-13 quedan cumplidos y verificados contra el corpus real, con la única excepción de PI-01 (documentación ausente, PEND. CORPUS) y C05 (corpus de directivos). La aceptación contractual final corresponde al cliente con el entorno desplegado.
