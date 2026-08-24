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
- La Fase 1 ya promovió el esquema acumulativo Hitos 3–4 en producción con
  respaldo lógico privado y staging aislado. Las rutas Hito 4 aún no se prueban
  contra producción porque el despliegue API/Web y las cuentas QA pertenecen a
  las fases siguientes.

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

## Pendiente de cierre

1. Pruebas de interfaces autenticadas con cuentas desechables y evidencia
   responsive para historial, operación y SUPERADMIN.
2. Definir la operación remota separada para semilla ficticia y cuentas de
   prueba, sin usar ni registrar credenciales expuestas.
3. Despliegue controlado de API y Web desde el lote productivo exacto; validar
   salud, CORS y rutas públicas antes de mostrar estas superficies en
   producción.
