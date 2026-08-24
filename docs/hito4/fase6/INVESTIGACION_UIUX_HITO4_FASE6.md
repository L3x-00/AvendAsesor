# Investigación UI/UX — Frontend implementado vs. Guía visual aprobada

**AVEND ASESOR · apps/web · Hito 4 / Fase 6**
**Autor:** Jefe de desarrollo (Claude) · **Fecha:** 2026-08-24
**Fuente de verdad visual:** `Guia_visual_AVEND_ASESOR_para_Alexander_con_paleta.docx`
**Método:** lectura directa del código en `D:\AvendAsesor\apps\web` + guía visual + `docs/`. Sin cambios de backend/DB.

---

## 1. Resumen ejecutivo

El shell docente está construido, es accesible y usa la paleta correcta, **pero trata los módulos como una lista plana** y no implementa la jerarquía **módulo → submódulos** que exige la guía. Ese único desvío estructural explica el problema de navegación reportado y se combina con dos causas de *delay* (una de código, una de infraestructura) y con la ausencia de un control de **cerrar sesión** dentro de la app.

Hallazgo habilitador clave: **la jerarquía ya viene en los datos**. El contrato del API ya expone `parentModuleId` y `sortOrder` por módulo (`chat-api/types.ts`), así que la corrección de navegación es **principalmente frontend**, sin tocar el motor RAG ni la base de datos.

---

## 2. Lo que exige la guía (spec autoritativa)

**Orden definitivo de módulos (barra lateral, azul marino):**
1. Contrato y desplazamiento
2. Evaluación docente
3. Situaciones administrativas
4. Auxiliar de educación
5. Ley y reglamento
6. Cargos y plazas
7. Remuneraciones

Debajo de un divisor: **Historial · Guía de uso · Mi perfil**. Arriba: botón **Nuevo chat**.

**Comportamiento de módulos (lo central):**
- Módulo activo resaltado con bloque azul tenue + acento lateral celeste en la barra.
- **Los submódulos NO se despliegan en la barra lateral.** Se muestran en la **zona principal de trabajo** (evita saturación, sobre todo en celular).
- Antes del grupo de submódulos, una frase: *"Selecciona el tema relacionado si lo deseas. También puedes escribir directamente tu consulta."*
- Al elegir un submódulo → aparece como **chip de contexto con "X"** para quitarlo.

**Estructura de la zona de trabajo (orden):** título del módulo → descripción breve → grupo de submódulos → chip de contexto → conversación → respuesta → cuadro de referencias → caja de chat (con **micrófono** y botón enviar).

**Conversación:** al consultar, la pantalla deja de priorizar "Consultas recientes" y "Formatos para descargar" y prioriza conversación + sustento. Respuesta con **títulos en negrita, cuerpo en negro, observaciones en gris/recuadro suave**; azul solo para acentos/enlaces/estados.

**Formatos para descargar:** en la vista informativa del módulo, tarjetas con miniatura Word + icono + nombre.

**Responsive:** barra lateral → hamburguesa; submódulos permanecen en el contenido principal (carrusel/tarjetas); chip activo con X; conversación y referencias con scroll vertical legible.

**Paleta:** blanco predominante, barra azul marino, acento azul moderado, celeste para seleccionado, grises para jerarquía. Evitar negrita excesiva; bordes redondeados, divisores finos, sombras suaves.

---

## 3. Lo que está implementado hoy

- `teacher-shell.tsx`: barra lateral (izquierda) con logo + `Nuevo chat` + **lista plana de TODOS los módulos** como enlaces `<Link href="/chat?module=id">` + divisor + Historial/Guía/Perfil. Menú móvil `<details>` hamburguesa.
- `chat-panel.tsx`: en la zona principal repite los módulos como **botones planos** (`avend-chat-modules`); seleccionar setea estado cliente (`selectedModuleId`). Chip de contexto "Quitar contexto" ✔. Streaming SSE completo ✔. Composer con textarea + enviar (**sin micrófono**).
- `chat-sources.tsx`: referencias como **tabla** (#, Documento, Página, Sección, Relevancia) ✔ alineado con la guía.
- Paleta en `globals.css` (`--avend-navy #0d1b3d`, `--avend-accent #1677ff`, `--avend-soft-blue #e8f1ff`, grises) ✔.
- Logout: existe la ruta `POST /auth/sign-out` **pero solo se expone en la landing `/`**; ni el shell docente ni el admin tienen botón de cerrar sesión.

---

## 4. Hallazgos priorizados (mapeados a lo reportado)

### 🔴 P0-1 — No hay "Cerrar sesión" dentro de la app  *(reportado)*
**Causa:** el control de logout solo vive en la página `/` (`page.tsx`). Dentro de `TeacherShell` y `AdminShell` no existe.
**Corrección:** añadir un control de cerrar sesión (form `POST /auth/sign-out`) al pie de la barra lateral y del menú móvil en **ambos** shells. Bajo riesgo, alto valor.

### 🔴 P0-2 — Navegación de módulos sin submódulos (barra "no correcta")  *(reportado)*
**Causa:** el UI ignora `parentModuleId`/`sortOrder` y pinta **todos** los módulos (padres e hijos) planos, en la barra lateral **y** duplicados en la zona principal. No hay concepto de submódulo, ni título/descripción de módulo, ni "Formatos para descargar".
**Corrección (frontend, datos ya disponibles):**
- Barra lateral = **solo módulos padre** (`parentModuleId === null`) ordenados por `sortOrder`, con resalte de activo (bloque celeste + acento lateral).
- Zona principal = título del módulo + descripción + **submódulos** (hijos del módulo activo) como chips/tarjetas + frase guía + chip de contexto.
- Eliminar la duplicación de módulos en el main; el main pasa a mostrar submódulos.
- Reservar "Formatos para descargar" (tarjetas Word) para cuando AVEND entregue los archivos.

### 🟠 P1-3 — Delay al cambiar de módulo  *(reportado)*
**Causa (código):** los enlaces de módulo de la barra usan `<Link href="/chat?module=id">`, que **re-ejecuta el server component `/chat`** y su `await client.listModules()` con `cache: "no-store"` → ida y vuelta al API en cada clic.
**Corrección:** la selección de módulo/submódulo debe ser **estado de cliente** (como ya hace el panel), sin navegar ni re-consultar. Los módulos son estables: cargar una vez y cachear (`revalidate`/`unstable_cache`) en lugar de `no-store`.

### 🟠 P1-4 — Delay al ingresar  *(reportado)*
**Causa (mixta):** (a) **infraestructura** — el API en Render (plan free) hace *cold start* tras inactividad (dominante); (b) **código** — cada página autenticada bloquea el primer render con `await listModules()` `no-store`, más el refresco de sesión en middleware (`update-session.ts`).
**Corrección:** (a) mantener el API "tibio" o subir plan Render; (b) cachear módulos y no bloquear el primer pintado en datos no críticos.

### 🟡 P2-5 — Falta micrófono en la caja de chat  *(spec §5)*
Añadir botón de micrófono (dictado por voz) en el composer. Fase posterior.

### 🟡 P2-6 — Jerarquía tipográfica de la respuesta  *(spec §6)*
Verificar que las respuestas usen negrita solo en títulos/frases clave, cuerpo en negro y observaciones en gris; que el azul no invada el cuerpo. Ajuste de estilos, no estructural.

### 🟡 P2-7 — "Consultas recientes" / "Formatos para descargar"  *(spec §6, §9)*
La guía asume una vista informativa del módulo (recientes + formatos) que cede prioridad al iniciar la conversación. Hoy no existe esa vista informativa. Definir si entra en este sprint o espera a tener formatos reales.

---

## 5. Plan de corrección propuesto

**Sprint UI/UX-1 (esta iteración, solo frontend, sin tocar API/DB/RAG):**
1. **Logout** en ambos shells (P0-1). *~S*
2. **Reestructurar navegación módulo→submódulo** (P0-2): barra solo padres ordenados + activo resaltado; submódulos + título + descripción en el main; frase guía; chip de contexto con X. *~L*
3. **Selección client-side** de módulo/submódulo y **cache de módulos** (P1-3). *~M*
4. Verificación: `typecheck`, `lint`, `test:cov`, `build`, axe/WCAG AA, matriz responsive 375/768/1024/1440, teclado y lector de pantalla.

**Sprint UI/UX-2 (posterior):**
5. Micrófono en composer (P2-5).
6. Ajuste tipográfico de respuestas (P2-6).
7. Vista informativa del módulo + "Formatos para descargar" con miniaturas Word (P2-7) — depende de que AVEND entregue formatos.
8. Delay de ingreso: decisión de infraestructura (Render keep-warm / plan) (P1-4).

**Fuera de alcance visual (se mantienen como gates separados):** proveedor IA, corpus/PDF real, worker RAG, correo. La interfaz nunca sustituye la autorización de NestJS/RLS.

---

## 6. Handoff para Codex (ejecución paralela opcional)

- **Área a reclamar:** `apps/web/src/components/teacher/*`, `components/chat/chat-panel.tsx`, `app/chat/*`, `app/globals.css`. No tocar `lib/authorization/*`, BFF ni contratos.
- **Contrato de datos:** usar `ChatModule.parentModuleId` + `sortOrder` ya existentes; no cambiar el API.
- **Invariantes:** sin simular respuestas/fuentes; server-side sigue siendo la autoridad; preservar SSE, historial y accesibilidad.
- **Evidencia de salida:** pruebas web verdes + evidencia responsive + revisión independiente sin BLOCKER/HIGH, como en las fases previas.

---

## 7. Pendiente de confirmar (dependencias)

- **Descripciones y submódulos por módulo:** ¿el API `/chat/modules` ya devuelve los 7 padres + sus hijos, con `sortOrder` correcto y una descripción por módulo? La `description` de módulo no está en `ChatModule` hoy; si la guía la exige en el main, puede requerir un campo adicional en el contrato (pequeño cambio de API a coordinar).
- **Formatos Word:** requieren los archivos reales de AVEND.
