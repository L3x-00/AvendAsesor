# Fase 3 — API de módulos y permisos

## Objetivo

Implementar en NestJS la API interna y segura de módulos/procesos: creación, consulta, edición, cambio de padre/orden, activación, desactivación y eliminación lógica. La API será la única frontera de negocio y usará el cliente de servidor de Supabase después de comprobar la identidad y el rol almacenado en base de datos.

## Contrato implementado

- Base de ruta: `/admin/modules`.
- `admin` y `superadmin` pueden crear, listar, obtener, editar, ordenar, activar, desactivar y eliminar lógicamente módulos.
- `docente`, identidad no confirmada, token inválido o ausencia de token reciben denegación antes de llegar al servicio.
- Las entradas se validan con DTOs; los códigos se normalizan a mayúsculas y las respuestas no exponen claves ni errores internos de Supabase.
- El listado filtra por padre y estado; omite bajas lógicas de forma predeterminada.
- Desactivar o eliminar conserva actor, fecha y motivo. La eliminación es exclusivamente lógica; no existe borrado físico en esta API.
- Una migración local añade integridad para impedir módulos hijos bajo un padre eliminado y la eliminación lógica de un módulo con hijos no eliminados. La API verifica el mismo caso para entregar un error claro y la base cubre carreras.

## No incluye

- Endpoints de documentos, carga/descarga de PDFs, URLs firmadas, asociación de documentos o Storage operativo: corresponden a Fase 4.
- Formulario, panel visual o rediseño UI/UX: corresponden a Fase 5 y al trabajo visual posterior.
- RAG, OCR, extracción, colas, chunks, embeddings, vectores, chat o cambios de estados de ingesta.
- Seed de módulos, documentos o administradores; el cliente no ha definido el módulo inicial.

## Verificación ejecutada

1. Probar la integridad de jerarquía adicional en PostgreSQL local desde una migración creada con la CLI de Supabase.
2. Ejecutar pruebas unitarias de DTOs, servicio, gateway y controlador, además de E2E que comprueben `401`, `403`, `404`, validación y el acceso ADMIN/SUPERADMIN.
3. Aplicar la migración a una base local limpia, repetir las regresiones de Fase 2 y ejecutar advisors.
4. Ejecutar la batería completa del repositorio y solicitar revisión independiente de Claude Code antes del cierre.

## Resultado

- Se creó el módulo NestJS `ModulesModule`, el gateway de servidor de Supabase, DTOs validados y respuestas de dominio mapeadas. Las rutas se mantienen bajo `/admin/modules` y no exponen credenciales, mensajes internos de PostgreSQL ni tablas al navegador.
- ADMIN y SUPERADMIN pueden crear, listar, obtener, editar, reubicar, activar, desactivar y eliminar lógicamente módulos. DOCENTE recibe `403`; credenciales ausentes o inválidas reciben `401`. Las bajas lógicas quedan ocultas de las consultas ordinarias.
- La base refuerza la jerarquía frente a carreras: no se puede usar un padre eliminado ni eliminar lógicamente un padre con hijos directos vigentes. El servicio realiza la comprobación amigable y la base conserva la autoridad final.
- No se implementó ninguna operación de documentos, Storage, PDF, URL firmada, UI, RAG, OCR, extracción, vector, seed ni administración de usuarios.
- Verificación aprobada: reset limpio local, 40 pruebas pgTAP, advisors, migraciones locales, regresión real `Test-LocalModulesApi.ps1`, 66 pruebas unitarias de API con el umbral de cobertura, 14 E2E y revisión independiente de Claude Code sin hallazgos aplicables BLOCKER/HIGH/MEDIUM.
