# Punto 6 — Calidad del RAG

Fecha: 2026-10-16. Rama independiente: `codex/calidad-rag-punto6`, desde
`origin/main@737ca9b` (incluye PRs #118 y #119).

**Resultado: infraestructura de calidad implementada; aceptación funcional
bloqueada.** La campaña final completó 45 casos: 32 PASA, 10 FALLA y 3
REQUIERE_REVISION. La compuerta devuelve `FAILED` y el proceso sale con código 1.
Una suite verde no reemplaza la campaña ni el QA autenticado.

## Qué cambia

- El inventario elegible se captura antes de consultar. Un fallo de recuperación
  con documentación disponible deja de clasificarse como falta de corpus.
- Fuentes contrastadas por documento/versión y metadatos canónicos: título,
  año, MIME y total PDF. Se comprueban ambos extremos del rango y los números
  de cita. Un error técnico, una respuesta vacía o un turno incompleto fallan.
- `no_evidence` solo admite los contratos deterministas previstos, sin tokens,
  fuentes ni prosa factual añadida. Las negativas de una norma contrastan tipo
  y número completos; RSG y DS con igual número no son intercambiables.
- Las tablas deben cumplir la clasificación real de la web y citar fuentes
  conocidas por fila. Se verifican orden temporal, moneda, signo y monto de
  control, incluyendo contradicciones monetarias fuera de la tabla.
- O03, O04, C18 y C19 nunca reciben PASA automático: la aplicabilidad de toda
  una respuesta y la apertura real del enlace necesitan revisión manual.
  `salary2025TableMatchesControl` expresa una coincidencia técnica, no una
  certificación jurídica del texto.
- Base y repeticiones usan los mismos evaluadores. La estabilidad compara
  veredicto, eventos, versiones, páginas, referencias estructurales e importes;
  no exige redacción idéntica. Un fallo repetible sigue siendo un fallo.
- Se vuelve a capturar el inventario al finalizar. Si cambia, la campaña no
  puede aprobar aunque sus casos individuales pasen. Cada salida incluye
  revisión, huella del código, modelo configurado y fotografía documental.
- Correcciones acotadas descubiertas por regresiones: reconocer «cuánto debería
  ganar/gano», normalizar las faltas demostradas `reasingnacion/rekisitos`, usar
  submódulos reales al resolver procesos y separar una tabla de contenido de un
  pedido de abrir su archivo. Se preservan contratación docente explícita,
  comparaciones entre procesos y comparaciones de años del mismo proceso.

No cambia SQL, RLS, autorización, proveedor, configuración ni datos del corpus.
Las preguntas originales continúan guardándose sin reescribirlas.

## Campaña ejecutada

Código de campaña: `f3040ca`; oráculos v3. Inventario: **94 documentos** antes y
después, sin cambios en los campos contrastados. Historial simulado en memoria,
embeddings y generación reales, lecturas del corpus configurado y trabajador
de ingesta desactivado. No se escribieron conversaciones ni corpus desde el
arnés. El QA del navegador sí guardó consultas normales de la cuenta de prueba.

El control independiente leyó los fragmentos reales del DS 049-2025-EF que
abarcan la página física 3: importe `3300.60`, jornada 30 y Ley 30328 presentes.
El JSON conserva la huella del texto usado para ese control.

| Corrida                                     | Casos | Resultado                                  |
| ------------------------------------------- | ----- | ------------------------------------------ |
| Arnés original, base de comparación         | 36    | 22 PASA / 10 FALLA / 3 CORPUS / 1 REVISION |
| Oráculos v2, antes de correcciones acotadas | 45    | 29 PASA / 13 FALLA / 2 CORPUS / 1 REVISION |
| Oráculos v3, campaña final                  | 45    | 32 PASA / 10 FALLA / 3 REVISION; FAILED    |

Los totales no son una tasa de mejora comparable: cambiaron los controles y se
añadieron casos. C20 pasó sus tres repeticiones. O03 y O04 fallaron las tres;
la estabilidad no convierte esos seis resultados en aprobaciones.

La última corrección de la comparación entre años de contratación se verificó
después con regresiones focales; no se atribuye a la revisión de campaña
`f3040ca`. Los archivos completos, ignorados por Git, están en
`apps/api/test/acceptance/out/hito3-quality-20261016-{baseline,v2,final-v3}.{json,md}`.
La corrida intermedia `final` conserva un rechazo de eventos efímeros corregido
en v3 y no debe utilizarse como resultado final.

## Matriz de las 24 observaciones

Las regresiones anteriores se conservan y se ejecutan con las nuevas. La tabla
identifica controles concretos; no afirma que una prueba de política certifique
el comportamiento de todas las respuestas generadas.

| OBS | Regresión ejecutable / caso real                                                     | Alcance y estado                                                                                                          |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 001 | `chat.service.compliance.spec.ts`, `acceptance-quality-oracles.spec.ts`; C08, PI-06  | Negativa sin contenido factual, fuentes o tokens; PASA en campaña                                                         |
| 002 | `salary-applicability.spec.ts`, `salary-query-regression.spec.ts`, oráculos; O02/O03 | Concepto, factores, importe y precedencia; O03 aún FALLA                                                                  |
| 003 | `rag.service.spec.ts` (referencias exactas); E03                                     | Identidad exacta fail-closed; DS074 disponible por título pero rechazada: FALLA                                           |
| 004 | `query-normalization.spec.ts`, nueva regresión de proceso; C17                       | Corrige término sin cambiar lo persistido; contenido requiere revisión                                                    |
| 005 | `process-routing-regression.spec.ts`, oráculos de tabla; C18                         | Ya no confunde tabla de contenido con abrir archivo; aún pide año en comparación                                          |
| 006 | `chat-response-tables.spec.ts`, oráculos; O03                                        | Parser y citas por fila; QA salarial no produce tabla: no se aprueba visualmente                                          |
| 007 | `source-location.spec.ts`; O04                                                       | Enlace determinista preservado; ruta ambigua todavía aclara en vez de localizar                                           |
| 008 | `pdf-extraction.service.spec.ts`, oráculos, `chat-sources.spec.tsx`                  | Rangos y total canónico; fuente FAQ real muestra 2–3/4 y 3–4/4                                                            |
| 009 | `evidence-consolidation.spec.ts`, `chat-sources.spec.tsx`                            | Agrupa documento sin perder fragmentos/citas; UI distingue referencias y descargas                                        |
| 010 | `temporal-precedence.spec.ts`, catálogo, `chat-sources.spec.tsx`, oráculos           | Orden vigente/reciente e históricos; orden multiaño visual pendiente                                                      |
| 011 | `salary-applicability.spec.ts`, oráculos; O01/O03                                    | Separación de asignación e histórico; prosa salarial no se autoaprueba                                                    |
| 012 | `source-location.spec.ts`, oráculo común; C20 y dos repeticiones                     | Página en lugar de minuto, sin timestamp; PASA 3/3                                                                        |
| 013 | `chat.service.compliance.spec.ts`; C05                                               | No basta aclarar genéricamente; corpus del módulo requerido no preparado y respuesta con hechos: FALLA                    |
| 014 | `rag.service.spec.ts`, `process-routing-regression.spec.ts`; PI-05                   | Proceso auxiliar explícito, raíces/submódulos y contramuestras de contratación docente; PASA                              |
| 015 | `process-clarification.spec.ts`, `chat.service.spec.ts`; C07/C09/C11/C16             | Causal antes de requisitos especiales y cadena de tres turnos; PASA                                                       |
| 016 | `fixed-closings.spec.ts`, `prompt.builder.spec.ts`                                   | Etiquetas/cierres opcionales; utilidad y repetición del texto generado siguen siendo revisión humana                      |
| 017 | `evidence-consolidation.spec.ts`, `chat-sources.spec.tsx`, oráculos                  | Fuentes conocidas, citadas primero y resto plegado; pertinencia semántica requiere contraste                              |
| 018 | `chat.service.topics.spec.ts`, catálogo; R05/R06                                     | Solo temas con corpus elegible; PASA                                                                                      |
| 019 | `conversational-replies.spec.ts`, `intent-classifier.spec.ts`; R02                   | Rechazo ajeno sin ayuda de contraseñas no solicitada; PASA                                                                |
| 020 | `acceptance-quality-oracles.spec.ts`, 15 mutaciones, repeticiones                    | Contramuestras de falso PASA, corpus, errores, vacíos, signos, identidad, página y estabilidad                            |
| 021 | QA autenticado y persistencia al recargar                                            | Sesión real disponible; sin crear/restablecer cuentas ni almacenar credenciales                                           |
| 022 | `chat.service.spec.ts`, compliance, C09/C10/C14/C15                                  | Simulación PASA; QA preserva chats separados tras recargar e Historial, pero el destino de reasignación permanece general |
| 023 | `rag.service.spec.ts`, oráculos; E01/E02 y QA de ambas RSG                           | Sin sustituir por otra norma: PASA; no demuestra que la norma esté disponible                                             |
| 024 | `chat-sources.spec.tsx`, extracción, oráculos                                        | Fallback PDF verificable en QA; se detectó un sello legado aún visible en historial y se añadió su contramuestra          |

Rutas: las pruebas API están en `apps/api/src/{rag,chat,ingestion}` y las de
presentación en `apps/web/src/components/chat`. Los controles originales y sus
causas están en `REPORTE_CAMPANA_RAG_REAL_2026-10-13.md` y
`ANALISIS_CAUSA_RAIZ_RAG_2026-10-13.md`.

## QA autenticado del despliegue existente

Se usó la sesión iniciada por el Product Owner en el navegador de Codex. Estos
resultados pertenecen a la aplicación desplegada, no a una publicación de esta
rama. No se presupone qué revisión exacta ejecuta Render a partir de `main`.

| Caso original                        | Resultado de esta repetición                                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-UI-01, sueldo y persistencia      | FALLA funcional: la pregunta concreta de contratado/30h/2025 queda sin evidencia; también falla su variante. Aclaración general real sí se guardó y persistió al recargar                                             |
| QA-UI-02, abrir PDF/página           | PASA apertura desde fuentes: FAQ redirige al PDF con `#page=2` y DS049 de una respuesta guardada con `#page=3`. La consulta nueva por número exacto sigue rechazada; es un fallo diferente                            |
| QA-UI-03, cambio de tema e historial | Parcial: crea ID nuevo; tras recargar cada chat conserva únicamente su pregunta y ambos aparecen en Historial. El nuevo queda en Consultas generales, pendiente de confirmar módulo destino; la campaña local sí PASA |
| QA-UI-04, tabla salarial responsive  | Parcial: respuesta guardada muestra una tabla real de 4 columnas y 9 filas, cifras alineadas y citas por fila. Generación salarial nueva falla; no se verificó aquí un viewport de teléfono                           |
| QA-UI-05, enlace explícito           | FALLA para DS049 exacto: negativa segura aunque el título existe en el inventario. Consulta equivalente por contenido dio error técnico en dos intentos, conservando el texto para reintentar                         |
| QA-UI-06, total de páginas           | Parcial: FAQ con 2–3 de 4 y 3–4 de 4 coherentes. Norma docente guardada muestra 20–21 sin total inventado y abre con `#page=20`; su total físico sigue desconocido                                                    |
| QA-UI-07, orden de descargas         | PASA en la muestra histórica: documentos disponibles 2025, 2023, 2023; tres documentos distintos, fragmentos agrupados por descarga                                                                                   |
| QA-UI-08, RSG326 ausente             | PASA seguridad: negativa con tipo/número correctos, sin citas prestadas                                                                                                                                               |
| QA-UI-09, RSG121 ausente             | PASA seguridad: negativa con tipo/número correctos, sin citas prestadas                                                                                                                                               |

Se verificó visualmente la columna Ubicación: «Páginas 3–4 del PDF · Sin sección
o artículo identificado». Las capturas y los identificadores de conversaciones
se guardan únicamente en la coordinación local de TSK-0095. No se guardaron las
credenciales ni los enlaces firmados.

## Pendientes que bloquean la aceptación

1. O03: retrieval sí contiene DS049/página3. Una ejecución directa del generador
   devolvió el importe correcto pero citó nombre/número/página sin la cita `[n]`.
   La protección existente descartó la respuesta; no se debe relajar ni fabricar
   citas para aprobar. Resolver el contrato de generación y repetir tres veces.
2. C18: pide comparar incrementos de distintos años y recibe una aclaración por
   año. Separar comparación documental de monto personal antes de aceptar.
3. O04: la intención de localizar documento llega a una recuperación ambigua;
   el carril determinista actual no cubre esa variante y pide sector.
4. E03 y rechazo exacto de DS049: metadatos de identidad incompletos. Coordinar
   con TSK-0094 causa B y TSK-0091; ninguna corrección de datos o reindexación
   se ejecutó desde esta rama. **Nota 2026-10-16 (TSK-0096, autorizado por el
   PO):** la causa se ataca en dos frentes ya implementados y verificados en
   rama: (a) la compuerta exacta acepta el número que el título declara cuando
   el campo registrado está vacío, con el número registrado como autoridad y el
   tipo gobernado obligatorio (ADR-0026); (b) el catálogo incorpora
   `RESOLUCION_SECRETARIA_GENERAL` y las dos RSG se retipan y numeran por la vía
   auditable (ADR-0025). El despliegue de datos y migraciones es una operación
   aparte, con ensayo en seco y autorización del PO. Esto **no** levanta el
   bloqueo de aceptación de este punto: la campaña real sigue siendo la que
   decide. **Revisión independiente 2026-10-16:** la primera versión fue
   rechazada con un hallazgo alto reproducible (una norma que menciona a otra
   del mismo tipo respondía por la mencionada, y un documento sin tipo declarado
   respondía por una RSG difundida). Corregido: solo cuenta la primera
   declaración de ese código en el título, `OTRO` no responde por una RSG, la
   etiqueta de Secretaría General se busca en el número registrado y en el
   título con tildes normalizadas, y el vector de búsqueda de la biblioteca
   incluye el tipo nuevo. Los contraejemplos quedaron fijados en pgTAP y en las
   pruebas unitarias; los límites que siguen sin cubrirse (ceros a la izquierda,
   guion largo, «Núm.», y un título que solo menciona otra norma del mismo código
   sin evidencia propia) están documentados en ADR-0026. Los tres primeros se
   comportan igual en las dos capas; solo los ceros a la izquierda entran a la
   compuerta exacta y responden «sin evidencia», mientras que el guion largo y
   «Núm.» no se detectan como referencia y siguen la ruta temática.
5. C05 y PI-01: módulos requeridos sin corpus preparado y respuestas con hechos
   desde otros documentos. Contrastarlas contra el corpus antes de aceptarlas;
   no esconderlas como «REQUIERE_CORPUS» después de responder.
6. C17/O01: revisión humana de vigencia, concepto y alcance; C19: completar
   el flujo con una respuesta nueva. Repetir los QA dependientes de las fallas.
7. OBS-024 legado: una referencia guardada de cronograma conserva como sección
   el sello que comienza «La integridad del documento y la autoría…». No es una
   sección jurídica y no se modificó ese registro. Se añadió detección al
   oráculo; queda pendiente neutralizar su presentación sin reescribir historia.

## Verificación y revisión

- API: 111 suites / 1574 pruebas aprobadas, también con cobertura sobre los
  umbrales; E2E: 2 suites / 35 pruebas aprobadas.
- Web: 111 archivos / 913 pruebas aprobadas. Tipos de API/web, lint API y
  compilaciones API/web aprobados. CI remoto se comprueba aparte.
- 15 mutaciones falsables, con hashes de restauración verificados. Retirar cada
  protección hizo fallar su prueba correspondiente.
- La detección adicional del sello legado se contrastó contra los 45 casos /
  55 turnos guardados: cero nuevas infracciones de integridad en esa evidencia.
  Este replay no es una nueva campaña ni una aprobación de su contenido.
- Revisión independiente en tres rondas: R1 bloqueó falsos aprobados; R2 exigió
  abandonar la certificación semántica por regex; R3 PASS, sin BLOCKER/HIGH.
  Su MEDIUM sobre comparar años del mismo proceso se corrigió con una
  contramuestra positiva y se reejecutaron 84 pruebas focales.

El PR debe mantenerse sin fusión mientras la compuerta funcional siga fallando.
El hardening puede revisarse e integrarse separadamente por decisión del PO,
pero no equivale al cierre de las observaciones ni a una publicación validada.
