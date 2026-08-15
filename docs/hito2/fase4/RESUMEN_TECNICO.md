# Fase 4 — API documental y Storage seguro

## Objetivo

Implementar únicamente el backend local para gestionar documentos normativos en PDF: validación real de tipo, tamaño y páginas; metadatos; versionado inmutable; asociación a módulos; desactivación y baja lógica; y acceso temporal autorizado a un bucket privado.

## Contrato de la fase

- Base de ruta: `/admin/documents`; todas las rutas exigen identidad confirmada y rol `admin` o `superadmin`.
- El API acepta un solo PDF no vacío por solicitud, de hasta 20 MiB y hasta 300 páginas. No confía en extensión ni `Content-Type`: inspecciona el contenido y calcula SHA-256 antes de persistir.
- Crear y versionar nunca reemplaza un objeto existente. Cada versión obtiene una ruta UUID nueva y permanece inmutable.
- Los cambios de documento, versión o enlace a módulo escriben su evento de auditoría dentro de la misma operación de base de datos. El objeto de Storage se compensa si la persistencia posterior falla.
- El bucket permanece privado. El API emite una URL firmada de descarga de vida corta solo tras comprobar identidad, rol y existencia activa del documento/version.
- La baja lógica conserva objetos, versiones y auditoría. No existe una ruta de borrado físico.

## Implementado

- `POST /admin/documents`: carga multipart de un PDF validado y crea documento, versión inicial, asociaciones y auditoría de forma consistente.
- `GET /admin/documents`: lista paginada de 1 a 100 documentos (25 por defecto), siempre excluyendo bajas lógicas. `GET /admin/documents/:id` devuelve historial y módulos sin ruta de Storage ni checksum.
- `POST /admin/documents/:id/versions`, `PATCH /admin/documents/:id`, `PATCH /admin/documents/:id/status`, `POST`/`DELETE` de asociaciones y `DELETE /admin/documents/:id` gestionan el ciclo administrativo sin eliminar ninguna versión física.
- `POST /admin/documents/:id/download-url` genera una URL firmada privada de 60 segundos para una versión perteneciente al documento activo. Antes de responder registra `download_url_generated` en la auditoría append-only.
- `PdfInspectionService` verifica bytes de cabecera y estructura PDF con el parser, límite de 20 MiB/300 páginas, nombre saneado y SHA-256. Multer aplica el mismo límite temprano.
- La API carga primero en la ruta UUID inmutable y persiste por RPC. Ante un fallo, verifica si la versión alcanzó la base antes de compensar; un resultado no verificable no borra el objeto y se registra de forma segura.

## Evidencia de cierre

- Migraciones locales limpias hasta `20260809220458_document_download_audit.sql`; `supabase test db --local`: 70 pruebas pgTAP aprobadas; `supabase db advisors --local`: sin incidencias.
- `Test-LocalDocumentsApi.ps1 -ResetAfter`: PASS. Ejercita un PDF real contra el backend compilado, denegación de `docente`, denegación de Data API/Storage directo, versiones, asociaciones, metadatos, ciclo lógico, URL firmada privada, descarga y su auditoría; termina restableciendo solo la base local.
- API: typecheck y lint PASS; 102 pruebas unitarias y cobertura 94.93 % statements / 80.17 % branches; API E2E: 19 PASS. Las regresiones de Auth/RLS, seguridad documental y módulos también aprobaron. `ai-status.ps1 -RunProjectChecks` completó además lint, typecheck, pruebas y build de API/Web.
- Claude Opus revisó el servicio de forma independiente. Los hallazgos HIGH iniciales de compensación, limpieza y paginación se corrigieron; la segunda revisión no encontró BLOCKER ni HIGH. ADR-0009 documenta los límites residuales de idempotencia y reconciliación.

## No incluye

- Interfaz de administración, rediseño visual o navegador de documentos.
- OCR, extracción de texto, colas, ingesta RAG, chunks, embeddings, vectores, chat o cambios al estado de ingesta `pending`.
- DOCX, TXT, imágenes, URLs públicas, Storage directo desde navegador, proveedores remotos o datos de negocio sembrados.

## Plan de verificación

1. Aplicar las migraciones desde una base local limpia y ampliar las pruebas pgTAP para RPC, privilegios, auditoría e integridad.
2. Probar unidad, E2E y una regresión real con usuarios locales efímeros: PDF válido, rechazo por tipo/tamaño/páginas, versión, asociación, desactivación, baja y URL temporal.
3. Confirmar que una sesión `docente` no puede consultar datos, subir objetos ni usar rutas documentales; confirmar que nunca se entrega una URL pública.
4. Ejecutar advisors, regresiones de fases anteriores, calidad integral, revisión independiente y documentación/memoria antes del cierre.
