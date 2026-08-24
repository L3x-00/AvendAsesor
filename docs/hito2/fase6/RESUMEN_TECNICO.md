# Fase 6 — Aceptación local, regresión y cierre técnico

## Objetivo

Cerrar el Hito 2 contra evidencia local reproducible: CA-04, CA-05, control de roles, privacidad de Storage, límite PDF, versión inmutable, interfaz BFF, regresión de Hito 1, calidad, dependencias y ausencia de datos de negocio persistentes. No autoriza staging, despliegue, proveedores remotos, RAG, OCR, extracción, vectores, DOCX/TXT/imágenes ni rediseño visual.

## Matriz de aceptación

| Área | Evidencia exigida | Criterio |
| --- | --- | --- |
| CA-04 — módulos | `Test-LocalModulesApi.ps1` | ADMIN crea, actualiza, ordena, desactiva y elimina lógicamente; DOCENTE no accede ni a API ni a Data API. |
| CA-05 — documentos PDF | `Test-LocalDocumentsApi.ps1 -ResetAfter` | PDF real, límites, metadatos, asociación, versión, estado, baja lógica y conservación de historial. |
| Roles y acceso web | `Test-LocalAdminWeb.ps1` | Anónimo redirigido, ADMIN usa páginas BFF y DOCENTE queda bloqueado. |
| Privacidad | `Test-LocalDocumentSecurity.ps1` | No hay acceso directo a tablas ni carga Storage desde una sesión autenticada ordinaria. |
| Hito 1 sin regresión | `Test-LocalAuthRls.ps1` y salud del proyecto | Registro, confirmación local, login, recuperación, sesión y RLS conservan su contrato. |
| Base e integridad | pgTAP, advisors e historial | Migraciones locales aplicables, 70+ contratos de datos y sin recomendaciones de advisors. |
| Calidad | cobertura, health check, auditoría y diff | Tipos, lint, pruebas, E2E, build, dependencias de producción sin vulnerabilidades altas y diff sin espacios inválidos. |
| Entorno limpio | comprobación posterior al reset local | Sin módulos, documentos, versiones, enlaces, auditoría ni objetos de Storage persistentes de la regresión. |

## Ejecutor de cierre

`Test-LocalHito2Closure.ps1 -AllowLocalReset` coordina toda la matriz. Rechaza destinos Supabase no loopback, busca puertos web libres, ejecuta el reset únicamente mediante el parámetro explícito y detiene solo procesos iniciados por sus pruebas. El reset es necesario para no dejar PDFs/documentos de prueba en la base local.

## Condición de cierre

La Fase 6 y el Hito 2 solo pueden declararse `DONE` si cada bloque de la matriz aprueba, una revisión independiente no deja hallazgos `BLOCKER` o `HIGH` abiertos y los documentos de control registran evidencia real. La idempotencia persistente de reintentos sigue siendo una mejora futura registrada; no bloquea el flujo actual porque la interfaz no reintenta automáticamente y exige revisión manual ante un resultado ambiguo.

## Resultado de cierre — 2026-08-09

`Test-LocalHito2Closure.ps1 -AllowLocalReset` aprobó tras aplicar todas las seis migraciones locales. La ejecución confirmó 70 contratos pgTAP, advisors sin incidencias, CA-04, CA-05, Auth/RLS, privacidad de Storage, la frontera BFF ADMIN/DOCENTE, cobertura, E2E, build, auditoría de dependencias y diff limpio.

El ejecutor exige `-AllowLocalReset`, comprueba herramientas y scripts requeridos, fija el destino a loopback `:55321`, busca puertos web libres sin ocultar errores y verifica tablas/bucket vacíos después del reset documental y al terminar. No guarda ni imprime secretos; la clave de servicio local se mantiene solamente en la memoria de un proceso Node efímero imprescindible para verificar la limpieza y los privilegios del entorno de prueba.

Claude Code Haiku revisó el script inicial y su versión corregida. Los hallazgos de barrera local, limpieza y preflight se resolvieron; no quedó BLOCKER ni HIGH. El Hito 2 queda cerrado **solo para aceptación local**. Staging, despliegue, dominio/correo remoto e idempotencia persistente no se han ejecutado ni se presumen aprobados.

## Promoción de esquema remoto autorizada — 2026-08-22

La promoción posterior se limitó al esquema Hito 2 desde el release limpio
`c057d87`. El dry-run y la ejecución registraron solo las cinco migraciones
pendientes de Hito 2; el historial remoto y los asesores de Supabase se
verificaron inmediatamente después sin incidencias. Esta evidencia habilita el
esquema productivo para el código Hito 2 ya publicado, pero no convierte la
aceptación local previa en aceptación contractual ni habilita Hito 3.
