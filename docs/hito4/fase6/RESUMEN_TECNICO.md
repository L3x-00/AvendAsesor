# Hito 4 — Fase 6: UI/UX, responsive y preparación de piloto

## Propósito

Materializar las superficies web que consumen contratos ya entregados en Hitos
3 y 4, siguiendo la guía visual aprobada de AVEND ASESOR. El foco es claridad
para docentes y profesionales, con texto base legible, navegación predecible,
controles explícitos y movimiento reducido.

## Alcance autorizado

- Shell docente con logo oficial, navegación de módulos configurados, nuevo
  chat, historial, guía y perfil de solo lectura.
- Historial propio de conversaciones con continuación y baja lógica a través
  del BFF server-side existente.
- Panel administrativo con indicadores agregados, cola de consultas pendientes,
  clasificación/revisión y mensajes recuperables.
- Pantalla SUPERADMIN para gestión de rol/estado con motivo obligatorio y tabla
  de auditoría, sin eludir la autorización de API.
- Diseño responsive para barra lateral de escritorio y menú accesible en móvil.

## Límites explícitos

- No se activa proveedor IA, correo, memoria FAQ, ingesta, PDF real, OCR ni
  presupuesto de IA.
- No se crean respuestas, fuentes, métricas de costo ni datos de negocio de
  demostración desde la interfaz.
- La interfaz no otorga permisos: NestJS, Supabase Auth y RLS siguen siendo la
  autoridad para cada lectura o mutación.
- El esquema acumulativo Hitos 3–4, la API y la web ya están en producción con
  respaldo lógico privado previo y staging aislado. El smoke test público
  comprobó salud, CORS y protección de rutas. Las rutas autenticadas requieren
  todavía cuentas QA separadas y no se declaran validadas por este despliegue.

## Verificación local

- `npm run typecheck --workspace=web`: PASS.
- `npm run lint --workspace=web`: PASS.
- `npm run test:cov --workspace=web`: PASS, 98 pruebas y 97.02% de sentencias.
- `npm run build --workspace=web`: compilación de producción completada para
  las rutas incorporadas.
- Navegador local: superficie pública verificada sin error de ejecución ni
  hallazgos WCAG 2 A/AA de axe. La revisión independiente corrigió el contrato
  paginado de historial, la accesibilidad de las regiones vivas y el descarte
  de SSE truncado; no dejó hallazgos BLOCKER ni HIGH.

## Piloto QA de producción

El 24 de agosto de 2026 se ejecutó un piloto controlado de lectura desde el
commit `1898ca5`. Creó tres identidades ficticias confirmadas, siete módulos
identificados y cuatro conversaciones con prompts explícitamente ficticios.
La comprobación autenticada contra la API publicada confirmó la separación de
roles DOCENTE, ADMIN y SUPERADMIN y la visibilidad de los cuatro historiales del
docente. El detalle, límites y limpieza están registrados en
`PILOTO_QA_PRODUCCION_2026-08-24.md`.

La validación visual autenticada y responsive de solo lectura quedó completada
después en el despliegue web `dpl_Ao6LNGnnbmNKgwBFmgv5L7escM7g`, publicado
desde `e492b3e`. La evidencia de DOCENTE, ADMIN y SUPERADMIN, además de los
hallazgos corregidos antes de la prueba, se encuentra en
`VERIFICACION_VISUAL_QA_PRODUCCION_2026-08-24.md`.

## Límites pendientes de aceptación

1. Cierre manual de aceptación de las rutas autenticadas de los tres roles;
   la evidencia API no sustituye la revisión visual del cliente.
2. Elegir staging desechable o retención explícita para probar acciones que
   escriben auditoría append-only: revisión de no resueltas, cambio de rol o
   eliminación de historial.
