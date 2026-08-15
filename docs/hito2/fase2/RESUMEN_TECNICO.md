# Fase 2 — Datos, versionado, Storage y RLS

## Objetivo

Implementar y blindar la persistencia local de módulos y documentos antes de crear rutas, cargas de archivos o interfaz. La base debe preservar versiones y trazabilidad, impedir exposición pública y quedar preparada —sin ejecutar— para la ingesta de Hito 3.

## Diseño aprobado para la fase

- `modules`: árbol de módulos/procesos/subprocesos con padre opcional, código único, orden entre hermanos, metadatos, activación y baja lógica.
- `documents`: identidad lógica y metadatos normativos; no contiene el archivo ni sobrescribe versiones.
- `document_versions`: archivos PDF inmutables, número de versión, ruta privada, tamaño, páginas, hash e información de carga. En esta fase ninguna columna de la versión puede cambiar; Hito 3 sustituirá explícitamente el guard para permitir transiciones de ingesta controladas.
- `document_modules`: asociación muchos-a-muchos para evitar duplicar el mismo documento normativo cuando aplique a varios módulos.
- `document_audit_events`: registro preparado para las futuras acciones administrativas, sin inventar eventos ni documentos en esta fase.
- Estado de publicación (`active`/`inactive`) separado del estado de ingesta inicial (`pending`). La ingesta real, OCR, extracción, chunks, vectores y RAG siguen fuera de alcance.
- Bucket `normative-documents` privado, máximo 20 MiB y MIME `application/pdf`. El navegador no recibe permiso de Storage directo; la futura API validará y operará mediante el backend.

## No incluye

- Endpoints NestJS, Multer, carga o descarga de archivos, signed URLs, panel administrativo o formularios.
- Documento o módulo inicial, datos de prueba persistentes, seed de negocio o cuenta administrativa.
- DOCX, TXT, imágenes, OCR, extracción, procesamiento de colas, pgvector, embeddings o chat RAG.

## Verificación prevista

1. Crear la migración únicamente con la CLI de Supabase y aplicarla a la base local limpia.
2. Ejecutar pruebas pgTAP de esquema, restricciones, RLS y privacidad de Storage dentro de transacciones reversibles.
3. Ejecutar una regresión real con un usuario local temporal: no puede leer documentos por PostgREST ni cargar directamente al bucket; se elimina siempre al finalizar.
4. Ejecutar advisors de seguridad/rendimiento locales y corregir hallazgos en alcance.
5. Reaplicar todas las migraciones contra el único objetivo local confirmado, sin seed ni recursos remotos.
6. Solicitar revisión independiente de Claude Code y corregir BLOCKER/HIGH antes de cerrar.

## Resultado verificable

- Migración local `20260809194717_create_document_management_foundation.sql` aplicada desde cero sin seed.
- `34` pruebas pgTAP aprobaron modelo, ciclos, referencias compuestas, inmutabilidad, RLS, permisos y bucket.
- `Test-LocalDocumentSecurity.ps1` confirmó con un usuario local real que PostgREST no expone documentos y Storage no permite cargas directas; la cuenta temporal se eliminó.
- `Test-LocalAuthRls.ps1` confirmó que la seguridad de identidad de Hito 1 continúa sin regresión.
- Los advisors locales no encontraron problemas; la batería integral de lint, typecheck, unitarias, E2E y build aprobó.
- La revisión independiente corrigió la mutabilidad residual de ingesta y reforzó la revocación para el rol PostgreSQL `public`. El estado pendiente se conserva inmutable hasta que Hito 3 introduzca su flujo controlado.
