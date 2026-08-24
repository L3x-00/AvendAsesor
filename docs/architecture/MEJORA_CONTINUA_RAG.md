# Mejora continua gobernada del RAG

**Estado:** implementado y verificado solo en el entorno local el 2026-08-23.  
**No es una base de conocimiento ni un mecanismo de autoentrenamiento.**

## Objetivo

Detectar automáticamente demanda recurrente, consultas ambiguas y falta de
sustento sin convertir contenido conversacional no revisado en una fuente para
respuestas normativas.

## Flujo implementado

```text
turno de chat terminado con éxito
  -> normalización efímera y fingerprint HMAC de servidor
  -> alcance de módulo
  -> observación idempotente por pregunta de usuario
  -> candidato FAQ agregado con métricas por resultado
  -> cola administrativa y decisión append-only
  -> insumo para evaluación, documentación y operación
```

El flujo solo se ejecuta después de que el contrato atómico de chat termina. Un
reintento de la misma pregunta conserva el mismo identificador de observación y
no infla los conteos.

## Datos que se conservan y datos que no

| Elemento | Tratamiento |
| --- | --- |
| Pregunta automática | No se copia a la memoria FAQ. Permanece únicamente bajo el contrato de historial de chat existente. |
| Agrupación | Fingerprint HMAC-SHA-256 de una versión normalizada en memoria, separado por módulo seleccionado o alcance global. Sin secreto de servidor no hay captura. |
| Resultado | Conteos independientes: con evidencia, ambigua y sin evidencia. |
| Trazabilidad | Observación por mensaje y decisión de revisión append-only, inaccesibles para el navegador. |
| Pregunta cruda o reducida, identidad, respuesta y fuentes | No se copian a la memoria FAQ. Permanecen bajo los contratos de chat existentes; no son memoria nueva. |
| Etiqueta legible | Solo puede añadirla un ADMIN/SUPERADMIN al aprobar el patrón; debe ser una descripción operativa impersonal. |
| Corpus RAG | No recibe datos desde esta memoria. Solo procede de PDFs privados, vigentes e indexados. |

La normalización efímera reconoce correo electrónico, enlaces, teléfonos e
identificadores numéricos comunes antes de calcular el HMAC. Se omiten consultas
que señalan contraseña, token, API key o clave secreta. Como la cola no persiste
ese texto, los datos no reconocidos tampoco se replican entre usuarios. Esto no
reemplaza una política formal de privacidad y retención.

## Estados y moderación

| Estado | Significado | Efecto sobre RAG |
| --- | --- | --- |
| `pending_review` | Patrón detectado automáticamente. | Ninguno. |
| `approved` | ADMIN/SUPERADMIN confirma que merece seguimiento operativo, asigna una etiqueta impersonal y tiene al menos una observación con evidencia. | Ninguno. |
| `rejected` | No se prioriza; exige motivo. | Ninguno. |
| `suppressed` | Se excluye de priorización; exige motivo. | Ninguno. |

Los endpoints administrativos son internos y protegidos por el guard de
autorización de NestJS:

- `GET /admin/rag/faq-memory/quality-summary`
- `GET /admin/rag/faq-memory/candidates?status=pending_review&limit=50`
- `PATCH /admin/rag/faq-memory/candidates/:id/review`

El backend comprueba el rol y las RPCs vuelven a comprobar que el actor sea
`admin` o `superadmin`. Las tablas no conceden privilegios a `anon` ni
`authenticated`.

## Cómo se usa correctamente

1. Revisar primero los candidatos de mayor recurrencia, dando prioridad a
   `no_evidence` y `ambiguous`.
2. Para una necesidad real, cargar o actualizar el PDF oficial por el flujo
   documental; nunca pegar una respuesta de chat como conocimiento.
3. Reingestar la versión aprobada y validar sus chunks y fuentes en staging.
4. Añadir el caso, con respuesta esperada y fuentes, a una batería de
   evaluación versionada.
5. Conservar el candidato como señal operativa. Su estado no activa ningún
   comportamiento automático del modelo.

## Evoluciones deliberadamente diferidas

- Agrupación semántica de paráfrasis: requiere evaluación con corpus aprobado,
  presupuesto de embeddings y medición de falsos agrupamientos.
- Caché semántica o respuestas FAQ precompiladas: no se habilita hasta que cada
  respuesta tenga fuentes vigentes y una política explícita de invalidación.
- Fine-tuning, actualización de prompts desde conversaciones o autoingesta: no
  son compatibles con el principio de respuestas normativas sustentadas.
