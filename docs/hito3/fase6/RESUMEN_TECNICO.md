# Hito 3 — Fase 6: aceptación y cierre técnico local

## Objetivo

Demostrar localmente CA-06 a CA-11, ejecutar regresiones de los Hitos 1 y 2,
documentar límites y preparar el cierre sin confundir evidencia local con
aprobación contractual.

## Puerta reproducible

`infrastructure/local/Test-LocalHito3Closure.ps1` rechaza un Supabase que no
sea loopback y ejecuta, sin resetear datos ni usar claves de proveedor:

1. 124 contratos pgTAP, incluidos los contratos de RAG y de chat;
2. asesores de base de datos y el historial local de migraciones;
3. cobertura API y web, E2E del API, typecheck, lint y build;
4. auditoría de dependencias de producción y `git diff --check`.

## Matriz local de aceptación

| Criterio | Evidencia local automatizada | Estado técnico |
| --- | --- | --- |
| CA-06 — Chat con streaming | Servicio, controlador SSE, BFF y panel consumen eventos tipados y finalizan de forma segura | REVIEW |
| CA-07 — Filtro por módulo | Retrieval con filtro duro y contrato de fuentes/módulo | REVIEW |
| CA-08 — Ambigüedad | Caso multi-módulo sin intersección, sin llamada al proveedor | REVIEW |
| CA-09 — Fuentes explícitas | Citas de chunks validadas y persistidas con snapshot verificable | REVIEW |
| CA-10 — Sin evidencia | Resultado determinista, sin proveedor ni fuente ficticia y cola de no resueltas | REVIEW |
| CA-11 — Chunks y vectores | Worker, OCR selectivo, chunking, vector de 1536, cola e índices cubiertos sin red | REVIEW |

## Límite de evidencia

La matriz demuestra el contrato local con dobles deterministas y la base local.
No afirma que se haya realizado una generación real: falta una clave de
proveedor autorizada, documentos de negocio aprobados y una validación remota
separada. Esos insumos son necesarios para calibrar el umbral y obtener la
aceptación contractual, pero no para verificar los guardrails ni la seguridad
del código.
