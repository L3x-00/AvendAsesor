# Fase 4 — Auditoría de accesibilidad, QA y consistencia + mitigación del delay

Rama: `codex/correccion-interfaz-uiux-fase1`. Fase 4 es **verificación**, no reescritura: el panel admin
y los shells ya están construidos de forma consistente y accesible a nivel de código. Aquí se separa lo
ya verificado por lectura, lo que requiere el deploy, y las acciones sin costo.

## 1. Accesibilidad verificada por código (✔)

- **Skip link** ("Saltar al contenido principal") en shell docente y admin.
- **`aria-current="page"`** en la navegación (módulo activo, sección admin).
- **Labels asociados** (`label`+`htmlFor`/`id`) en formularios de auth, chat y SUPERADMIN; `required`,
  `minLength`/`maxLength` en el motivo de cambios.
- **Estructura de encabezados** correcta (h1 por página, h2/h3 en secciones).
- **`:focus-visible`** con contorno de 3px en toda la app.
- **Regiones vivas**: progreso en `aria-live="polite"`, errores en región `role="alert"` (Fase 2).
- **Movimiento**: microinteracciones bajo `prefers-reduced-motion: no-preference`; animación del
  micrófono desactivada con `reduce`.
- **Objetivos táctiles** ≥ 44px (botones, micrófono `min-height: 2.75rem`).
- **Tablas** de referencias y auditoría con `thead`/`th` semánticos.

## 2. Pendiente de verificar en el deploy (requiere render)

- Contraste real AA de todos los estados (celeste sobre navy, gris secundario, error rojo).
- Recorrido **solo teclado** sin trampas de foco (logout, submódulos, micrófono, selects SUPERADMIN,
  menú móvil `<details>`).
- **Lector de pantalla**: nombres accesibles de iconos-solo, orden de lectura, anuncios de estado.
- **Matriz responsive** 375 / 768 / 1024 / 1440 (barra→hamburguesa, submódulos en carrusel, tablas con
  scroll horizontal sin desbordar el body).

→ Esto lo cubre la **Tarea A de Codex** (revisión independiente, `HANDOFF.md`) + tu revisión con la
`GUIA_REVISION_VISUAL_FASES_1_3.md`. Los hallazgos reales se corrigen en la misma rama.

## 3. Delay de ingreso (H-04) — mitigación SIN costo

Causa dominante: **cold start del API en Render (plan free)**, que se apaga tras ~15 min de inactividad.
No requiere pagar:

- Configurar un **pinger externo gratuito** (UptimeRobot, cron-job.org o similar) que haga GET a
  `https://avend-asesor-api.onrender.com/health` cada ~10 minutos en horario de uso. Mantiene el
  contenedor "tibio" y elimina la espera de arranque en el login.
- En el front ya se cachean los módulos (120s), así que la navegación entre módulos no vuelve a golpear
  al API.
- No hay solución 100% en free sin un pinger; el sleep de Render es inherente al plan gratuito.

## 4. QA autenticada de los 3 roles

Usar las cuentas existentes (una por rol, ya confirmadas en producción):

| Rol | Correo | Debe poder | NO debe poder |
| --- | --- | --- | --- |
| DOCENTE | `qa-docente-hito4-20260824@avend.invalid` | Chat, historial, guía, perfil, cerrar sesión | Entrar a `/admin` (redirige a acceso denegado) |
| ADMIN | `qa-admin-hito4-20260824@avend.invalid` | Panel, operación, módulos, documentos, consultas no resueltas | Ver "Usuarios y auditoría" (solo SUPERADMIN) |
| SUPERADMIN | `qa-superadmin-hito4-20260824@avend.invalid` | Todo lo de ADMIN + gestión de usuarios/roles con motivo + auditoría | Auto-suspenderse / quitarse el rol (salvaguarda) |

Contraseña: script local `Copy-QAPilotPassword.ps1`. Registrar evidencia por rol y ancho.

## 5. Consistencia del panel admin (✔ a nivel de código)

`AdminShell` compartido, mismos tokens de paleta, logout en barra y móvil (Fase 1), estados vacío/carga,
tablas con scroll. Consistencia visual final se confirma en el paso 2.

## Cierre de Fase 4

Fase 4 se marca DONE cuando: (a) la revisión visual + Codex Tarea A no dejan hallazgos BLOCKER/HIGH,
(b) la QA de los 3 roles pasa con evidencia, (c) el pinger de Render está activo. El código base de
accesibilidad/consistencia ya está; lo que falta es ejecutar la verificación.
