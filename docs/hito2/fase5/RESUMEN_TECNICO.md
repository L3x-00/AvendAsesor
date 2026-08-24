# Fase 5 — Panel administrativo funcional mínimo

## Objetivo

Construir rutas administrativas locales de módulos y documentos con formularios, carga y listados funcionales. La interfaz será accesible y clara, pero el rediseño visual/UX se difiere según la prioridad confirmada. Toda acción seguirá dependiendo de la API NestJS autorizada.

## Contrato de la fase

- `/admin` será una puerta de navegación para identidades confirmadas `admin` y `superadmin`; `docente` seguirá redirigido antes de recibir contenido administrativo.
- `/admin/modules` permitirá listar, crear, editar, ordenar, activar/desactivar y eliminar lógicamente módulos mediante el recurso existente `/admin/modules`.
- `/admin/documents` permitirá listar documentos activos/inactivos, iniciar una carga PDF con metadatos y asociaciones a módulos, y abrir el detalle. El detalle permitirá nueva versión, edición de metadatos, asociación/desasociación, cambio de estado, baja lógica y descarga temporal mediante `/admin/documents`.
- Las lecturas se ejecutarán en Server Components y las mutaciones en Server Actions. El navegador no llamará a Data API, Storage, RPC ni recibirá el service-role key, rutas privadas o checksums.
- El web server recuperará la sesión comprobada de Supabase SSR y remitirá su bearer token exclusivamente al backend NestJS. El backend sigue siendo la autoridad final de identidad, rol, PDF y datos.
- Las acciones de creación/versionado no tendrán reintento automático. Mientras un envío está en curso el formulario quedará bloqueado; un resultado ambiguo instruirá al administrador a verificar el listado/detalle antes de enviar de nuevo. La futura semántica de claves de idempotencia permanece documentada en ADR-0009, R-010 y TD-003.

## No incluye

- Rediseño de identidad visual, dashboard de métricas, gestión de usuarios, configuración global, RAG, OCR, extracción, colas, ingesta, DOCX/TXT/imágenes, proveedores remotos, despliegue, staging o datos de negocio sembrados.

## Criterios de salida

1. Un administrador local puede gestionar módulos y documentos desde las rutas web usando exclusivamente la API ya protegida.
2. La interfaz no filtra secretos, rutas privadas ni habilita un acceso directo de `docente`.
3. Las operaciones de PDF conservan el límite backend y no se reintentan de manera automática desde el navegador.
4. Hay pruebas de cliente servidor/acciones/componentes, build web, regresión local proporcional, revisión independiente y actualización de la memoria técnica.

## Implementación y evidencia

- `AdminApiClient` y su configuración son `server-only`; el valor de `ADMIN_API_URL` no tiene prefijo público y rechaza HTTP fuera de loopback. Los esquemas de respuesta excluyen rutas de Storage y checksums.
- `createAuthorizedAdminApiClient` reutiliza la validación SSR de identidad/perfil y obtiene el bearer por petición. Los Server Components y Server Actions son los únicos consumidores del cliente; NestJS conserva la autoridad final.
- Los formularios cubren el ciclo administrativo ya disponible en la API y se deshabilitan durante la operación. Crear, cargar y versionar no incorporan reintentos automáticos. El detalle entrega una URL firmada temporal únicamente tras la acción autenticada.
- `Test-LocalAdminWeb.ps1` acepta puertos alternativos para no interferir con otros procesos locales, valida que sean libres y detiene únicamente los procesos que inició. Crea y elimina cuentas de prueba delimitadas por prefijo; no crea módulo ni documento de negocio.
- Verificado el 2026-08-09: web typecheck, lint, 53 pruebas con cobertura, build de producción, `git diff --check` y la regresión local administrativa: PASS.

## Actualización visual local — 2026-08-21

- La presentación administrativa usa ahora el sistema visual aprobado de AVEND
  ASESOR: barra lateral azul marino en escritorio, navegación móvil explícita,
  logo oficial sin reinterpretación y estados activos celestes. La navegación
  distingue visualmente la sección actual sin alterar sus rutas ni permisos.
- Las listas, formularios, avisos y acciones emplean tokens semánticos de la
  paleta aprobada, texto base de al menos 16 px, focos visibles y controles de
  al menos 44 px. Esto prioriza la lectura y el manejo predecible para docentes
  y profesionales adultos.
- No se modificaron Server Components, Server Actions, `AdminApiClient`,
  sesiones SSR, bearer hacia NestJS, límites PDF, reintentos, RBAC ni contratos
  del backend. El rediseño sigue siendo exclusivamente de presentación.
- Verificado el 2026-08-21: lint, typecheck, 57 pruebas web con 98.74 % de
  statements y 96.63 % de branches, build de producción, acceso anónimo a
  `/admin/modules` redirigido a inicio de sesión y auditoría axe WCAG 2 A/AA
  sin violaciones en 375 px. La regresión integral con identidades temporales
  quedó pendiente de finalizar en el ejecutor local después de sus builds; no
  se registra como PASS en esta actualización.
