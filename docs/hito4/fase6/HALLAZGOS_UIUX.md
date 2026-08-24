# Hallazgos UI/UX — bugs, inconsistencias y oportunidades de mejora

Documento vivo. Registro de todo lo detectado durante la corrección de interfaz (todas las fases).
Clasificación: 🔴 bug/bloqueo · 🟠 inconsistencia de flujo · 🟡 mejora visual/UX · 🔵 interactividad.

| # | Tipo | Ubicación | Descripción | Fase | Estado |
| --- | --- | --- | --- | --- | --- |
| H-01 | 🔴 | `teacher-shell.tsx`, `admin-shell.tsx` | No hay control de "Cerrar sesión" dentro de la app (solo en la landing `/`). | 1 | ✅ RESUELTO (`065e79f`) |
| H-02 | 🔴 | `teacher-shell.tsx`, `chat-panel.tsx` | Navegación pinta módulos planos; ignora `parentModuleId`/`sortOrder`; no hay submódulos en zona principal (guía §3–§4). | 1 | ✅ RESUELTO (`065e79f`+`1c157fb`) |
| H-03 | 🟠 | `teacher-shell.tsx`, `chat-api/client.ts` | Cambiar de módulo re-consultaba el API con `no-store` → delay. | 1 | 🟡 MITIGADO: submódulos client-side + cache de módulos (120s); cold start de Render pendiente (H-04). |
| H-04 | 🟠 | Infra Render + páginas `await listModules()` | Delay al ingresar: cold start de Render (free) + fetch bloqueante en cada página. | 4 | ABIERTO |
| H-05 | 🟠 | `chat-panel.tsx` + `teacher-shell.tsx` | Los módulos se listaban duplicados (barra lateral y zona principal). | 1 | ✅ RESUELTO (`1c157fb`) |
| H-06 | 🔵 | `chat-panel.tsx` (composer) | Micrófono en la caja de chat (guía §5). | 3 | ✅ RESUELTO (`7ab855a`) — dictado por voz con Web Speech API, detectado y accesible; carrusel móvil + microinteracciones incluidos. |
| H-10 | 🟡 | Vista de módulo | "Formatos para descargar" (guía §9) requiere los archivos Word de AVEND y definir dónde vive su metadata (campo API o listado de Storage). | 3 | BLOQUEADO — a la espera de insumos de AVEND. |
| H-07 | 🟡 | `chat-panel.tsx` (respuesta) | Jerarquía tipográfica de respuestas: negrita solo en frases clave, cuerpo negro, gris secundario; azul no invade cuerpo (guía §6). | 2 | ✅ RESUELTO (`765393b`) — pendiente revisión visual con respuestas RAG reales. |
| H-08 | 🟡 | Vista de módulo | Falta título+descripción del módulo y "Formatos para descargar" (guía §5, §9). | 2/3 | PARCIAL: título (F1) + descripción end-to-end (`b4e9a05`). "Formatos" en F3. Requiere datos QA con descripciones/submódulos → Codex Tarea B (`HANDOFF.md`). |
| H-09 | 🟡 | Datos / admin | Al cambiar el catálogo de módulos, el cache de 120s puede mostrar la lista vieja hasta 2 min; conviene `revalidateTag('chat-modules')` en las mutaciones admin de módulos. | 2/4 | ABIERTO |

> Nuevos hallazgos se agregan aquí conforme avanza el desarrollo.
