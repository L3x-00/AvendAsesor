# Reporte de campaña RAG con corpus real — 2026-10-13

## 1. Objetivo y regla de esta fase

Ejecutar preguntas reales de docentes contra el corpus disponible, observar el comportamiento integral del RAG y registrar defectos, ambigüedades y riesgos antes de iniciar cualquier corrección.

En esta fase:

- no se corrigió el comportamiento del RAG;
- no se cambió el proveedor ni el modelo de IA;
- no se habilitó navegación por Internet;
- no se modificaron documentos, estados editoriales ni datos de producción;
- no se atribuyen todavía causas raíz: esa investigación comienza después de cerrar las verificaciones autenticadas pendientes.

## 2. Alcance ejecutado

Se ejecutó una campaña automatizada con servicios reales de clasificación, embeddings, recuperación documental y generación del proveedor configurado. El historial se simuló en memoria para evitar crear conversaciones o pendientes en la base real.

La campaña cubrió:

- lenguaje natural, coloquial y con faltas ortográficas;
- preguntas directas, ambiguas, sin módulo y fuera de contexto;
- consultas desde un módulo hacia otro y continuidad conversacional;
- docentes, auxiliares, directivos, contratación, desplazamientos, remuneraciones y situaciones administrativas;
- falta de evidencia, resistencia a instrucciones ajenas al propósito y charla breve;
- citas, páginas, solicitud de enlaces y repetición de documentos;
- respuestas tabulares y orden temporal;
- acceso al historial de otro usuario mediante la simulación de las invariantes de autorización.

## 3. Fotografía del corpus

Lectura realizada antes de la campaña:

| Indicador | Resultado |
| --- | ---: |
| Registros documentales totales | 119 |
| Documentos actuales, activos y no eliminados | 96 |
| Documentos elegibles: disponibles, indexados, con fragmentos y módulo activo | 94 |
| Documentos actuales no elegibles, dejados así intencionalmente | 2 |
| Fragmentos documentales | 1 154 |

Distribución de los 94 documentos elegibles:

| Módulo raíz | Documentos elegibles |
| --- | ---: |
| Contratación y desplazamientos | 41 |
| Remuneraciones | 26 |
| Auxiliar de educación | 21 |
| Situaciones Administrativas | 6 |
| Evaluación docente | 0 |
| Ley y reglamento | 0 |
| Cargos y plazas | 0 |

Los dos documentos no elegibles se mantuvieron en `pending_approval`, sin versión aprobada ni fragmentos:

1. Año 2018: Instructivo para la elaboración y aprobación de la planilla de pagos — Resolución de Secretaría General N.° 121-2018-MINEDU.
2. Año 2017: Norma de registro y control de asistencia — Resolución de Secretaría General N.° 326-2017-MINEDU.

## 4. Resultado automático de la campaña

Se ejecutaron 36 casos y 45 turnos contra el corpus real.

| Veredicto automático | Cantidad |
| --- | ---: |
| PASA | 27 |
| FALLA | 5 |
| REQUIERE_CORPUS | 3 |
| REQUIERE_REVISION | 1 |

Este resultado es técnico, no una aceptación funcional. La revisión humana detectó respuestas problemáticas entre los casos marcados como `PASA`, así como casos marcados `REQUIERE_CORPUS` a pesar de que sí existe documentación disponible e indexada.

| Caso | Veredicto automático | Cobertura principal |
| --- | --- | --- |
| C01 | PASA | Saludo sin activar RAG |
| C02 | PASA | Consulta sin módulo explícito |
| C03 | PASA | Renovación de contrato docente |
| C04 | PASA | Requisitos de auxiliares |
| C05 | FALLA | Reemplazo de director con licencia |
| C06 | PASA | Norma de contratación de auxiliares |
| C07 | PASA | Fuentes y citas de reasignación |
| C08 | PASA | Pregunta sin evidencia documental |
| C09 | PASA | Redirección entre módulos |
| C10 | FALLA | Cambio de tema en una conversación |
| C11 | PASA | Seguimiento dependiente de contexto |
| C12 | PASA | Pregunta ambigua |
| C13 | PASA | Consulta fuera del ámbito |
| C14 | PASA | Historial simulado |
| C15 | PASA | Aislamiento simulado entre usuarios |
| C16 | PASA | Reasignación con errores ortográficos |
| C17 | REQUIERE_CORPUS | Remuneración escrita como “renumeración” |
| C18 | REQUIERE_CORPUS | Tabla cronológica de remuneraciones |
| C19 | REQUIERE_REVISION | Documento y página de incremento 2025 |
| C20 | PASA | “Minuto” solicitado en un PDF |
| PI-01 | REQUIERE_CORPUS | Ley y reglamento |
| PI-02 | PASA | Renovación de contrato y seguimiento |
| PI-03 | PASA | Auxiliares y seguimiento |
| PI-04 | PASA | Separación docente/auxiliares |
| PI-05 | FALLA | Documento nuevo y documento anterior |
| PI-06 | PASA | Consulta sin sustento registrada |
| O01 | PASA | “¿Cuánto gana un profesor en Perú?” |
| O02 | PASA | Variante coloquial sin tildes |
| O03 | FALLA | Sueldo 2025 de 30 horas en tabla |
| O04 | FALLA | Solicitud explícita de enlace exacto |
| R01–R06 | PASA | Pruebas de charla y resistencia básica |

### 4.1 Verificación autenticada posterior

Después de que el Product Owner inició sesión, se ejecutaron nueve comprobaciones adicionales directamente en la aplicación desplegada:

| Caso | Resultado | Evidencia visible |
| --- | --- | --- |
| QA-UI-01 | Parcial | “¿Cuánto gana un profesor en Perú?” se guardó en Remuneraciones y persistió al recargar; respondió S/ 3 300,60 para 30 horas, pero mezcló una RIM histórica de 2022. |
| QA-UI-02 | PASA | La fuente del DS N.° 049-2025-EF abrió un PDF firmado válido con `#page=3`. |
| QA-UI-03 | PASA | Desde Remuneraciones, una pregunta de reasignación creó otro chat, quedó en Contratación y desplazamientos y apareció separada en el Historial después de recargar. |
| QA-UI-04 | FALLA | La tabla salarial se mostró como texto literal con barras y línea separadora, produjo desplazamiento horizontal y no se renderizó como tabla. |
| QA-UI-05 | FALLA | “Dame el enlace…” pidió primero elegir módulo; después de elegir Remuneraciones respondió “no puedo proporcionar enlaces”, aunque mostró una cita enlazable. |
| QA-UI-06 | FALLA | La norma de contratación docente se mostró como `20–21 de 1`; el enlace generado redirigió al PDF con `#page=20`. |
| QA-UI-07 | FALLA | “Documentos disponibles” apareció como 2017, 2025, 2022, 2017 en la consulta salarial; otra respuesta sí apareció 2025, 2023, 2022, 2022. El orden no es estable. |
| QA-UI-08 | FALLA | La consulta exacta por la RSG N.° 326-2017-MINEDU, no disponible, citó una norma disciplinaria y un cronograma de auxiliares sin relación con el control de asistencia. |
| QA-UI-09 | FALLA | La consulta exacta por la RSG N.° 121-2018-MINEDU, no disponible, citó decretos de incrementos de 2019 sin relación con la elaboración de planillas. |

## 5. Observaciones confirmadas

Las prioridades expresan impacto observado, no causa raíz.

| ID | Prioridad | Evidencia observada | Impacto para el usuario final |
| --- | --- | --- | --- |
| OBS-001 | Crítica | C08 y PI-06 emiten `no_evidence`, pero entregan listas de sanciones escolares y pasos para solicitar becas que no provienen de ninguna fuente. | El sistema puede presentar orientación inventada o no comprobada precisamente cuando reconoce que no tiene evidencia. |
| OBS-002 | Crítica | O02 responde que la primera escala gana S/ 2 000,10 y mezcla el monto S/ 2 666,80 de cargos ONDEC/ODEC. Hay documentación disponible de 2025, pero la respuesta usa principalmente 2023 y 2017. | La respuesta corta y coloquial puede comunicar un sueldo desactualizado o aplicable a otro cargo. |
| OBS-003 | Alta | C10 no encuentra evidencia para el Decreto Supremo N.° 074-2019-EF, aunque el documento 2019 está disponible e indexado. | Una consulta normativa exacta se responde como si no correspondiera al ámbito. |
| OBS-004 | Alta | C17 no recupera remuneraciones cuando el usuario escribe “renumeración”; aun así genera afirmaciones generales sobre antigüedad, formación y desempeño. | Una falta ortográfica común impide usar 26 documentos elegibles y además produce orientación no sustentada. |
| OBS-005 | Alta | C18 no recupera ninguna fuente para una tabla cronológica de incrementos. El DS N.° 049-2025-EF está disponible, indexado y contiene una tabla salarial real en la página 3. | Falla la solicitud funcional central de resumir tablas documentales y ordenarlas de lo más nuevo a lo más antiguo. |
| OBS-006 | Alta | O03 recupera el DS N.° 049-2025-EF, página 3, y responde S/ 3 300,60. En la interfaz autenticada, una tabla de cuatro columnas se mostró como Markdown literal con barras y desbordamiento horizontal. | El dato es útil, pero la presentación pedida por el docente no funciona como tabla legible ni conserva una cita dentro de la fila. |
| OBS-007 | Alta | O04 pide expresamente el enlace al documento exacto. En la interfaz primero exige elegir entre Contratación y Remuneraciones; después de elegir Remuneraciones afirma “no puedo proporcionar enlaces”, aunque la misma respuesta contiene una cita enlazable. | La intención de “dame el enlace” no se resuelve y la respuesta contradice una capacidad ya existente en la interfaz. |
| OBS-008 | Alta | PI-02/PI-05 y la interfaz autenticada muestran `Norma del proceso de contratación docente 2026` como `20–21 de 1`. El enlace abre el PDF firmado con `#page=20`. | La ubicación solicitada supera el total declarado y la referencia presenta metadatos internamente contradictorios. |
| OBS-009 | Alta | 22 de los 45 turnos automáticos contienen títulos repetidos. En la interfaz, la renovación docente muestra cinco referencias pero solo tres documentos: el cronograma ocupa tres filas. | La tabla de referencias reitera documentos y reproduce la observación del cliente sobre fuentes duplicadas. |
| OBS-010 | Alta | O02 omite el documento salarial 2025. En la interfaz, “Documentos disponibles” apareció 2017, 2025, 2022, 2017 para una respuesta y 2025, 2023, 2022, 2022 para otra. | El orden de más reciente a más antiguo no se cumple de forma estable. |
| OBS-011 | Media | La pregunta real “¿Cuánto gana un profesor en Perú?” respondió S/ 3 300,60 para 30 horas, pero también incorporó una RIM de S/ 83,34 de 2022 sin distinguirla claramente del valor vigente 2025. | Una respuesta inicialmente clara mezcla un dato actual con otro histórico y puede dejar dudas sobre cuál es la remuneración vigente. |
| OBS-012 | Media | C20 ya no inventa una marca de tiempo y menciona páginas, pero abre con “momentos específicos” y no explica de forma directa que un PDF se ubica por página y no por minuto. | La respuesta es parcialmente correcta, pero no corrige con claridad la unidad equivocada solicitada por el usuario. |
| OBS-013 | Media | C05, “¿Quién reemplaza al director cuando se encuentra de licencia?”, solo pide trámite, condición laboral, año o norma, sin explicar si falta sustento específico. | La aclaración no ayuda al directivo a reformular una pregunta cotidiana y concreta. |
| OBS-014 | Alta | PI-05 pregunta quién aprueba la norma de auxiliares 2026 y recibe una aclaración entre Auxiliar de educación y Contratación y desplazamientos, aunque la propia pregunta identifica el proceso. | La desambiguación interrumpe una intención suficientemente explícita. |
| OBS-015 | Alta | C07, C09, C11 y C16 responden preguntas generales de reasignación concentrándose en emergencia, salud o violencia, sin preguntar primero la causal. | Se presenta un subconjunto especial como si representara los requisitos generales del trámite. |
| OBS-016 | Media | La etiqueta literal “Sugerencias:” aparece en 18 turnos, a menudo seguida de una pregunta genérica. | La respuesta se percibe repetitiva y robotizada, contrario al tono claro, profesional y contextual solicitado. |
| OBS-017 | Media | Varias respuestas recuperan cinco fragmentos del mismo documento o fuentes no citadas en el texto. C03, por ejemplo, mezcla anexos y documentos que no son necesarios para sostener el dato principal. | Aumenta el ruido y reduce la confianza en la selección de evidencia. |
| OBS-018 | Media | R05 y R06 anuncian siete módulos disponibles, pero Evaluación docente, Ley y reglamento y Cargos y plazas no tienen documentos elegibles en la fotografía actual. | El asistente ofrece temas sobre los que después no puede responder con sustento. |
| OBS-019 | Media | R02 rechaza una instrucción ajena al ámbito, pero introduce una explicación sobre información interna y restablecimiento de contraseña que nadie solicitó. | La respuesta es segura, aunque poco natural y desconectada de la consulta. |
| OBS-020 | Alta | El oráculo automático marca C08 y PI-06 como `PASA` pese a su contenido no sustentado; marca C17 y C18 como `REQUIERE_CORPUS` pese a existir corpus de remuneraciones. C20 cambió de `FALLA` a `PASA` entre dos corridas con la misma pregunta. | Los contadores automáticos no pueden utilizarse como aprobación final ni como medida única de calidad. |
| OBS-021 | Resuelto operativo | El bloqueo inicial por la cuenta obsoleta de `.env.qa.local` quedó superado cuando el Product Owner inició una sesión válida en la aplicación. | Permitió completar la verificación real sin crear, restablecer ni modificar cuentas. |
| OBS-022 | Verificado | La redirección real Remuneraciones → Contratación y desplazamientos creó un identificador de chat diferente; al recargar, cada consulta persistió únicamente en su conversación y ambas aparecieron agrupadas bajo su módulo en el Historial. | El flujo de redirección y persistencia funciona en la aplicación desplegada y debe preservarse. |
| OBS-023 | Crítica | Las dos normas dejadas no disponibles fueron consultadas por número y tema exactos. En vez de declarar que no existe sustento disponible, el sistema citó documentos ajenos: disciplina/auxiliares para asistencia y decretos salariales para planillas. | Ante una norma ausente, la respuesta aparenta tener evidencia y puede inducir al docente a confiar en documentos que no responden su pregunta. |
| OBS-024 | Alta | En las tablas autenticadas, “Sección” contiene encabezados y texto corrido como “7 NORMAS LEGALES Jueves 20 de marzo…” o párrafos completos, no el título o subtítulo preciso de ubicación. | El sustento no permite identificar de forma profesional dónde está el artículo y reproduce la primera observación del cliente. |

## 6. Comportamientos útiles observados

La campaña también mostró capacidades que conviene preservar durante futuras correcciones:

- C01, C03, C04 y C06 reconocen correctamente saludos y consultas documentales frecuentes.
- C09 redirige una consulta de reasignación iniciada desde Remuneraciones al módulo de Contratación y desplazamientos, crea una conversación nueva y la asocia al destino en la simulación.
- C11 conserva el contexto de un seguimiento.
- C12 pide precisión ante “¿Cuáles son los requisitos?” y vuelve a pedirla cuando no existe contexto suficiente.
- C13 rechaza una consulta ajena al propósito educativo.
- C15 impide en la simulación que un usuario acceda al historial de otro.
- C16 comprende una consulta de reasignación con errores ortográficos graves y conserva el texto original del usuario.
- C19 identifica el DS N.° 049-2025-EF y la página 2 con una cita técnicamente válida.
- O01 entiende la pregunta literal del cliente y genera una tabla con fuentes, aunque requiere las precisiones registradas en OBS-011.
- O03 recupera el documento 2025, la página 3 y el monto S/ 3 300,60 para 30 horas.
- La redirección autenticada entre módulos, el guardado separado y el Historial funcionaron después de recargar.
- El enlace generado por la aplicación para el DS N.° 049-2025-EF redirigió a un PDF firmado válido con `#page=3`.
- El archivo real del DS N.° 049-2025-EF también se verificó por Storage en modo de solo lectura: HTTP 206, `application/pdf`, cabecera PDF válida, cuatro páginas e indexación completada.

## 7. Verificaciones técnicas complementarias

| Verificación | Resultado |
| --- | --- |
| Campaña real RAG | 36 casos, 45 turnos; ejecución completada |
| Pruebas focalizadas API/RAG/catálogo | 9 suites, 228 pruebas aprobadas |
| Pruebas focalizadas web de chat, fuentes, tablas y enlaces | 6 archivos, 97 pruebas aprobadas |
| Calidad del arnés ampliado | ESLint y Prettier aprobados |
| Acceso directo de solo lectura al PDF 2025 | PDF válido, HTTP 206, 4 páginas |
| Sesión autenticada | Disponible; Product Owner inició sesión |
| Persistencia real y redirección de módulo | Aprobada: chats separados, módulos correctos e Historial persistente |
| Apertura autenticada del enlace y salto a página | Aprobada para DS N.° 049-2025-EF: PDF firmado y `#page=3` |
| Página declarada `20–21 de 1` | Reproducida; el enlace genera `#page=20` |
| Tabla salarial | Reproducida como Markdown literal, no como tabla visual |
| Solicitud explícita de enlace | Reproducida: aclaración innecesaria y posterior negativa contradictoria |
| Orden visual de “Documentos disponibles” | Inconsistente; una respuesta no ordena por año y otra sí |
| Normas intencionalmente no disponibles | Ambas recuperan y citan evidencia ajena en lugar de reconocer la ausencia |

Que las suites técnicas estén verdes confirma que el código satisface sus pruebas actuales; no contradice las observaciones funcionales del corpus real. OBS-020 demuestra que hoy existe una brecha entre ambas capas.

## 8. Evidencias generadas

- Reporte completo de la corrida final: `apps/api/test/acceptance/out/hito3-acceptance-20261013-real-v2.md`.
- Resultado estructurado con preguntas, eventos, fuentes y respuestas: `apps/api/test/acceptance/out/hito3-acceptance-20261013-real-v2.json`.
- Primera corrida de comparación: `apps/api/test/acceptance/out/hito3-acceptance-20261013-real.md` y `.json`.
- Arnés reproducible: `apps/api/test/acceptance/hito3-client-cases.ts`.

Los archivos de salida están ignorados por Git para no versionar respuestas generadas ni datos de ejecución.

## 9. Estado y siguiente paso autorizado

La campaña contra el corpus y las verificaciones autenticadas quedaron ejecutadas. No se corrigió ningún comportamiento. La fase de observación puede considerarse cerrada con 24 observaciones registradas, dos de ellas correspondientes a comportamientos que funcionan y deben preservarse.

El siguiente paso es iniciar, en un documento separado, el análisis de causa raíz de cada observación funcional. Ese análisis debe agrupar síntomas que compartan origen, distinguir fallas de corpus, recuperación, metadatos, generación, renderizado y criterio automático, y proponer el cambio mínimo viable sin alterar la redirección y persistencia ya verificadas.
