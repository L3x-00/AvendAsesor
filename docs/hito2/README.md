# Hito 2 — Administración de módulos y documentos normativos

## Objetivo

Construir la administración segura de módulos/procesos y documentos normativos en PDF, almacenados de forma privada, sin iniciar todavía la ingesta RAG, OCR, extracción, chunks, embeddings ni vectores del Hito 3.

## Límites confirmados

- La ejecución actual es íntegramente local: Docker, Supabase local, PostgreSQL local, Storage local y Mailpit local. No se configura Resend, Brevo, staging, despliegue ni servicios remotos.
- El Hito 2 admite solamente archivos PDF. DOCX, TXT e imágenes quedan fuera de esta entrega.
- No se sembrará un módulo inicial: el cliente todavía no definió su nombre ni contenido. La plataforma permitirá que un administrador autorizado lo cree posteriormente.
- Todo archivo se almacenará en un bucket privado. Ninguna URL pública permanente será una vía de descarga.

## Matriz de autorización confirmada

| Capacidad | `superadmin` | `admin` | `docente` |
| --- | --- | --- | --- |
| Crear, editar, ordenar, activar o desactivar módulos | Sí | Sí | No |
| Cargar, versionar, actualizar, reemplazar, desactivar, desvincular o eliminar lógicamente PDFs | Sí | Sí | No |
| Gestionar usuarios, roles y permisos | Sí | No | No |
| Eliminar permanentemente usuarios | Sí | No | No |
| Configuración global del sistema | Sí | No | No |
| Consultas no resueltas, métricas y plantillas | Sí | Delegado en sus futuros hitos | No |

La API NestJS es la frontera decisiva. La interfaz web solo mejora la navegación y nunca sustituye la comprobación de autorización en servidor.

## Fases

| Fase | Objetivo | Estado |
| --- | --- | --- |
| [Fase 1](fase1/RESUMEN_TECNICO.md) | Entorno local, control técnico y regresión base | DONE |
| [Fase 2](fase2/RESUMEN_TECNICO.md) | Datos, versionado, bucket privado y RLS | DONE |
| [Fase 3](fase3/RESUMEN_TECNICO.md) | API segura de módulos y permisos | DONE |
| [Fase 4](fase4/RESUMEN_TECNICO.md) | API documental y Storage privado | DONE |
| [Fase 5](fase5/RESUMEN_TECNICO.md) | Panel administrativo funcional mínimo | DONE |
| [Fase 6](fase6/RESUMEN_TECNICO.md) | Aceptación local, regresión y cierre técnico | DONE |

Las decisiones persistentes de alcance y seguridad están registradas en `ADR-0006`.

## Estado de esquema remoto

El 2026-08-22, con autorización expresa, se promovieron las cinco migraciones
de Hito 2 desde un checkout limpio del release. El historial remoto y los
asesores quedaron verificados; las migraciones de Hito 3 continúan fuera del
proyecto remoto hasta una promoción independiente.
