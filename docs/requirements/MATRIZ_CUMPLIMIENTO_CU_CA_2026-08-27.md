# Matriz de cumplimiento de casos de uso y criterios de aceptación

**AVEND ASESOR — Primera etapa**

**Actualización técnica:** 2026-08-28

**Documento de referencia:** *Casos de uso y criterios de aceptación — AVEND ASESOR, Primera etapa*.

## 1. Resultado ejecutivo

El código que habilita CU-01…CU-15 está integrado en `main`. El cierre se publicó de forma ordenada: primero el contrato API (`5872065`, PR #8) y luego la web (`ba4e881`, PR #9). La web de producción quedó `Ready` en Vercel como `dpl_FkCcjj3EdSDDq4uB49peEA1AZzkM`; el API y su dependencia Supabase respondieron `200` en `/health/ready`.

La liberación técnica no equivale a la aceptación contractual. Producción no contiene corpus normativo, documentos, fuentes, chunks ni vectores reales. Por ello las pruebas PI-01…PI-06 con Ley y Reglamento, Contrato Docente y Contratación de Auxiliares de Educación, así como la aprobación del cliente, permanecen pendientes. No se fabricó sustento normativo para convertir esa dependencia de datos en un falso PASS.

## 2. Evidencia consolidada del release

| Puerta | Resultado |
| --- | --- |
| Git / integración | PR #8 y PR #9 fusionados en `main`; producto en `ba4e881` |
| API | lint, typecheck y build PASS; 51 suites / 261 pruebas; 26 E2E; cobertura 94.71% statements, 80.39% branches, 95.79% functions, 96.05% lines |
| Web | lint, typecheck y build Turbopack PASS; 29 archivos / 173 pruebas; cobertura 92.34% statements, 83.82% branches, 93.39% functions, 94.07% lines |
| Base de datos | 12 archivos / 292 pgTAP PASS; historial local/remoto 31/31 tras aplicar las dos migraciones pendientes |
| CU-14 | `ORIENTATION_TRACE=PASS` (9 entradas runtime y 7 fuentes); PDF real generado en runtime standalone aislado; producción pasó de error de módulo a rechazo CORS esperado `403` |
| Producción | inicio de sesión `200`; API readiness `200`; chat autenticado desktop/móvil PASS; historial QA de lectura PASS; sin errores Vercel posteriores al despliegue |
| Dependencias | `npm audit --omit=dev`: 0 vulnerabilidades |
| Revisión independiente | Claude Code `claude-opus-4-8`: GO; 0 BLOCKER, 0 HIGH y 0 MEDIUM tras correcciones |

## 3. Leyenda

| Columna | Valores |
| --- | --- |
| Código | `MAIN`: integrado; `PARCIAL`: requiere trabajo funcional adicional |
| Test determinista | `PASS`: comprobación automatizada; `PARCIAL`: existe proxy, pero la calidad depende de datos/modelo |
| Producción técnica | `SMOKE`: recorrido observado; `DEPLOY`: artefacto publicado sin recorrido mutante/real completo; `PEND`: no demostrable sin datos |
| Corpus real | `PEND`: requiere corpus/proveedor; `N/A`: no depende de corpus |
| Cliente | `PEND`: requiere validación formal del Product Owner/cliente |

## 4. Trazabilidad por criterio de aceptación

### CU-01 — Ingreso y nueva consulta

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-01.CA-1 Nueva consulta visible y comprensible | MAIN | PASS | SMOKE | N/A | PEND | `TeacherShell`, `ChatPanel`; visible en chat autenticado |
| CU-01.CA-2 Escribir y enviar mensaje | MAIN | PASS | DEPLOY | PEND | PEND | compositor, SSE/BFF y límites probados; no se creó una consulta productiva sin corpus |
| CU-01.CA-3 Sin bloqueos ni pasos innecesarios | MAIN | PASS | SMOKE | N/A | PEND | acceso autenticado directo a `/chat`; feedback de carga y error |
| CU-01.CA-4 Diseño adaptable | MAIN | PASS | SMOKE | N/A | PEND | CSS responsive, 44 px, menú móvil y viewport 390×844 |

### CU-02 — Consulta libre sin seleccionar proceso

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-02.CA-1 Enviar sin proceso | MAIN | PASS | DEPLOY | PEND | PEND | `selectedModuleId` nullable y prueba integrada Chat+RAG |
| CU-02.CA-2 Inferir razonablemente el tema | MAIN | PARCIAL | PEND | PEND | PEND | enrutamiento global probado con dobles; falta calibración real |
| CU-02.CA-3 Usar documentación pertinente | MAIN | PARCIAL | PEND | PEND | PEND | filtro/ranking probado; no hay documentos reales |
| CU-02.CA-4 Pedir precisión ante ambigüedad | MAIN | PASS | DEPLOY | PEND | PEND | rama `ambiguous`, orientación inicial y proveedor no invocado |

### CU-03 — Consulta desde un proceso seleccionado

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-03.CA-1 Asociar proceso a la consulta | MAIN | PASS | DEPLOY | PEND | PEND | módulo persistido por conversación |
| CU-03.CA-2 No mezclar documentación | MAIN | PASS | PEND | PEND | PEND | filtro duro por módulo y proxy Contrato/Auxiliares |
| CU-03.CA-3 Continuar en el mismo contexto | MAIN | PASS | PEND | PEND | PEND | contexto persistido y acotado; falta conversación real |

### CU-04 — Conversación natural con pregunta aclaratoria

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-04.CA-1 No limitarse a preguntar | MAIN | PASS | PEND | PEND | PEND | aclaración incluye orientación inicial basada en evidencia |
| CU-04.CA-2 Orientación inicial sustentada | MAIN | PARCIAL | PEND | PEND | PEND | contrato de fuentes probado; calidad depende del corpus |
| CU-04.CA-3 Pregunta aclaratoria pertinente | MAIN | PARCIAL | PEND | PEND | PEND | estructura y módulos candidatos probados; naturalidad requiere evaluación real |
| CU-04.CA-4 No repetir datos | MAIN | PARCIAL | PEND | PEND | PEND | historial se entrega acotado; conducta generada requiere PI real |

### CU-05 — Conservación del contexto

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-05.CA-1 No solicitar datos repetidos | MAIN | PARCIAL | PEND | PEND | PEND | contexto llega al proveedor; respuesta real pendiente |
| CU-05.CA-2 Mantener proceso y datos relevantes | MAIN | PASS | PEND | PEND | PEND | RPC de contexto, límites y prueba integrada |
| CU-05.CA-3 Coherencia entre mensajes | MAIN | PARCIAL | PEND | PEND | PEND | persistencia PASS; coherencia semántica requiere proveedor/corpus |

### CU-06 — Cambio de tema

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-06.CA-1 Detectar cambio | MAIN | PASS | PEND | PEND | PEND | margen de score y nueva conversación probados |
| CU-06.CA-2 Fuentes del nuevo proceso | MAIN | PASS | PEND | PEND | PEND | proxy exacto Contrato Docente/Auxiliares |
| CU-06.CA-3 No arrastrar información incorrecta | MAIN | PASS | PEND | PEND | PEND | reinicio de contexto y ausencia de fuentes anteriores |

### CU-07 — Respuesta sustentada mediante RAG

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-07.CA-1 Relación directa con la consulta | MAIN | PARCIAL | PEND | PEND | PEND | recuperación determinista; relevancia real pendiente |
| CU-07.CA-2 Información verificable | MAIN | PARCIAL | PEND | PEND | PEND | respuestas y citas se vinculan a chunks; falta corpus real |
| CU-07.CA-3 Sin afirmaciones relevantes sin sustento | MAIN | PASS | PEND | PEND | PEND | prompt evidence-only y salida fail-closed |
| CU-07.CA-4 Redacción comprensible | MAIN | PARCIAL | PEND | PEND | PEND | política en español claro; evaluación humana pendiente |

### CU-08 — Citas y fuentes verificables

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-08.CA-1 Referencia seleccionable | MAIN | PASS | PEND | PEND | PEND | enlace BFF protegido; no existe fuente productiva para abrir |
| CU-08.CA-2 Documento de origen identificado | MAIN | PASS | PEND | PEND | PEND | título y versión en contrato de cita |
| CU-08.CA-3 Página/artículo/numeral/sección | MAIN | PASS | PEND | PEND | PEND | metadatos completos renderizados cuando existen |
| CU-08.CA-4 Fuente respalda la afirmación | MAIN | PARCIAL | PEND | PEND | PEND | integridad estructural PASS; validación semántica pendiente |
| CU-08.CA-5 Revisar fuente sin perder continuidad | MAIN | PASS | PEND | PEND | PEND | apertura en pestaña nueva y URL firmada 60 s |

### CU-09 — Consulta sin sustento suficiente

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-09.CA-1 Indicar insuficiencia | MAIN | PASS | DEPLOY | PEND | PEND | resultado `no_evidence` determinista |
| CU-09.CA-2 No inventar | MAIN | PASS | DEPLOY | PEND | PEND | proveedor no se invoca sin evidencia |
| CU-09.CA-3 Registrar para revisión | MAIN | PASS | DEPLOY | PEND | PEND | `insufficient_evidence` persistido atómicamente |
| CU-09.CA-4 Diferenciar respaldado/no confirmado | MAIN | PARCIAL | PEND | PEND | PEND | prompt obliga a declarar insuficiencia parcial; falta ejemplo real mixto |

### CU-10 — Registro e historial

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-10.CA-1 Visualizar consultas anteriores | MAIN | PASS | SMOKE | N/A | PEND | cuatro conversaciones QA visibles en `/history` |
| CU-10.CA-2 Abrir y revisar contenido | MAIN | PASS | DEPLOY | N/A | PEND | enlace protegido y detalle por propietario |
| CU-10.CA-3 Identificación clara | MAIN | PASS | SMOKE | N/A | PEND | título y fecha localizados |
| CU-10.CA-4 No mezclar conversaciones | MAIN | PASS | DEPLOY | N/A | PEND | ownership, cursores e IDs independientes |

### CU-11 — Gestión de procesos

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-11.CA-1 Sección de gestión | MAIN | PASS | DEPLOY | N/A | PEND | `/admin/modules` protegido |
| CU-11.CA-2 Crear y editar | MAIN | PASS | DEPLOY | N/A | PEND | incluye descripción 2–500 y limpieza a `null`; no se mutó producción |
| CU-11.CA-3 Activar/desactivar | MAIN | PASS | DEPLOY | N/A | PEND | API, Server Action y auditoría probadas |
| CU-11.CA-4 Reflejo sin editar código | MAIN | PASS | DEPLOY | N/A | PEND | `updateTag("chat-modules")` sólo tras escritura exitosa |

### CU-12 — Carga y asociación de documentos

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-12.CA-1 Archivo cargado correctamente | MAIN | PASS | DEPLOY | PEND | PEND | validación PDF, Storage privado y compensación probados |
| CU-12.CA-2 Asociar al proceso | MAIN | PASS | DEPLOY | PEND | PEND | RPC restringido y panel administrativo |
| CU-12.CA-3 Conservar relación | MAIN | PASS | DEPLOY | PEND | PEND | contratos PostgreSQL y gateway |
| CU-12.CA-4 Disponible en consulta tras procesar | MAIN | PARCIAL | PEND | PEND | PEND | worker/retrieval por componentes; falta pipeline real |
| CU-12.CA-5 Administrador identifica estado | MAIN | PASS | DEPLOY | N/A | PEND | pending/processing/indexed/failed y fecha Lima por versión |

### CU-13 — Ampliación de la base documental

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-13.CA-1 Incorporar desde administración | MAIN | PASS | DEPLOY | PEND | PEND | nueva versión PDF desde panel |
| CU-13.CA-2 Recuperar nuevo documento | MAIN | PARCIAL | PEND | PEND | PEND | proxy de nueva versión; falta Storage→worker→vector real |
| CU-13.CA-3 Documentación anterior continúa | MAIN | PASS | PEND | PEND | PEND | versiones inmutables y prueba de recuperabilidad |
| CU-13.CA-4 No alterar otros procesos | MAIN | PASS | PEND | PEND | PEND | consulta de Contrato permanece aislada tras incorporar otra fuente |

### CU-14 — Generación de documento

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-14.CA-1 Acción aparece cuando corresponde | MAIN | PASS | PEND | PEND | PEND | exige respuesta asistente con cita y pregunta enlazada; producción no tiene fuentes |
| CU-14.CA-2 Reutilizar datos conocidos | MAIN | PASS | PEND | PEND | PEND | question/answer confiables llegan a la vista previa |
| CU-14.CA-3 Revisar antes de descargar | MAIN | PASS | DEPLOY | PEND | PEND | vista previa protegida y campos de presentación |
| CU-14.CA-4 Descargar formatos previstos | MAIN | PASS | DEPLOY | PEND | PEND | DOCX/PDF binarios reales en tests; runtime Vercel carga sin 500; falta mensaje fuente real |
| CU-14.CA-5 Datos correctos en documento | MAIN | PASS | PEND | PEND | PEND | parseo binario, XML, metadatos, glifos y fuentes validados |

La implementación actual genera una **ficha de orientación informativa**, no un acto administrativo oficial. El Product Owner debe confirmar que esta primera plantilla satisface el alcance de “documento o formato relacionado” antes de aprobar CU-14.

### CU-15 — Gestión de usuarios y roles

| Criterio | Código | Test | Producción | Corpus | Cliente | Evidencia / límite |
| --- | --- | --- | --- | --- | --- | --- |
| CU-15.CA-1 Visualizar usuarios previstos | MAIN | PASS | DEPLOY | N/A | PEND | listado exclusivo de SUPERADMIN |
| CU-15.CA-2 Permisos según rol | MAIN | PASS | DEPLOY | N/A | PEND | DOCENTE/ADMIN/SUPERADMIN cubiertos |
| CU-15.CA-3 Sin permiso no accede | MAIN | PASS | DEPLOY | N/A | PEND | guards API, frontera web y RLS/RPC |
| CU-15.CA-4 Cambios reflejados | MAIN | PASS | DEPLOY | N/A | PEND | estado/rol, motivo, salvaguarda y auditoría append-only |

La gestión de usuarios y roles es conservadoramente exclusiva de **SUPERADMIN**. `ADMIN` administra módulos, documentos y operación, pero no hereda superadministración. Esta separación está definida en `docs/requirements/CONTEXTO_GENERAL.md` y `docs/requirements/alcance.md`.

## 5. Pruebas integrales PI-01…PI-06

| PI | Proxy determinista | Producción con corpus real | Cliente | Pendiente exacto |
| --- | --- | --- | --- | --- |
| PI-01 Ley y Reglamento | PARCIAL | PEND | PEND | ingerir corpus, consultar, abrir cita y continuar contexto |
| PI-02 Contrato Docente | PARCIAL | PEND | PEND | inferencia libre, aclaración y sustento real |
| PI-03 Auxiliares de Educación | PARCIAL | PEND | PEND | corpus de Auxiliares y recorrido conversacional real |
| PI-04 Procesos similares | PASS como proxy Contrato/Auxiliares | PEND | PEND | calibrar clasificación y no-mezcla con documentos reales |
| PI-05 Nueva documentación | PARCIAL | PEND | PEND | carga→Storage→worker→indexed→consulta en un recorrido |
| PI-06 Sin sustento | PASS como proxy fail-closed | PEND | PEND | ejecutar pregunta fuera del corpus real y revisar registro administrativo |

## 6. Estado de la compuerta de liberación

| Compuerta | Estado |
| --- | --- |
| Integración de código en `main` | PASS |
| Lint, typecheck, unit/integración, E2E y builds | PASS |
| pgTAP y migraciones requeridas | PASS |
| Revisión independiente sin BLOCKER/HIGH/MEDIUM | PASS |
| Vercel/Render/Supabase técnicamente disponibles | PASS |
| Smoke CU-14 sin error de carga serverless | PASS |
| Corpus normativo autorizado e indexado | PEND |
| PI-01…PI-06 con datos/proveedor reales | PEND |
| Descarga DOCX/PDF desde una respuesta real con cita | PEND |
| Aceptación formal del cliente | PEND |

## 7. Conclusión

La primera etapa está **implementada, integrada, probada determinísticamente y desplegada en su dimensión técnica**. No puede declararse todavía **aceptada funcionalmente por el cliente** porque faltan los documentos normativos autorizados, la ejecución de PI-01…PI-06 con ese corpus y la conformidad formal. Esta distinción es parte del criterio de calidad del proyecto.
