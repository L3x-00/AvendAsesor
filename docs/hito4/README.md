# Hito 4 — Historial, operación, seguridad y calidad

## Objetivo

Completar los flujos operativos construidos sobre Hitos 1–3: historial privado
de conversaciones, gestión administrativa de consultas sin sustento, métricas
agregadas, auditoría de acciones sensibles, ajustes RBAC y cierre técnico.

## Límite de alcance vigente

Este hito es **backend y contratos primero**. Por decisión del Product Owner,
el trabajo visual y responsive se realizará después de su cierre; por ello no
se adelantan nuevas pantallas, rediseños ni componentes visuales en las fases
actuales. Las APIs conservan contratos consumibles posteriormente por una
interfaz responsive y accesible.

Tampoco habilita proveedor de IA, corpus de PDFs, embeddings remotos, secretos
HMAC, presupuesto de IA, calibración RAG ni cambios de producción. La memoria
FAQ continúa siendo una señal gobernada y nunca una fuente de respuestas.

## Fases

| Fase | Resultado principal |
| --- | --- |
| 1 | Gobierno de datos, matriz de permisos, retención, auditoría y contratos H4 |
| 2 | Historial propio: listado paginado, lectura, continuación y baja lógica |
| 3 | Consultas no resueltas, métricas administrativas y operación RAG sin proveedor |
| 4 | Auditoría de seguridad, gestión de usuarios/roles y endurecimiento RBAC |
| 5 | Pruebas integrales, auditoría independiente, documentación y cierre técnico |

Cada fase requiere pruebas enfocadas, regresión proporcional, revisión
independiente cuando sea posible y su resumen técnico. El cierre solo se
considerará local hasta pasar el gate de release limpio, respaldo, staging y
autorización explícita de producción.
