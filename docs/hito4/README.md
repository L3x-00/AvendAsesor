# Hito 4 — Historial, operación, seguridad y calidad

## Objetivo

Completar los flujos operativos construidos sobre Hitos 1–3: historial privado
de conversaciones, gestión administrativa de consultas sin sustento, métricas
agregadas, auditoría de acciones sensibles, ajustes RBAC y cierre técnico.

## Límite de alcance vigente

Este hito se construyó **backend y contratos primero**. Posteriormente, el
Product Owner autorizó una fase visual complementaria para consumir únicamente
los contratos ya existentes: historial privado, operación administrativa,
usuarios y auditoría. Esta fase no altera API, base de datos, RLS, proveedores
ni reglas de negocio; mantiene el BFF server-side como único consumidor web de
la API.

Tampoco habilita proveedor de IA, corpus de PDFs, embeddings remotos, secretos
HMAC, presupuesto de IA ni calibración RAG. La Fase 1 de producción ya promovió
el esquema acumulativo; los despliegues API/Web y la QA autenticada son fases
posteriores. La memoria FAQ continúa siendo una señal gobernada y nunca una
fuente de respuestas.

## Fases

| Fase | Resultado principal |
| --- | --- |
| 1 | Gobierno de datos, matriz de permisos, retención, auditoría y contratos H4 |
| 2 | Historial propio: listado paginado, lectura, continuación y baja lógica |
| 3 | Consultas no resueltas, métricas administrativas y operación RAG sin proveedor |
| 4 | Auditoría de seguridad, gestión de usuarios/roles y endurecimiento RBAC |
| 5 | Pruebas integrales, auditoría independiente, documentación y cierre técnico |
| 6 | UI/UX responsive: navegación docente, historial, operación, usuarios y auditoría |

Cada fase requiere pruebas enfocadas, regresión proporcional, revisión
independiente cuando sea posible y su resumen técnico. La promoción de esquema
se hizo con release limpio, respaldo lógico privado, staging y autorización
explícita; no autoriza por sí misma datos QA, proveedor IA/correo ni despliegues
de aplicación. La Fase 6 requiere además evidencia de accesibilidad y de las
interfaces reales antes de cualquier semilla remota.
