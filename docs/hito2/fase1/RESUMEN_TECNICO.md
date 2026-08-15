# Fase 1 — Entorno local, control técnico y regresión base

## Objetivo

Dejar un entorno local aislado y reproducible para Hito 2 antes de cambiar el esquema, crear buckets o escribir módulos de negocio. La fase también consolida el alcance confirmado, los límites de autorización y las pruebas que protegerán el backend documental.

## Incluye

- Puertos exclusivos de Supabase local para no interferir con otros proyectos Docker del equipo.
- Arranque y comprobación local de Mailpit y Supabase, sin recursos remotos.
- Mecanismo seguro para ejecutar API y web contra el stack local sin imprimir, copiar ni sobrescribir secretos existentes en archivos `.env.local`.
- Regresión base de Auth/RBAC y comprobaciones de salud de los servicios que usará Hito 2.
- Plan técnico de las seis fases, matriz de permisos y ADR de alcance local.
- Revisión independiente de Claude Code sobre los cambios de entorno, seguridad y documentación.

## No incluye

- Migraciones de módulos o documentos, buckets, políticas Storage, carga de PDFs o rutas nuevas de negocio.
- Siembra de un módulo inicial: el cliente todavía no lo definió.
- OCR, extracción de texto, colas, chunks, embeddings, pgvector, chat RAG, DOCX, TXT o imágenes.
- Staging, despliegue, Resend, Brevo o cualquier credencial/servicio remoto.
- Seeds de negocio, Studio AI o Storage Vector: se mantienen desactivados hasta que un hito posterior los requiera y autorice.

## Diseño local

```text
Next.js y NestJS
        │ variables efímeras del proceso
        ▼
Supabase local (puerto API 55321) ── PostgreSQL/Storage/Auth locales
        │ buzón local aislado
        ▼
Captura de correo local de Supabase (127.0.0.1:55324)
```

Los archivos `.env.local` existentes se preservan. Los comandos locales derivarán las credenciales temporales directamente del stack local al iniciar el proceso, por lo que ninguna clave local queda documentada ni versionada.

```powershell
.\infrastructure\local\Invoke-LocalEnvironment.ps1 -Target api -Command npm run dev:api
.\infrastructure\local\Invoke-LocalEnvironment.ps1 -Target web -Command npm run dev:web
.\infrastructure\local\Test-LocalAuthRls.ps1
```

Ambos comandos rechazan una URL que no sea `localhost` o `127.0.0.1` y solo inyectan valores en el proceso que lanzan.
La regresión de Auth crea y borra cuentas temporales locales; comprueba registro, confirmación, login, recuperación y el perfil RLS de rol `docente`.

## Criterios de salida

- Docker ejecuta Mailpit y el stack local de Supabase de AVEND ASESOR sin colisionar con otros proyectos.
- Auth, Storage y PostgreSQL local están sanos; la captura de correo local queda expuesta solo por loopback.
- Los comandos de desarrollo pueden apuntar a Supabase local sin revelar ni reemplazar secretos preexistentes.
- Lint, typecheck, pruebas y build preservan la línea base, o cualquier bloqueo se registra con evidencia.
- Claude Code ejecuta una revisión independiente y no deja hallazgos `BLOCKER` o `HIGH` abiertos.

## Riesgos

- No existe módulo inicial definido; Fase 2 no debe inventar ni sembrar datos de negocio.
- La estructura de historial de documentos y los estados de publicación/ingesta se diseñarán antes de la primera migración en Fase 2.

## Cierre de ejecución — 2026-08-09

- Se aisló el rango de puertos de Supabase para coexistir con otro proyecto local sin detenerlo.
- Se adoptó la captura local de correo integrada de la CLI; el contenedor actual se denomina `inbucket`, pero su URL de prueba se expone también como `MAILPIT_URL`. No hay entrega a Internet.
- Se añadieron `Invoke-LocalEnvironment.ps1` y `Test-LocalAuthRls.ps1`. Ambos usan claves obtenidas en tiempo de ejecución desde el stack local y nunca escriben credenciales.
- La regresión de Auth/RLS y la puerta completa de calidad aprobaron. Claude Code realizó una revisión y re-revisión independiente sin hallazgos `BLOCKER`, `HIGH` ni `MEDIUM` abiertos.
