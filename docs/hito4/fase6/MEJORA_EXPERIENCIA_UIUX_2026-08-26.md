# Mejora de experiencia UI/UX — 26 de agosto de 2026

## Propósito

Reducir la espera percibida y dar continuidad visual a la navegación ya
autorizada de AVEND ASESOR, sin modificar el motor RAG, API, sesiones, roles,
RLS, datos, proveedores ni contratos de seguridad.

## Cambios implementados

1. **Carga de rutas:** se incorporó un estado de carga con el logo oficial,
   mensajes claros y una reserva de contenido. Así una navegación de servidor
   no se percibe como una pantalla vacía.
2. **Acceso:** el botón de autenticación comunica que la solicitud está en
   proceso, muestra un indicador discreto y evita dobles envíos. La autenticación
   y el redirect por rol continúan siendo server-side.
3. **Cambio entre módulos:** dentro del chat, los módulos principales pasan a
   actualizarse en el cliente. Se actualiza la URL, se reinicia el contexto y
   se limpian los mensajes de la conversación previa para no mezclar evidencia
   de módulos distintos. La autorización de la ruta no se relaja ni se duplica.
4. **Roles en móvil:** los enlaces de administración ya se muestran también en
   el menú móvil cuando el rol resuelto es ADMIN o SUPERADMIN. El servidor sigue
   siendo la autoridad final de cada ruta administrativa.
5. **Acabado y accesibilidad:** se aplicaron estados de foco, sombras suaves,
   transiciones breves, iconografía documental decorativa y `prefers-reduced-motion`.
   Se preservan controles con etiquetas claras y superficies legibles para el
   público docente y profesional.

## Límites intencionales

- La primera autenticación y la carga inicial de módulos aún dependen de
  Supabase y de la disponibilidad de Render. El frontend no puede eliminar un
  cold start de infraestructura; ahora comunica la espera de forma clara.
- No se cambiaron modelos, embeddings, OpenRouter ni el flujo de respuestas
  RAG. Esa integración continúa como una tarea separada.
- No se hizo push, merge ni despliegue con este lote. Requiere revisión
  independiente antes de promoverse.

## Verificación técnica local

- `npm run lint --workspace=web`
- `npm run typecheck --workspace=web`
- `npm run test --workspace=web` (107 pruebas)
- `npm run build --workspace=web`
- Revisión de navegador local de `/auth/sign-in`: contenido visible, sin overlay
  de error y sin errores de cliente.

## Pendiente de cierre

La revisión independiente debe completarse cuando exista una sesión de revisor
disponible. Hasta entonces este lote no se considera aprobado para merge o
producción.
