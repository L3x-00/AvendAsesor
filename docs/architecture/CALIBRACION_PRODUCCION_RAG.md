# Calibración real del RAG en producción

**Estado actual:** no iniciada. Producción contiene únicamente las migraciones
de Hitos 1–2; RAG, chat, FAQ gobernada y hardening existen solo localmente.

## Por qué aún no se ejecuta

Una calibración real requiere cambiar el esquema de producción, procesar PDFs
reales, consumir un proveedor de IA y potencialmente crear trazas de chat. No
es seguro ni verificable hacerlo sin una versión limpia, un corpus aprobado,
respaldo y una autorización explícita sobre el objetivo exacto.

La clave de servidor expuesta sigue con rotación aplazada por el Product Owner.
No se debe usar para habilitar el worker RAG ni para promover Hito 3.

## Gate obligatorio de producción

Antes de ejecutar, deben estar confirmados todos estos elementos:

1. Checkout de release limpio que contenga exclusivamente las migraciones Hito
   3 y de memoria FAQ autorizadas; nunca usar `supabase db push` desde el árbol
   de trabajo sucio.
2. Respaldo verificable y restauración/PITR disponible según el plan Supabase.
3. Corpus inicial de PDFs oficiales, con propietario, vigencia, módulo y
   autorización de uso definidos por AVEND.
4. Cuenta técnica de servidor segura y no expuesta, configurada solo en Render;
   ningún secreto en Vercel, frontend, Git, documentación o chat.
5. Proveedor de embeddings/respuestas autorizado, límite de gasto y clave de
   servidor configurados. El worker empieza apagado y se habilita solo para un
   lote controlado.
   La captura FAQ requiere además un secreto HMAC distinto y exclusivo de
   servidor; si no se configura, permanece desactivada de forma segura.
6. API Render desplegada desde el release, `WEB_ORIGIN` canónico, URLs de Auth
   correctas y prueba de salud autenticada.
7. Batería de evaluación aprobada: preguntas positivas, negativas, ambiguas,
   filtros de módulo y referencias de página esperadas.

## Ejecución propuesta

1. Aplicar la promoción en staging, verificar migraciones, RLS, asesores y
   contratos antes de tocar producción.
2. Cargar un lote pequeño de PDFs aprobados, conservar el worker con
   concurrencia uno y revisar que cada versión quede `indexed` solo al terminar
   coherentemente.
3. Ejecutar la batería de evaluación contra retrieval y chat. Medir cobertura
   de fuentes, precisión de `no_evidence`, precisión de ambigüedad, recall de
   retrieval, latencia p50/p95, errores del worker y costo por consulta.
4. Ajustar umbral, cantidad de resultados o chunking solo cuando los resultados
   estén documentados y no deterioren los casos negativos.
5. Repetir en producción con el mismo lote y una ventana controlada. Validar
   salud, cola, RLS y trazabilidad de fuentes. Mantener la memoria FAQ en
   observación; no habilita respuestas ni ingesta.

## Criterios de salida

Los valores numéricos finales no se inventan antes de tener corpus. AVEND debe
aprobarlos junto con la batería de evaluación. Como mínimos cualitativos:

- ninguna respuesta normativa se guarda sin una o más fuentes de PDF vigente;
- una consulta sin evidencia no llama al generador ni muestra fuentes ficticias;
- una ambigüedad multi-módulo solicita aclaración;
- un cambio de documento invalida el uso de su versión previa;
- las señales FAQ no aparecen en la consulta RAG ni alteran la respuesta;
- todos los errores de proveedor/ingesta quedan trazables y no publican un
  documento como indexado incorrectamente.

## Autorización requerida cuando el gate esté listo

La acción productiva se debe aprobar con este alcance concreto:

```text
OPERATION: Promover el conjunto exacto de migraciones Hito 3 y memoria FAQ,
procesar el lote inicial de PDFs aprobado y ejecutar la batería RAG.
REASON: Calibrar retrieval y chat con evidencia real antes de habilitar el uso
productivo para docentes.
RESOURCE: Proyecto Supabase AVEND ASESOR, API Render y proveedor de IA
configurado únicamente en el backend.
RISK: Consumo de proveedor, cambios persistentes de esquema/datos y una posible
afectación transitoria del servicio.
RECOVERY / BACKUP: Respaldo/PITR validado, release inmutable, worker apagable,
reversión por migración posterior y posibilidad de detener el lote.
ALTERNATIVE: Ejecutar primero la misma calibración en staging con PDFs de
prueba aprobados y no promover hasta obtener resultados aceptados.
```
