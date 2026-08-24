# Hito 4 — Fase 1: gobierno de datos y contratos operativos

## Objetivo

Convertir el alcance amplio de Hito 4 en contratos seguros antes de añadir
endpoints, migraciones o superficies administrativas.

## Hallazgos del estado actual

- Hito 3 ya implementa un historial mínimo de propietario: listado, lectura y
  continuación por RPC; falta paginación por cursor y una operación explícita
  de baja lógica solicitada por los requisitos.
- `unanswered_questions` ya conserva la pregunta, motivo y estado de revisión,
  pero no existe todavía una cola administrativa ni clasificación/resolución
  trazable.
- Existen eventos de auditoría documental y revisiones FAQ append-only, pero
  falta un contrato transversal para acciones administrativas de Hito 4.
- Los roles son un enum fijo. La documentación exige gestión de usuarios y
  roles para SUPERADMIN, sin dar a ADMIN esas facultades por defecto.
- No hay datos ni proveedor para medir consumo IA. Las métricas iniciales deben
  ser agregadas y declarar explícitamente cualquier dimensión no configurada.

## Decisiones de Fase 1

1. **Historial:** una eliminación del docente será baja lógica de la
   conversación; deja de ser visible/continuable para su dueño y no borra en
   cascada mensajes, fuentes ni hechos de auditoría. No se implementa purga.
2. **Mínimo privilegio administrativo:** ADMIN solo revisa y clasifica la
   consulta no resuelta necesaria para operar. SUPERADMIN controla usuarios,
   roles, estados y auditoría global. Ningún rol recibe acceso directo de
   navegador a tablas/RPCs.
3. **Auditoría:** los eventos tendrán actor, tipo, recurso, resultado,
   correlación y metadatos minimizados; no copiarán contraseñas, tokens,
   respuestas RAG ni cuerpos completos de chat.
4. **Métricas:** se calcularán mediante consultas/RPCs acotadas, por rango y
   con contadores agregados. Proveedor, costo y calibración son no configurados
   hasta contar con evidencia real.
5. **UI:** responsive/visual se difiere por la instrucción vigente. Esta fase
   entrega contratos estables, no interfaces anticipadas.

## Plan de implementación siguiente

- Fase 2 amplía el contrato de historial con cursor seguro y baja lógica.
- Fase 3 añade la cola de consultas sin sustento, clasificación y métricas.
- Fase 4 añade gestión controlada de usuarios/roles y auditoría transversal.
- Fase 5 ejecuta regresión completa y revisión independiente antes de proponer
  un release limpio.

## Fuera de alcance

- Proveedor IA, PDFs de prueba/reales, ingestion worker, embeddings remotos,
  calibración, HMAC, presupuesto, despliegues, secretos, cambios remotos,
  purgas físicas y nuevas pantallas visuales.

