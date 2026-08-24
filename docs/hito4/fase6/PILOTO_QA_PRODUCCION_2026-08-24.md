# Hito 4 — Piloto QA ficticio de producción

**Fecha:** 24 de agosto de 2026

**Fuente versionada:** `1898ca5` en `codex/hito4-qa-pilot`
**Objetivo:** habilitar evidencia autenticada de lectura sin cargar datos de
negocio, documentos, fuentes ni respuestas normativas ficticias.

## Datos creados

- Tres cuentas de Auth confirmadas con correos reservados `.invalid` y perfiles
  activos: DOCENTE, ADMIN y SUPERADMIN.
- Siete módulos con el marcador
  `metadata.qa_pilot_id = hito4-qa-pilot-20260824`.
- Cuatro conversaciones del docente, todas con el prefijo
  `QA PILOT 20260824 -` y un único prompt que declara `SIMULACION QA`.

No se insertaron respuestas, fuentes, documentos, PDFs, objetos Storage,
ingestas, chunks, vectores, consultas no resueltas, revisiones ni eventos de
auditoría. La ausencia de respuesta es intencional: una respuesta ficticia sin
fuentes o sin el flujo RAG real incumpliría el contrato de Hito 3.

## Evidencia confirmada

La verificación de base de datos confirmó 3 perfiles activos con los roles
previstos, 7 módulos, 4 conversaciones y 4 prompts. Las tablas
`unanswered_questions` y `operational_audit_events` permanecieron en cero.

Las pruebas de solo lectura contra la API publicada confirmaron:

| Identidad | Verificación | Resultado |
| --- | --- | --- |
| DOCENTE | módulos y 4 conversaciones propias | 200 |
| DOCENTE | acceso administrativo | 403 |
| ADMIN | acceso administrativo y métricas | 200 |
| ADMIN | sistema y gestión de usuarios SUPERADMIN | 403 |
| SUPERADMIN | sistema, usuarios y auditoría vacía | 200 |

## Acceso y custodia

Las cuentas y la contraseña se generaron para este piloto. La contraseña no se
incluye en Git, documentación, consola, Vercel ni Render: está cifrada por
DPAPI para el usuario Windows que ejecutó el piloto y solo se copia al
portapapeles local mediante la confirmación explícita que documenta
`infrastructure/qa/README.md`. Los correos de referencia están definidos en
`Invoke-QAPilot.ps1`; no se usan cuentas de clientes ni correo transaccional.

## Límites y siguiente control

Este resultado valida datos y autorización de API, no una aceptación visual
final. Permanecen pendientes las pruebas visuales autenticadas/responsive y la
decisión formal sobre pruebas que dejan auditoría append-only: borrar historial,
revisar una consulta no resuelta o modificar rol/estado. Esas acciones deben
realizarse en staging desechable o con retención explícita de su evidencia QA en
producción.

## Limpieza

`Invoke-QAPilot.ps1 -Mode Cleanup` elimina únicamente los usuarios, módulos,
conversaciones y mensajes que coinciden con los marcadores y correos exactos
del piloto. No elimina datos ajenos ni registros append-only. La operación
requiere confirmación explícita y una clave moderna transitoria, que no se
persiste en el repositorio ni en proveedores de despliegue.
