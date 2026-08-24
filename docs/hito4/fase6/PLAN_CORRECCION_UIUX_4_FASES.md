# Plan de corrección UI/UX en 4 fases — AVEND ASESOR

**Objetivo:** cumplir **todos los requerimientos del cliente** de la guía visual aprobada
(`Guia_visual_AVEND_ASESOR_para_Alexander_con_paleta.docx`) sobre el frontend ya desplegado,
sin alterar el motor RAG, la base de datos, RLS ni los contratos de seguridad.

**Jefe de desarrollo:** Claude · **Ejecución paralela:** Codex (vía handoffs en `docs/` y `.ai-shared/coordination/`)
**Base de trabajo:** rama `codex/correccion-interfaz-uiux-fase1` (derivada de `codex/hito3-hito4-release`).
**Regla de commits:** `correccion interfaz hitoN: <detalle>` según el área tocada (hito2 admin, hito3 chat/docente, hito4 operación).
**Regla de seguridad:** trabajo en rama; sin push a `main` ni deploy a producción sin autorización explícita del Product Owner.
**Referencia:** [`INVESTIGACION_UIUX_HITO4_FASE6.md`](./INVESTIGACION_UIUX_HITO4_FASE6.md).

---

## Visión general

| Fase | Nombre | Foco | Hito(s) | Estado |
| --- | --- | --- | --- | --- |
| **1** | Sesión y navegación | Logout + jerarquía módulo→submódulo + selección client-side/cache | hito3, hito2 | ✅ IMPLEMENTADA (rama) · pendiente CI/QA |
| **2** | Zona de trabajo y conversación | Título/descripción de módulo, jerarquía tipográfica de respuestas, estados | hito3 | PLANNED |
| **3** | Interactividad y componentes | Micrófono, "Formatos para descargar", responsive fino, microinteracciones | hito3, hito4 | PLANNED |
| **4** | Consistencia, accesibilidad y cierre | Admin consistente, WCAG AA, delay de ingreso (infra), regresión visual, QA 3 roles | hito2, hito4 | PLANNED |

Cada fase cierra con: `typecheck` + `lint` + `test:cov` + `build` en verde, evidencia responsive
(375/768/1024/1440), revisión independiente sin BLOCKER/HIGH, y actualización de memoria + `ESTADO_PROYECTO.md`.

---

## FASE 1 — Sesión y navegación  *(IMPLEMENTADA EN RAMA — pendiente CI/QA)*

**Commits:** `065e79f` (logout en shells docente/admin + barra lateral solo módulos padre),
`1c157fb` (submódulos en zona principal + selección client-side + cache de módulos 120s).

**Requerimientos del cliente que cubre:** guía §3 (orden de módulos), §4 (módulo activo, submódulos en zona principal), §10 (responsive), y el requisito operativo de cerrar sesión.

**Alcance:**
1. **Cerrar sesión** visible dentro de `TeacherShell` y `AdminShell` (form `POST /auth/sign-out`), en barra lateral y menú móvil.
2. **Jerarquía módulo→submódulo:**
   - Barra lateral = solo módulos padre (`parentModuleId === null`) ordenados por `sortOrder`, con el orden aprobado; módulo activo resaltado (bloque celeste + acento lateral).
   - Submódulos (hijos del módulo activo) en la **zona principal**, como chips/tarjetas, con la frase guía y chip de contexto con "X".
   - Eliminar la duplicación de módulos planos en el main.
3. **Rendimiento de navegación:** selección de submódulo client-side (instantánea) y **cache de módulos** (evitar `no-store` en cada navegación) para eliminar el delay al cambiar de módulo.

**Fuera de alcance de Fase 1:** descripción por módulo (requiere campo en el contrato del API → Fase 2), formatos descargables (Fase 3), micrófono (Fase 3).

**Handoff Codex (paralelo):** puede tomar la **auditoría de accesibilidad base** con `ui-ux-pro-max` sobre las pantallas actuales mientras Claude implementa la reestructuración, coordinando en `ACTIVE_TASKS.md` para no tocar los mismos archivos (`teacher-shell.tsx`, `chat-panel.tsx`).

---

## FASE 2 — Zona de trabajo y conversación  *(PLANNED)*

**Requerimientos:** guía §5 (estructura de la zona de trabajo), §6 (diseño de la conversación).

**Alcance:**
- Título del módulo + **descripción breve** en la zona principal (requiere `description` en `ChatModule` / endpoint `/chat/modules` → cambio menor de API a coordinar con backend).
- Orden de la zona de trabajo: título → descripción → submódulos → chip de contexto → conversación → respuesta → referencias → composer.
- **Jerarquía tipográfica de la respuesta:** títulos/frases clave en negrita, cuerpo en negro, observaciones en gris/recuadro suave; azul solo para acentos/enlaces/estados.
- Estados vacío / carga / error / sin-evidencia / aclaración pulidos y consistentes.

**Dependencia:** definir con backend/Codex el campo `description` en el contrato de módulos.

---

## FASE 3 — Interactividad y componentes  *(PLANNED)*

**Requerimientos:** guía §5 (micrófono), §9 (formatos para descargar), §10 (responsive/celular).

**Alcance:**
- **Micrófono** en el composer (dictado por voz, con fallback accesible).
- **"Formatos para descargar":** tarjetas con miniatura Word + icono + nombre en la vista informativa del módulo (depende de que AVEND entregue los archivos; hasta entonces, estado vacío claro).
- **Responsive fino:** submódulos en carrusel/tarjetas desplazables en celular, hamburguesa, chip activo con X; matriz 375/768/1024/1440.
- **Microinteracciones** discretas respetando `prefers-reduced-motion`.

**Dependencia:** archivos Word reales de AVEND para los formatos.

---

## FASE 4 — Consistencia, accesibilidad y cierre  *(PLANNED)*

**Requerimientos:** guía §8 (jerarquía visual), §11 (criterio de implementación) + preparación de Hito 5.

**Alcance:**
- **Consistencia del panel admin** con los mismos tokens, logout, estados y responsive.
- **Auditoría WCAG 2 AA** completa (teclado, lector de pantalla, contraste, foco, movimiento reducido).
- **Delay de ingreso:** decisión de infraestructura (Render keep-warm o plan) + no bloquear primer pintado en datos no críticos.
- **Regresión visual** y evidencia de aceptación; manual visual y base para capacitación (Hito 5).
- **QA autenticada** de los 3 roles (DOCENTE/ADMIN/SUPERADMIN) con evidencia responsive.

---

## Coordinación multiagente

- Reclamo de tareas y áreas en `.ai-shared/coordination/ACTIVE_TASKS.md`; handoffs en `HANDOFF.md`; revisiones en `REVIEWS.md`.
- `IMPLEMENTER != FINAL AUDITOR`: cada fase se revisa de forma independiente antes de marcarse DONE.
- Hallazgos transversales (bugs, inconsistencias, mejoras) se registran en [`HALLAZGOS_UIUX.md`](./HALLAZGOS_UIUX.md).
