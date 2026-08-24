# Hallazgos UI/UX — bugs, inconsistencias y oportunidades de mejora

Documento vivo. Registro de todo lo detectado durante la corrección de interfaz (todas las fases).
Clasificación: 🔴 bug/bloqueo · 🟠 inconsistencia de flujo · 🟡 mejora visual/UX · 🔵 interactividad.

| # | Tipo | Ubicación | Descripción | Fase | Estado |
| --- | --- | --- | --- | --- | --- |
| H-01 | 🔴 | `teacher-shell.tsx`, `admin-shell.tsx` | No hay control de "Cerrar sesión" dentro de la app (solo en la landing `/`). | 1 | ABIERTO |
| H-02 | 🔴 | `teacher-shell.tsx`, `chat-panel.tsx` | Navegación pinta módulos planos; ignora `parentModuleId`/`sortOrder`; no hay submódulos en zona principal (guía §3–§4). | 1 | ABIERTO |
| H-03 | 🟠 | `teacher-shell.tsx` (nav links) | Cambiar de módulo por la barra navega y re-consulta el API con `cache: "no-store"` → delay. | 1 | ABIERTO |
| H-04 | 🟠 | Infra Render + páginas `await listModules()` | Delay al ingresar: cold start de Render (free) + fetch bloqueante de módulos en cada página. | 4 | ABIERTO |
| H-05 | 🟠 | `chat-panel.tsx` + `teacher-shell.tsx` | Los módulos se listan duplicados (barra lateral y zona principal). | 1 | ABIERTO |
| H-06 | 🟡 | `chat-panel.tsx` (composer) | Falta micrófono en la caja de chat (guía §5). | 3 | ABIERTO |
| H-07 | 🟡 | `chat-panel.tsx` (respuesta) | Verificar jerarquía tipográfica de respuestas: negrita solo en títulos, cuerpo negro, gris secundario; azul no invade cuerpo (guía §6). | 2 | ABIERTO |
| H-08 | 🟡 | Vista de módulo | No existe vista informativa del módulo (título+descripción) ni "Formatos para descargar" (guía §5, §9). | 2/3 | ABIERTO |

> Nuevos hallazgos se agregan aquí conforme avanza el desarrollo.
