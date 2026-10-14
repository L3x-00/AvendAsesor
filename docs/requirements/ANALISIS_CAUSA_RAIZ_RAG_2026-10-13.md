# Análisis de causa raíz del RAG — 2026-10-13

## 1. Propósito y límites

Este documento explica las causas de las 24 observaciones registradas en `REPORTE_CAMPANA_RAG_REAL_2026-10-13.md`. Se investigó el código desplegado en `5088fb4`, los metadatos del corpus y la aplicación autenticada.

En esta fase no se corrigió el RAG, no se cambió el proveedor o modelo de IA, no se habilitó navegación web y no se alteraron documentos ni datos de producción. Los cambios locales que ya existían en el árbol se consideran propuestas pendientes, no comportamiento desplegado.

## 2. Conclusión ejecutiva

Las fallas no tienen una sola causa ni se resuelven cambiando el modelo. El modelo puede variar la redacción, pero los defectos críticos son principalmente deterministas:

1. la recuperación no trata el número exacto de una norma como una condición obligatoria;
2. cuando no hay evidencia se permite generar orientación libre sin citas;
3. no existe una regla estructurada de precedencia temporal y aplicabilidad para montos;
4. el fragmentado guarda metadatos de ubicación imprecisos y la interfaz los muestra sin validación;
5. el contrato de generación y el renderizador desplegado no soportan tablas;
6. enlaces, páginas y documentos exactos no son una intención funcional de primera clase;
7. la deduplicación opera sobre fragmentos, mientras la referencia visible se presenta como documento;
8. los oráculos automáticos comprueban forma y eventos, pero no siempre verdad, vigencia o pertinencia.

Por ello, sustituir el modelo podría mejorar el estilo de algunas respuestas, pero no impediría citas ajenas, páginas imposibles, orden inestable, tablas literales ni fuentes duplicadas.

## 3. Causas raíz agrupadas

### CR-01 — La identidad documental exacta no es una restricción de recuperación

**Estado:** confirmada.

El servicio acepta los fragmentos devueltos por la búsqueda que superen el umbral general de similitud (`RAG_DEFAULT_MATCH_THRESHOLD = 0.5`). Después decide módulo y ambigüedad a partir de esos mismos resultados. No existe un paso previo que detecte “RSG N.° 326-2017-MINEDU” o “DS N.° 074-2019-EF”, consulte por ese identificador y rechace documentos cuyo número/título no coincida.

Esto explica que una norma pendiente pueda recuperar textos temáticamente próximos y presentarlos como orientación, y que una norma disponible no siempre aparezca ante su número exacto. También falta normalización específica para errores comunes como “renumeración”.

**Evidencia:** `apps/api/src/rag/rag.constants.ts:66`; `apps/api/src/rag/rag.service.ts:556-627`; `apps/api/src/chat/chat.service.ts:1001-1031`.

**Observaciones afectadas:** OBS-003, OBS-004, OBS-005, OBS-007, OBS-014 y OBS-023.

**Corrección mínima recomendada:** incorporar una fase determinista de intención e identidad documental antes de la similitud: normalizar tipo/número/año, consultar solo versiones elegibles y, si no existe coincidencia exacta, responder que ese documento no está disponible sin mostrar evidencia sustituta. La búsqueda semántica debe mantenerse para preguntas temáticas, no para reemplazar una norma nombrada.

### CR-02 — “Sin evidencia” todavía permite contenido generado sin sustento

**Estado:** confirmada.

Cuando la recuperación devuelve `no_evidence`, el flujo no termina con una respuesta determinista. Invoca al proveedor en modo asesor y persiste su texto como `no_evidence` sin fuentes. La validación rechaza citas y cifras, pero no puede demostrar que afirmaciones cualitativas —por ejemplo, tipos de sanción o pasos de una beca— sean correctas.

**Evidencia:** `apps/api/src/chat/chat.service.ts:972-998`, `:1225-1296` y `:1305-1362`.

**Observaciones afectadas:** OBS-001 y la parte no sustentada de OBS-004.

**Corrección mínima recomendada:** separar “no existe sustento documental” de “orientación general”. Para consultas normativas, laborales, sancionadoras o económicas, usar una respuesta determinista sin hechos nuevos. La IA solo puede ayudar a reformular la solicitud o explicar qué dato falta, no completar el contenido.

### CR-03 — No hay precedencia temporal ni matriz de aplicabilidad para remuneraciones

**Estado:** confirmada en diseño; la relación jurídica exacta entre normas debe validarse con el corpus antes de codificarla.

Las fuentes se ordenan principalmente por relevancia y todas las normas marcadas como vigentes pueden competir. El sistema no modela de forma estructurada qué monto reemplaza a cuál, ni valida cargo, condición, jornada y año antes de presentar una cifra. El prompt pide preferir lo vigente y reciente, pero esa recomendación depende del modelo y no se comprueba después.

**Evidencia:** `apps/api/src/rag/rag.service.ts:201-240`, `:556-640`; `apps/api/src/rag/prompt.builder.ts:102-118`.

**Observaciones afectadas:** OBS-002, OBS-010 y OBS-011.

**Corrección mínima recomendada:** ordenar candidatos por aplicabilidad y fecha dentro del mismo concepto, modelar reemplazos cuando se conozcan, exigir los datos personales decisivos y validar que la respuesta destaque un único monto actual. Los antecedentes deben quedar separados y rotulados como históricos.

### CR-04 — Los metadatos de ubicación se infieren con una heurística demasiado amplia

**Estado:** confirmada.

Si el fragmentador no encuentra un rótulo normativo, usa la primera oración del tramo como `sectionTitle`. Esa oración puede ser una cabecera de El Peruano, el título completo del documento o texto corrido. La tabla de fuentes muestra el valor literalmente bajo “Sustento/Sección”, sin comprobar que sea un título o subtítulo real. La detección de artículo y numeral también se realiza con expresiones regulares sobre todo el fragmento, por lo que puede capturar una mención vecina.

**Evidencia:** `apps/api/src/ingestion/chunking.service.ts:62-109`, `:214-250`; `apps/web/src/components/chat/chat-sources.tsx:155-219`.

**Observaciones afectadas:** OBS-024 y parte de OBS-017.

**Corrección mínima recomendada:** distinguir `sectionTitle` estructural de un simple extracto descriptivo, filtrar cabeceras/pies y no mostrar artículo/numeral sin relación verificable con el texto citado. Si no hay ubicación fiable, decirlo expresamente; no inventarla.

### CR-05 — El valor de seguridad `pageCount = 1` se persiste como dato real

**Estado:** confirmada con datos.

El inspector evita analizar PDF mayores de 20 MiB y devuelve una página como valor de respaldo. La norma de contratación 2026 pesa 22 162 722 bytes. La ingestión posterior obtuvo fragmentos hasta la página 42, pero no reconcilió el total almacenado. El resultado es una fuente `20–21 de 1`; el enlace a `#page=20` sí se construye con la página real del fragmento.

**Evidencia:** `apps/api/src/documents/pdf-inspection.service.ts:27`, `:145-165`; `apps/api/src/supabase/supabase-retrieval.gateway.ts:102`.

**Observaciones afectadas:** OBS-008.

**Corrección mínima recomendada:** representar el total desconocido como `null`, nunca como 1; actualizarlo con el máximo de páginas comprobado durante la ingestión y aplicar una reparación controlada a versiones ya indexadas.

### CR-06 — La deduplicación técnica no coincide con la unidad visible “documento”

**Estado:** confirmada.

`uniqueSources` elimina solamente texto contenido dentro de la misma versión. `relevantSources` reserva diversidad inicial, pero luego completa el cupo con más fragmentos de documentos ya elegidos. La tabla de referencias dibuja cada fragmento como una fila; la deduplicación por versión solo se utiliza en la lista de descargas. Así un cronograma puede ocupar tres referencias y varios fragmentos especiales del mismo documento pueden dominar la respuesta.

**Evidencia:** `apps/api/src/rag/rag.service.ts:169-235`; `apps/web/src/components/chat/chat-sources.tsx:18-28`, `:155-219`, `:290-311`.

**Observaciones afectadas:** OBS-009, OBS-015 y OBS-017.

**Corrección mínima recomendada:** separar “evidencia interna” de “fuente visible”; consolidar por versión/documento y ubicación contigua, conservar varios fragmentos solo cuando aporten condiciones distintas y presentar una sola fila con el rango relevante. La decisión de módulo debe conservar asociaciones antes de deduplicar.

### CR-07 — Tablas están prohibidas al generar y no existen al renderizar

**Estado:** confirmada.

El prompt desplegado ordena “No uses … tablas”. Aun cuando el proveedor genera una tabla Markdown, el renderizador solo reconoce encabezados, listas y párrafos; las líneas se unen como texto. Por eso las barras se ven literalmente y generan desbordamiento.

**Evidencia:** `apps/api/src/rag/prompt.builder.ts:107`; `apps/web/src/components/chat/chat-panel.tsx:370-472`.

**Observaciones afectadas:** OBS-005 y OBS-006.

**Corrección mínima recomendada:** permitir tablas únicamente cuando la pregunta o la evidencia las justifique, exigir una cita válida por fila y renderizar un subconjunto seguro de Markdown con límites de columnas, filas y tamaño. En móvil debe existir desplazamiento dentro de la tabla, no de toda la respuesta.

### CR-08 — Enlace, documento y página exactos no forman una intención unificada

**Estado:** confirmada.

El prompt indica que el modelo no escriba enlaces y que el sistema añadirá uno, pero la ruta determinista solo reconoce solicitudes de portales institucionales. Los enlaces de fuente se agregan después en la interfaz; el modelo no recibe un resultado estructurado que le permita decir “abre la fuente citada”. Para “minuto” tampoco existe una corrección determinista de unidad PDF → página.

**Evidencia:** `apps/api/src/rag/prompt.builder.ts:119-120`, `:140`; `apps/api/src/chat/chat.service.ts:1458-1469`; `apps/web/src/components/chat/chat-panel.tsx:280-319`.

**Observaciones afectadas:** OBS-007 y OBS-012.

**Corrección mínima recomendada:** crear una intención `source_location` que responda con documento, página física y una referencia enlazable generada por la aplicación. Si se pide “minuto” sobre PDF, aclarar amablemente que la unidad disponible es la página. No permitir que el modelo niegue una capacidad que la interfaz sí ofrece.

### CR-09 — La desambiguación se basa en módulos recuperados, no en la suficiencia de la pregunta

**Estado:** confirmada.

La ruta usa márgenes de score y asociaciones de módulo. Si los resultados dominantes pertenecen a módulos distintos, produce una aclaración genérica y puede exponer una “orientación inicial”. No reconoce con prioridad que la pregunta ya nombró un proceso o una norma exacta, ni identifica la causal específica dentro de reasignación. La evidencia repetida de emergencia/salud refuerza un subconjunto como si fuera la regla general.

**Evidencia:** `apps/api/src/rag/rag.service.ts:362-430`, `:599-755`; `apps/api/src/chat/chat.service.ts:1001-1031`.

**Observaciones afectadas:** OBS-013, OBS-014 y OBS-015.

**Corrección mínima recomendada:** resolver primero las entidades explícitas de la pregunta; pedir solo el dato que realmente cambia la respuesta (por ejemplo, causal de reasignación) y no ofrecer extractos hasta confirmar pertinencia documental.

### CR-10 — Frases fijas fuerzan un tono repetitivo o irrelevante

**Estado:** confirmada.

El prompt fomenta el cierre “Sugerencias:” y el modo asesor añade además un cierre fijo con MINEDU/UGEL/DRE. La plantilla de límite del sistema incluye restablecimiento de contraseña aunque la consulta bloqueada no trate de credenciales.

**Evidencia:** `apps/api/src/rag/prompt.builder.ts:109`, `:139`; `apps/api/src/rag/rag.constants.ts:23-24`; `apps/api/src/chat/intent/conversational-replies.ts:91-96`.

**Observaciones afectadas:** OBS-016 y OBS-019.

**Corrección mínima recomendada:** hacer el cierre contextual y opcional; mostrar una acción solo cuando responda a la pregunta. Separar intento de obtener configuración de un verdadero pedido de recuperación de contraseña.

### CR-11 — “Temas disponibles” significa módulos activos, no corpus utilizable

**Estado:** confirmada.

Las respuestas de capacidad leen los módulos activos y los enumeran. No verifican que cada módulo tenga al menos un documento disponible, indexado, aprobado y con fragmentos. En la fotografía había siete módulos activos, pero solo cuatro con corpus elegible.

**Evidencia:** `apps/api/src/chat/chat.service.ts:1471-1479`; `apps/api/src/chat/intent/conversational-replies.ts:38-48`.

**Observaciones afectadas:** OBS-018.

**Corrección mínima recomendada:** anunciar solo temas consultables o diferenciar claramente “módulo existente” de “información documental disponible”.

### CR-12 — Los oráculos automáticos validan estructura, no calidad semántica completa

**Estado:** confirmada.

El arnés consideraba correcta una respuesta sin evidencia si emitía el evento esperado y no tenía fuentes; no inspeccionaba si el texto añadía hechos. Para remuneraciones verificaba cita y módulo, pero no actualidad, cargo ni monto correcto. `REQUIERE_CORPUS` se decidía por el evento, sin contrastar el inventario real. La generación no determinista también puede cambiar el veredicto entre corridas.

**Evidencia:** `apps/api/test/acceptance/hito3-client-cases.ts:324-350`, `:548-558`, `:785-838`, `:1090-1169`.

**Observaciones afectadas:** OBS-020.

**Corrección mínima recomendada:** combinar aserciones deterministas por caso, inventario de corpus previo, validación de identidad/fecha/monto y revisión humana para semántica. Repetir una muestra de casos generativos para medir estabilidad; un contador verde no equivale a aceptación funcional.

## 4. Trazabilidad completa OBS → causa

| Observación | Causa principal | Causas contribuyentes | Confianza |
| --- | --- | --- | --- |
| OBS-001 | CR-02 | CR-12 | Confirmada |
| OBS-002 | CR-03 | CR-06, ausencia de validación posterior | Confirmada en diseño |
| OBS-003 | CR-01 | Umbral genérico de recuperación | Confirmada en diseño; requiere traza instrumentada del caso antes del parche |
| OBS-004 | CR-01 | CR-02 | Confirmada en diseño; requiere medir la normalización propuesta |
| OBS-005 | CR-01 | CR-07 | Confirmada en diseño |
| OBS-006 | CR-07 | — | Confirmada y reproducida |
| OBS-007 | CR-08 | CR-01, CR-09 | Confirmada y reproducida |
| OBS-008 | CR-05 | — | Confirmada con código y datos |
| OBS-009 | CR-06 | — | Confirmada y reproducida |
| OBS-010 | CR-03 | El catálogo ordena por título y las descargas conservan ranking | Confirmada |
| OBS-011 | CR-03 | CR-06 | Confirmada en diseño |
| OBS-012 | CR-08 | Generación libre de la explicación | Confirmada en diseño |
| OBS-013 | CR-09 | Mensaje de aclaración único | Confirmada |
| OBS-014 | CR-09 | CR-01 | Confirmada y reproducida |
| OBS-015 | CR-06 | CR-09 | Confirmada en diseño |
| OBS-016 | CR-10 | — | Confirmada |
| OBS-017 | CR-06 | CR-04 | Confirmada |
| OBS-018 | CR-11 | — | Confirmada con inventario |
| OBS-019 | CR-10 | Clasificación amplia de `system_limit` | Confirmada |
| OBS-020 | CR-12 | No determinismo del proveedor | Confirmada |
| OBS-021 | No es defecto | Bloqueo operativo de sesión ya resuelto | Verificada |
| OBS-022 | No es defecto | Flujo que debe preservarse | Verificada |
| OBS-023 | CR-01 | CR-09 | Confirmada y reproducida |
| OBS-024 | CR-04 | La interfaz confía en el metadato | Confirmada y reproducida |

## 5. Secuencia recomendable de corrección

La secuencia reduce el riesgo de mejorar la apariencia mientras permanece un error de sustento:

1. **Seguridad epistemológica:** identidad exacta de normas, negativa segura ante documentos ausentes y eliminación de hechos generados en `no_evidence`.
2. **Metadatos verificables:** corregir total de páginas y ubicación estructural; reparar registros existentes de forma controlada.
3. **Recuperación y síntesis:** normalización ortográfica, precedencia temporal, aplicabilidad salarial, consolidación por documento y desambiguación contextual.
4. **Capacidades de respuesta:** intención de enlace/página y tablas con cita por fila.
5. **Presentación:** renderizado accesible, orden más nuevo → más antiguo y tono contextual sin frases fijas innecesarias.
6. **Calidad:** endurecer los oráculos, agregar regresiones para cada OBS y repetir campaña más QA autenticado.

## 6. Reglas de preservación

Las correcciones futuras no deben romper:

- la redirección automática entre módulos y la creación de un chat separado;
- la persistencia por módulo verificada al recargar;
- el aislamiento de conversaciones entre usuarios;
- la descarga autorizada y el salto a `#page=N`;
- la distinción de documentos vigentes, reemplazados y archivados;
- el filtrado de sellos, validadores y texto de otros sectores;
- los límites de longitud, streaming y manejo de fallos existentes;
- el proveedor de IA ya configurado.

## 7. Criterio de salida para la futura implementación

La corrección no estará cerrada por compilar o por tener suites verdes. Debe demostrar, con el mismo corpus:

- cero documentos ajenos ante las dos normas intencionalmente pendientes;
- monto 2025 correcto y claramente aplicable para jornada/cargo consultados;
- tabla visual accesible con cita válida en cada fila;
- fuente única por documento salvo ubicaciones materialmente distintas;
- “Sección o subtítulo” real o una indicación honesta de que no se identificó;
- páginas coherentes con el total del PDF;
- documentos y resúmenes ordenados del más reciente al más antiguo;
- enlace exacto funcional sin que el texto lo niegue;
- respuestas sin evidencia que no añadan hechos;
- redirección y persistencia de OBS-022 sin regresión.
