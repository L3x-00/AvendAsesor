# Matriz de cumplimiento — Casos de Uso (CU) y Criterios de Aceptación (CA)

**AVEND ASESOR — Primera etapa**
**Fecha del documento:** 2026-08-27
**Documento de referencia:** *Casos de uso y criterios de aceptación — AVEND ASESOR, Primera etapa* (Product Owner).
**Propósito:** Trazar de forma auditable cada CU-01…CU-15 y cada prueba integral PI-01…PI-06 hacia archivos de implementación, archivos de prueba y evidencia de verificación concreta, con estados honestos que distinguen lo verificado localmente de lo pendiente de integración, corpus real, despliegue y aceptación del cliente.

> Este documento complementa —no reemplaza— el contrato, sus anexos y los lineamientos funcionales. Es un instrumento de validación técnica para el Product Owner y el cliente.

---

## 1. Contexto de auditoría (leer antes de interpretar los estados)

| Elemento | Valor verificado |
| --- | --- |
| Rama de integración | `codex/acceptance-cu-uiux-20260826` |
| Commit base (HEAD de las cuatro worktrees) | `5415628` — *feat: mejorar experiencia de carga y navegación del chat* |
| Commit anterior relevante | `12bee5d` — *feat(api): integrar OpenRouter como gateway único de IA (embeddings 1536 + fallback)* |
| `origin/main` | `2f72d4a` — *Merge pull request #3* |
| Distancia respecto a `origin/main` | HEAD **adelantado en 2 commits** (`5415628`, `12bee5d`); **no fusionado** a `origin/main` |

> **ADVERTENCIA DE INTEGRACIÓN — no inferir producción.**
> El trabajo de la primera etapa está distribuido en **tres worktrees aislados** que **comparten el mismo commit base `5415628`** y contienen cambios **sin confirmar** (working tree). Ninguno de esos cambios está en `origin/main`, en una rama fusionada, ni en producción. Incluso la línea base `5415628` está **por delante de `origin/main`** y no ha sido desplegada. En consecuencia, un criterio marcado como implementado y verificado localmente **describe evidencia de código y pruebas dentro de una worktree**, y **no** una prueba en un entorno funcional publicado.

**Ubicación física del trabajo por stream (todo sin confirmar):**

| Stream / worktree | Ruta | Alcance funcional | CU/PI que atiende |
| --- | --- | --- | --- |
| Línea base (commit `5415628`) | `D:\AvendAsesor-acceptance-cu-20260826` | Chat, historial, RAG base, ingestión, administración base, roles | CU-01, CU-10, base de CU-02/03/07/11/12/13/15 |
| RAG, contexto y citas | `D:\AvendAsesor-rag-context-citations-20260826` | Contexto conversacional acotado, cambio de tema, aclaraciones con evidencia, `no_evidence`, citas con UUID y descarga privada (backend) | CU-04, CU-05, CU-06, CU-08 (backend), CU-09; refuerza CU-02/03/07; PI-01…04/06 |
| Generación de documento (CU-14) | `D:\AvendAsesor-cu14-docgen-20260826` | Ficha de orientación DOCX/PDF, vista previa protegida, apertura de fuentes (web/BFF) | CU-14, CU-08 (web) |
| Completitud de administración | `D:\AvendAsesor-admin-completeness-20260826` | Estado de ingestión por versión, edición completa de módulos + `updateTag`, correcciones UI verificadas | CU-11, CU-12, CU-13, CU-15 (UI/etiquetas); PI-05 (parte admin) |

---

## 2. Leyenda de estados

| Código | Significado | Qué evidencia exige |
| --- | --- | --- |
| **[IL]** | Implementado y verificado localmente | Código presente + pruebas unitarias/de componente presentes en la worktree correspondiente. |
| **[IP]** | Implementado, pendiente de integración | La obra existe en una worktree aislada **sin fusionar**; puede tener interdependencia con otro stream aún no unido. |
| **[VP]** | Pendiente de verificación con corpus/proveedor real | Requiere documentación real ingerida (Ley y Reglamento, Contrato Docente, Auxiliares) y/o proveedor de IA real (OpenRouter, embeddings 1536). |
| **[DP]** | Pendiente de despliegue/verificación en producción | Requiere aplicar migraciones y ejecutar pruebas de base de datos (pgTAP) o comprobación en staging/producción. |
| **[AC]** | Aceptación contractual/usuario pendiente | Requiere prueba del cliente en entorno funcional según el criterio general (§2 del documento del PO). |

> El **criterio general de aceptación** del PO exige que la funcionalidad sea *probada por el cliente en un entorno funcional*. Por ello **todos** los CU y PI conservan **[AC]** hasta esa prueba, con independencia de su madurez técnica.

---

## 3. Resumen ejecutivo

| Estado predominante | CU/PI |
| --- | --- |
| Base madura, verificada localmente (**[IL]** + **[AC]**) | CU-01, CU-10, CU-15 |
| Implementado localmente pero **sin fusionar** entre streams (**[IP]** dominante) | CU-04, CU-05, CU-06, CU-08, CU-09, CU-11, CU-14 |
| Con dependencia dura de corpus/proveedor real (**[VP]**) | CU-02, CU-03, CU-07, CU-12, CU-13; PI-01…PI-06 |
| Con dependencia de despliegue/orden de migración (**[DP]**) | CU-05, CU-08, CU-09; PI-05 |

**Conclusión honesta de una línea:** la primera etapa está **técnicamente construida y probada por componentes**, pero **no integrada en una sola rama**, **no verificada con el corpus real** y **no desplegada**; por tanto **aún no puede declararse “cumplida y aprobada”** ante el cliente.

---

## 4. Matriz de Casos de Uso (CU-01 … CU-15)

### CU-01 — Ingreso y nueva consulta
- **Criterios (PO):** opción *Nueva consulta* visible; escribir y enviar mensaje; sin bloqueos ni pasos innecesarios; diseño responsivo.
- **Ubicación:** línea base `5415628` (commit *mejorar experiencia de carga y navegación del chat*).
- **Implementación:** `apps/web/src/app/chat/page.tsx`, `apps/web/src/app/chat/[conversationId]/page.tsx`, `apps/web/src/components/chat/chat-panel.tsx`, `apps/web/src/app/api/chat/stream/route.ts`, `apps/web/src/app/guide/page.tsx`.
- **Pruebas:** `apps/web/src/components/chat/chat-panel.spec.tsx`, `apps/web/src/app/api/chat/stream/route.spec.ts`.
- **Estado:** **[IL]** · **[AC]**.
- **Notas / brecha:** el comportamiento responsivo real (375/768/1024/1440) y la ausencia de bloqueos requieren verificación manual/axe en entorno funcional; no está cubierto por prueba automatizada de dispositivo.

### CU-02 — Consulta libre sin seleccionar proceso
- **Criterios (PO):** enviar sin seleccionar proceso; inferencia razonable del tema; documentación pertinente; solicitar precisión ante ambigüedad real.
- **Ubicación:** base RAG en `5415628` + **refuerzo en worktree RAG (sin confirmar)**.
- **Implementación:** `apps/api/src/rag/rag.service.ts` (clasificación por recuperación **global** que decide el módulo a partir de la pregunta actual: `routeSources`, `globalSearch`, ramas `resolved`/`ambiguous`), `apps/api/src/rag/prompt.builder.ts`, `apps/api/src/rag/rag.constants.ts`.
- **Pruebas:** `apps/api/src/rag/rag.service.spec.ts` (11 casos), `apps/api/src/rag/prompt.builder.spec.ts` (4).
- **Estado:** **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** la calidad real de la inferencia de proceso solo puede validarse con corpus real y proveedor de embeddings real; las pruebas locales usan recuperación simulada.

### CU-03 — Consulta desde un proceso seleccionado
- **Criterios (PO):** proceso seleccionado asociado a la consulta; no mezclar documentación de otros procesos; continuidad dentro del mismo contexto.
- **Ubicación:** base de módulos en `5415628` (commit `0ce0207` *reiniciar conversación al cambiar submódulo*) + worktree RAG (recuperación acotada al módulo seleccionado).
- **Implementación:** `apps/api/src/rag/rag.service.ts` (`selectedSources` acotado al módulo), `apps/api/src/chat/chat.service.ts` (contexto por conversación/módulo), `apps/api/src/modules/*`.
- **Pruebas:** `apps/api/src/rag/rag.service.spec.ts`, `apps/api/src/chat/chat.service.spec.ts` (17), `apps/api/src/modules/modules.service.spec.ts`.
- **Estado:** **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** la no-mezcla documental real depende de la separación efectiva del corpus por módulo (verificable solo con documentos reales — ver PI-04).

### CU-04 — Conversación natural con pregunta aclaratoria
- **Criterios (PO):** no limitarse a preguntar; ofrecer orientación inicial sustentada; pregunta aclaratoria pertinente; no repetir datos ya dados.
- **Ubicación:** **worktree RAG (sin confirmar).**
- **Implementación:** `apps/api/src/rag/rag.service.ts` (rama `ambiguous` que conserva fuentes y solicita precisión), `apps/api/src/rag/rag.constants.ts` (`RAG_AMBIGUITY_MESSAGE`), `apps/api/src/rag/prompt.builder.ts`; decisión documentada en `apps/api/src/rag/../../../docs/architecture/CONTEXTO_CONVERSACIONAL_Y_CITAS_PRIVADAS.md` (§CU-04).
- **Pruebas:** `apps/api/src/rag/rag.service.spec.ts`, `apps/api/src/chat/chat.service.spec.ts`.
- **Estado:** **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** que la aclaración sea “natural” y no redundante requiere prueba conversacional con corpus real.

### CU-05 — Conservación del contexto de conversación
- **Criterios (PO):** no volver a pedir datos ya dados; conservar proceso y datos del caso; coherencia entre mensajes sucesivos.
- **Ubicación:** **worktree RAG (sin confirmar).**
- **Implementación:** `apps/api/src/chat/chat.service.ts` (`getConversationContext` acotado), `apps/api/src/chat/chat-history.gateway.ts`, límites en `apps/api/src/rag/rag.constants.ts` (`MAX_CHAT_CONTEXT_MESSAGES = 12`, `MAX_CHAT_CONTEXT_CHARS = 10 000`, `MAX_CONTEXT_MESSAGE_CHARS = 2 000`), RPC `security definer` en `supabase/migrations/20260827161723_secure_chat_context_and_source_access.sql`. El historial se entrega al modelo como bloque **no confiable** (prioridad de la política de sistema).
- **Pruebas:** `apps/api/src/chat/chat.service.spec.ts` (17), `apps/api/src/supabase/supabase-chat.gateway.spec.ts` (9), pgTAP `supabase/tests/database/secure_chat_context_and_source_access_test.sql` (`plan(26)`).
- **Estado:** **[IP]** · **[DP]** · **[AC]**.
- **Notas / brecha:** el pgTAP y la migración **exigen stack local de Supabase**; no se ejecutan en esta revisión y **no deben** sustituirse por una prueba contra producción.

### CU-06 — Cambio de tema durante la conversación
- **Criterios (PO):** detectar el cambio; fuentes posteriores del nuevo proceso; no arrastrar información que genere respuesta incorrecta.
- **Ubicación:** **worktree RAG (sin confirmar).**
- **Implementación:** `apps/api/src/rag/rag.service.ts` (`RAG_TOPIC_SWITCH_SCORE_MARGIN = 0.08`; un cambio claro **crea conversación nueva**), `apps/api/src/chat/chat.service.ts` (reinicio de `conversationContext` al cambiar módulo, `manuallyChangedModule`).
- **Pruebas:** `apps/api/src/rag/rag.service.spec.ts`, `apps/api/src/chat/chat.service.spec.ts`.
- **Estado:** **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** la robustez del umbral (0.08) frente a temas parecidos solo se valida con corpus real (PI-04).

### CU-07 — Respuesta sustentada mediante RAG
- **Criterios (PO):** relación directa con la consulta; información verificable en documentos; sin afirmaciones sin sustento cuando deba provenir del RAG; redacción comprensible.
- **Ubicación:** base RAG en `5415628` + `12bee5d` (OpenRouter, embeddings 1536) + refuerzo en worktree RAG (prohibición de obedecer instrucciones de fuentes/mensajes; exige evidencia vigente).
- **Implementación:** `apps/api/src/rag/rag.service.ts`, `apps/api/src/rag/prompt.builder.ts`, `apps/api/src/rag/openai-answer.gateway.ts`, `apps/api/src/rag/answer.gateway.ts`, `apps/api/src/supabase/supabase-retrieval.gateway.ts`.
- **Pruebas:** `apps/api/src/rag/rag.service.spec.ts`, `apps/api/src/rag/prompt.builder.spec.ts`, `apps/api/src/rag/openai-answer.gateway.spec.ts`.
- **Estado:** **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** dependencia dura de **proveedor real** (OpenRouter) y **corpus real**; la calidad y no-alucinación se validan en PI-01…03.

### CU-08 — Citas y fuentes verificables
- **Criterios (PO):** referencia seleccionable/abrible; identificar el documento de origen; mostrar página/artículo/numeral/sección/fragmento; la fuente respalda la afirmación; revisar el documento sin perder la consulta.
- **Ubicación:** **backend en worktree RAG** + **web en worktree CU-14** (dos worktrees separados; **contrato alineado pero nunca construido juntos**).
- **Implementación (backend, RAG):** UUID por cita generado antes del streaming y persistido atómicamente (`complete_chat_turn` → `chat_message_sources.id`) en `supabase/migrations/20260827161723_secure_chat_context_and_source_access.sql`; endpoint `@Get('chat/sources/:sourceId/download-url')` en `apps/api/src/chat/chat.controller.ts` que devuelve `{ sourceId, url, expiresAt }` (URL firmada de 60 s; nunca expone bucket ni ruta); auditoría en tabla `chat_source_access_events`.
- **Implementación (web, CU-14):** `apps/web/src/components/chat/chat-sources.tsx` (marcadores `[n]`, apertura en pestaña nueva con `aria-label`, metadatos: página/páginas, versión, sección, artículo, numeral), BFF `apps/web/src/app/api/chat/sources/[sourceId]/download/route.ts` (redirección 307 a la URL firmada, sin exponer token).
- **Pruebas:** backend `apps/api/src/supabase/supabase-chat.gateway.spec.ts` (9), `apps/api/src/chat/chat.controller.spec.ts`, pgTAP (`plan(26)`); web `apps/web/src/components/chat/chat-sources.spec.tsx` (2), `.../api/chat/sources/[sourceId]/download/route.spec.ts` (3).
- **Estado:** **[IP]** · **[DP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** el contrato `download-url` **coincide** entre ambos worktrees (verificado por inspección), pero **no existe una rama que integre ambas mitades**; la apertura real de fuente end-to-end no se ha ejecutado en un solo build.

### CU-09 — Consulta sin sustento suficiente
- **Criterios (PO):** indicar que no hay sustento; no inventar requisitos/plazos/derechos/montos/procedimientos; registrar la consulta para revisión administrativa; diferenciar lo respaldado de lo no confirmado.
- **Ubicación:** **worktree RAG (sin confirmar)** + base de operaciones/aprendizaje en `5415628`.
- **Implementación:** `apps/api/src/rag/rag.service.ts` (rama `no_evidence` → cero fuentes, **no invoca al proveedor generativo**), `apps/api/src/rag/rag.constants.ts` (`RAG_NO_EVIDENCE_MESSAGE`), registro de consulta no resuelta (`unanswered_question_reason` en la migración y `apps/api/src/operations/*`, `apps/api/src/learning/faq-memory.service.ts`).
- **Pruebas:** `apps/api/src/rag/rag.service.spec.ts`, `apps/api/src/operations/operations.service.spec.ts`, `apps/api/src/learning/faq-memory.service.spec.ts`.
- **Estado:** **[IP]** · **[DP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** la frontera “suficiente vs. insuficiente” depende del umbral de relevancia sobre corpus real (PI-06).

### CU-10 — Registro e historial de consultas
- **Criterios (PO):** ver consultas anteriores; abrir y revisar contenido; identificación clara por tema/fecha; no mezclar conversaciones.
- **Ubicación:** línea base `5415628`.
- **Implementación:** `apps/web/src/app/history/page.tsx`, `apps/web/src/app/history/actions.ts`, `apps/web/src/components/chat/chat-history-list.tsx`, `apps/api/src/chat/chat-history-cursor.ts`, `apps/api/src/chat/chat.controller.ts` (`@Get('conversations')`, `@Get('conversations/:id')`).
- **Pruebas:** `apps/web/src/components/chat/chat-history-list.spec.tsx`, `apps/api/src/chat/chat-history-cursor.spec.ts`.
- **Estado:** **[IL]** · **[AC]**.
- **Notas / brecha:** madurez alta en la línea base; falta prueba del cliente en entorno funcional.

### CU-11 — Gestión de procesos desde administración
- **Criterios (PO):** sección de gestión; crear/editar; activar/desactivar; reflejo sin modificar código para cada operación ordinaria.
- **Ubicación:** base admin en `5415628` + **worktree Admin (sin confirmar)**.
- **Implementación:** `apps/web/src/app/admin/modules/page.tsx`, `apps/web/src/app/admin/actions.ts` (campo `description` en creación/edición + `updateTag("chat-modules")` tras crear/actualizar/cambiar estado/eliminar, para lectura inmediata de escrituras — Next.js 16), `apps/api/src/modules/*`.
- **Pruebas:** `apps/web/src/app/admin/actions.spec.ts` (13), `apps/api/src/modules/modules.controller.spec.ts`, `apps/api/src/modules/modules.service.spec.ts`.
- **Estado:** **[IL]** · **[IP]** · **[AC]**.
- **Notas / brecha:** la edición ampliada (`description`) y la invalidación de caché viven en la worktree Admin sin fusionar.

### CU-12 — Carga y asociación de documentos
- **Criterios (PO):** carga correcta; asociación al proceso; conservación de la relación; disponibilidad tras procesamiento; identificar el estado del documento.
- **Ubicación:** base ingestión/documentos en `5415628` + **worktree Admin** (estado por versión).
- **Implementación:** `apps/api/src/documents/domain/document.ts` (expone `ingestionStatus`/`ingestionUpdatedAt`; enum `failed|indexed|pending|processing`), `apps/api/src/supabase/supabase-documents.gateway.ts`, `apps/web/src/app/admin/documents/[id]/page.tsx`, etiquetas localizadas y accesibles en `apps/web/src/lib/admin-api/labels.ts` (`getDocumentIngestionStatusContent`), `apps/api/src/ingestion/*`.
- **Pruebas:** `apps/api/src/supabase/supabase-documents.gateway.spec.ts` (7), `apps/api/src/documents/documents.service.spec.ts`, `apps/web/src/lib/admin-api/labels.spec.ts` (3), `apps/api/src/ingestion/ingestion.service.spec.ts`.
- **Estado:** **[IL]** · **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** el procesamiento real (OCR/embeddings) y la disponibilidad efectiva para el RAG requieren ejecución real (PI-05).

### CU-13 — Ampliación progresiva de la base documental
- **Criterios (PO):** incorporar desde administración; recuperar el nuevo documento en una consulta posterior; la documentación anterior sigue funcionando; no alterar otros procesos.
- **Ubicación:** base ingestión en `5415628` + **worktree Admin** (visibilidad de estado por versión).
- **Implementación:** `apps/api/src/ingestion/ingestion.worker.ts`, `apps/api/src/ingestion/chunking.service.ts`, `apps/api/src/documents/domain/document.ts`, `apps/web/src/app/admin/documents/[id]/page.tsx`.
- **Pruebas:** `apps/api/src/ingestion/ingestion.worker.spec.ts`, `apps/api/src/ingestion/chunking.service.spec.ts`.
- **Estado:** **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** “recuperar información del nuevo documento” es intrínsecamente **[VP]** (corpus real) — es exactamente PI-05.

### CU-14 — Generación de documento desde la orientación
- **Criterios (PO):** la acción aparece cuando corresponde; no repedir datos reutilizables; revisar antes de descargar; descarga en formatos previstos; datos ingresados correctos.
- **Ubicación:** **worktree CU-14 (sin confirmar).**
- **Implementación:** `apps/web/src/lib/orientation-document/builders.ts` (DOCX con `docx`/`Packer`, PDF con `pdfkit`), `.../model.ts`, vista previa protegida `apps/web/src/app/chat/[conversationId]/orientacion/[messageId]/page.tsx` (+ `not-found.tsx`), `apps/web/src/components/orientation/orientation-preview.tsx`, Route Handler `apps/web/src/app/api/chat/conversations/[conversationId]/messages/[messageId]/orientacion/[format]/route.ts` (re-autentica y **re-consulta** pregunta/respuesta/citas; jamás confía en el cliente). Documentado en `docs/requirements/CU14_FICHA_ORIENTACION.md`.
- **Pruebas:** `builders.spec.ts` (2, firmas binarias `PK`/`%PDF-`), `model.spec.ts` (6), `orientation-preview.spec.tsx` (5), `.../orientacion/[format]/route.spec.ts` (6).
- **Estado:** **[IP]** · **[VP]** · **[AC]**.
- **Notas / brecha:** (1) primera plantilla = **ficha de orientación informativa, NO acto administrativo** (lleva descargo); las plantillas oficiales quedan fuera de este alcance. (2) La visibilidad de la acción y la reutilización de datos dependen de que el backend RAG publique el UUID de cita (**dependencia de integración con el worktree RAG**). (3) La renderización de glifos en español en el PDF requiere revisión visual.

### CU-15 — Gestión de usuarios y roles
- **Criterios (PO):** visualizar usuarios; permisos por rol; un usuario sin permiso administrativo no accede a administración; reflejar cambios de estado/permisos.
- **Ubicación:** línea base `5415628` (commit `5a519fa` *diferenciación de roles*) + worktree Admin (etiquetas/UI).
- **Implementación:** `apps/api/src/authorization/authorization.guard.ts`, `.../roles.guard.ts`, `.../authorization.service.ts`, `apps/api/src/user-administration/*`, `apps/web/src/app/admin/users/`, `apps/web/src/lib/authorization/resolve-admin-access.ts`, `resolve-chat-access.ts`, etiquetas de rol/estado en `apps/web/src/lib/admin-api/labels.ts` (`Administrador/Docente/Superadministrador`, `Activa/Suspendida`).
- **Pruebas:** `apps/api/src/authorization/authorization.guard.spec.ts`, `.../roles.guard.spec.ts`, `.../authorization.service.spec.ts`, `apps/api/src/user-administration/user-administration.controller.spec.ts`, `apps/web/src/lib/authorization/resolve-admin-access.spec.ts`.
- **Estado:** **[IL]** · **[AC]**.
- **Notas / brecha:** cobertura sólida de RBAC en la línea base; falta prueba del cliente con cuentas reales de usuario y administración.

---

## 5. Matriz de Pruebas Integrales (PI-01 … PI-06)

> Las PI son **pruebas de recorrido real** que combinan varios CU. **Ninguna es verificable localmente**: exigen entorno funcional, corpus real (Ley y Reglamento, Contrato Docente, Contratación de Auxiliares de Educación) y proveedor real. A continuación se traza cada PI a los componentes que la habilitan y el estado honesto del recorrido completo.

| PI | Recorrido (PO) | Componentes que la habilitan | Estado del recorrido |
| --- | --- | --- | --- |
| **PI-01 — Ley y Reglamento** | Consulta general → identifica módulo → recupera → orienta → cita/abre fuente → conserva contexto | CU-02, CU-07, CU-08, CU-05 (worktrees RAG + CU-14) | **[IP] · [VP] · [AC]** |
| **PI-02 — Contrato Docente** | Situación sin nombrar proceso → identifica → orienta → precisa si hace falta → sustento verificable → continúa | CU-02, CU-04, CU-07, CU-08 (worktree RAG + CU-14) | **[IP] · [VP] · [AC]** |
| **PI-03 — Auxiliares de Educación** | Consulta de postulación/requisitos → distingue de Contrato Docente → usa su documentación → cita → continúa sin mezclar | CU-03, CU-06, CU-07, CU-08 (worktree RAG) | **[IP] · [VP] · [AC]** |
| **PI-04 — Diferenciación entre procesos similares** | Dos consultas parecidas (Contrato Docente vs. Auxiliares) → clasifica cada una → fuentes propias de cada proceso | CU-06 (`RAG_TOPIC_SWITCH_SCORE_MARGIN`), CU-03, recuperación acotada por módulo | **[IP] · [VP] · [AC]** |
| **PI-05 — Incorporación de nueva documentación** | Admin carga y asocia documento → procesa → consulta posterior lo recupera sin afectar lo existente | CU-12, CU-13 (worktree Admin) + CU-07/08 (worktree RAG) | **[IP] · [VP] · [DP] · [AC]** |
| **PI-06 — Consulta sin sustento suficiente** | Pregunta no cubierta → reconoce insuficiencia → no inventa → comunica límite → registra para revisión | CU-09 (`no_evidence` + registro) | **[IP] · [VP] · [AC]** |

**Qué falta explícitamente para las PI:** todas requieren (a) fusión de los tres worktrees en una rama de integración, (b) migración aplicada en el entorno de prueba, (c) corpus real ingerido y clasificado por módulo, (d) proveedor real activo, (e) ejecución manual del recorrido con evidencia (spec §6: enlace, credenciales, video).

---

## 6. Brechas identificadas (funcionales, de prueba, de datos, de despliegue y de marca)

### 6.1 Brechas funcionales
- **Integración pendiente de tres streams.** CU-04/05/06/08/09 (RAG), CU-14 (docgen) y CU-11/12/13/15-UI (Admin) están en **worktrees separados sin fusionar**. No existe una rama que los una ni un build integrado.
- **CU-08 interdependiente.** La cita end-to-end exige que el backend (RAG) publique el UUID **y** la web (CU-14) lo consuma. El contrato coincide, pero nunca se han ejecutado juntos.
- **CU-14 acotado a una plantilla.** Solo la *ficha de orientación informativa* (no oficial). Documentos/actos oficiales quedan fuera de esta etapa.
- **Consistencia multi-consulta (criterio §2 del PO).** “Comportamiento consistente en más de una consulta de prueba” no está cubierto por prueba automatizada.

### 6.2 Brechas de prueba
- **pgTAP no ejecutado.** `secure_chat_context_and_source_access_test.sql` (`plan(26)`) **exige stack local de Supabase**; queda pendiente y no debe sustituirse por producción.
- **Sin E2E integrado ni navegador.** No hay prueba de recorrido (browser/axe) sobre las tres worktrees unidas; PI-01…06 no tienen automatización.
- **Verificación visual pendiente.** Glifos en español del PDF (CU-14) y responsividad 375/768/1024/1440 (CU-01, correcciones UI) requieren revisión manual.
- **Pruebas con corpus simulado.** Las unitarias de RAG usan recuperación/proveedor simulados; no prueban recuperación real.

### 6.3 Dependencia de datos reales
- Corpus real ingerido y separado por módulo: **Ley y Reglamento**, **Contrato Docente**, **Contratación de Auxiliares de Educación**.
- Proveedor de IA real (**OpenRouter**, embeddings de **1536** dimensiones con fallback) con claves válidas.
- Sin estos insumos, CU-02/03/07/12/13 y **todas** las PI permanecen en **[VP]**.

### 6.4 Compuerta de producción peligrosa (orden de despliegue)
- **La migración `20260827161723_secure_chat_context_and_source_access.sql` debe aplicarse ANTES de desplegar el API** que invoca `complete_chat_turn`, los RPC de contexto y las columnas `ingestion_status`/`ingestion_updated_at`. Desplegar el API antes de la migración provoca **fallo en tiempo de ejecución**.
- Los RPC `security definer` deben **permanecer revocados** para `anon` y `authenticated` (solo `service_role`); una exposición accidental rompe la privacidad de contexto y de fuentes. Verificar con *advisors* de seguridad tras aplicar.
- La descarga de fuente usa **URL firmada de 60 s** y auditoría (`chat_source_access_events` con RLS); confirmar que el bucket/ruta **nunca** se devuelven al cliente.

### 6.5 Dependencia de insumo de marca
- CU-14 (ficha) y las correcciones UI usan **exclusivamente la paleta/el logo AVEND aprobados**; no se introduce marca nueva. La aprobación del alcance de plantillas y del descargo “documento no oficial” corresponde al Product Owner.
- Cualquier **plantilla oficial futura** requiere que el cliente provea los **formatos/marca oficiales**; hasta entonces no puede prometerse.

---

## 7. Lista de verificación de compuerta de liberación (release gate)

| # | Compuerta | Estado hoy |
| --- | --- | --- |
| 1 | Fusionar worktrees RAG + CU-14 + Admin en una rama de integración y resolver conflictos | ☐ Pendiente |
| 2 | `lint` + `typecheck` + `build` en `apps/api` y `apps/web` sobre la rama integrada | ☐ Pendiente |
| 3 | Jest de API con cobertura verde (`test:cov`) | ☐ Pendiente |
| 4 | Vitest de Web con cobertura verde (`test:cov`) | ☐ Pendiente |
| 5 | pgTAP verde con stack local de Supabase (migración + `plan(26)`) | ☐ Pendiente |
| 6 | Corpus real ingerido y clasificado por módulo; estados de ingestión = `indexed` | ☐ Pendiente |
| 7 | Proveedor real (OpenRouter, embeddings 1536) verificado con claves válidas | ☐ Pendiente |
| 8 | PI-01…PI-06 ejecutadas manualmente en entorno funcional con evidencia | ☐ Pendiente |
| 9 | Revisión responsiva 375/768/1024/1440 + axe (CU-01, UI) y glifos PDF (CU-14) | ☐ Pendiente |
| 10 | Orden de despliegue: migración **antes** que API; *advisors* de seguridad sin hallazgos | ☐ Pendiente |
| 11 | Evidencia de entrega (spec §6): enlace funcional, credenciales usuario+admin, video demo | ☐ Pendiente |
| 12 | Aceptación del cliente (**[AC]**) por CU y PI en el entorno de prueba | ☐ Pendiente |

---

## 8. Comandos y evidencia exactos requeridos antes de declarar cumplimiento

> Ejecutar en la **rama de integración** (tras fusionar los tres worktrees). Los comandos reflejan los *scripts* reales de `package.json` (API con **Jest**, Web con **Vitest**, workspaces `apps/*`).

**Integración y build**
```bash
# (previo) fusionar codex/rag-context-citations, codex/cu14-docgen y codex/admin-completeness
npm ci
npm run lint --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
```

**Pruebas de API (Jest) y Web (Vitest) con cobertura**
```bash
npm run test:cov --workspace=api
npm run test:cov --workspace=web
```

**Pruebas de base de datos (pgTAP) — requiere stack local de Supabase (NO producción)**
```bash
supabase start
supabase test db      # aplica 20260827161723_* y ejecuta plan(26)
supabase stop
```

**Verificación con datos y proveedor reales (entorno funcional)**
- Ingerir en administración: *Ley y Reglamento*, *Contrato Docente*, *Contratación de Auxiliares de Educación*; confirmar `ingestion_status = indexed` por versión.
- Configurar el proveedor real (OpenRouter, embeddings 1536) con claves válidas y comprobar `fallback`.
- Ejecutar **manualmente** PI-01…PI-06 y registrar respuesta, citas abiertas, cambio de tema y caso sin sustento.

**Seguridad de despliegue**
- Aplicar la migración **antes** del API.
- Ejecutar los *advisors* de seguridad de Supabase y confirmar que los RPC `security definer` no son ejecutables por `anon`/`authenticated`.

**Evidencia de entrega (documento del PO, §6)**
- Enlace funcional del entorno de prueba.
- Credenciales/accesos de usuario y de administración.
- Video corto de demostración de los flujos acordados.
- Nota breve de qué se modificó por hito.

> **Solo cuando** las compuertas 1–12 del §7 estén verdes y exista la evidencia del §6 podrá declararse el cumplimiento de la primera etapa. Hasta entonces, el estado honesto es **construido y probado por componentes, pendiente de integración, corpus real, despliegue y aceptación del cliente**.

---

## 9. Autorrevisión del documento

- **Trazabilidad:** los 15 CU y las 6 PI están mapeados a archivos de implementación y de prueba concretos (rutas verificadas por inspección de las cuatro worktrees).
- **Honestidad de estado:** ningún criterio se declara “en producción”. Se distingue explícitamente línea base confirmada (adelantada a `origin/main`, no desplegada) frente a trabajo **sin confirmar** en worktrees aisladas.
- **No inferencia:** se afirma de forma expresa que el trabajo de las worktrees **no** está en `origin/main` ni en producción.
- **Brechas:** se listan brechas funcionales, de prueba, de datos reales, una **compuerta de producción peligrosa** (orden de migración/RPC) y la **dependencia de insumo de marca**.
- **Auditabilidad:** se incluyen conteos de pruebas, hashes de commit, nombre de migración y `plan(26)` de pgTAP, y los comandos exactos de verificación.
- **Idioma:** redacción profesional en español, orientada a Product Owner y cliente.

*Documento generado para revisión del orquestador; se entrega sin confirmar (uncommitted).*
