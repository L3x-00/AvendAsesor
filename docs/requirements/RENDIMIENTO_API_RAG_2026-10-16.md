# Memoria y recursos de la API/RAG

Fecha: 16 de octubre de 2026. Rama: `codex/optimizar-memoria-rag`.
Base verificada: `main@db8ddf1`, incluidos los PR #110–#123: recuperación/síntesis,
calidad RAG, aclaraciones, identidad normativa, RSG y presentación ya integrados.
Implementación: `158c7a6`; corrección del drenaje auditado: `55cf358`.
Alcance: rendimiento del backend NestJS e ingesta.

## Problemas encontrados y correcciones

1. **Dependencias pesadas al arrancar.** La entrada principal de `js-tiktoken`
   incluye todos sus vocabularios incluso cuando el codificador se construye
   después. PDF.js/canvas, Word y OCR también se importaban al cargar los
   servicios. Se carga únicamente el mismo `o200k_base` cuando hace falta y se
   difieren los extractores hasta su primer uso. Se conservan el tokenizador,
   los tamaños de fragmento y el solapamiento.
2. **Trabajo que sobrevivía al plazo máximo.** `Promise.race` devuelve el control,
   pero no detiene la operación que perdió. Ahora el vencimiento cancela las
   peticiones de embeddings y el OCR, verifica cancelación entre etapas y evita
   empezar nuevas escrituras. La plaza permanece ocupada hasta que se drenen la
   tarea y su última renovación de lease. Una renovación lenta ya no crea otra
   petición pendiente en cada intervalo ni en cada trabajo siguiente.
3. **Cierre OCR que no significaba salida del hilo.** La implementación instalada
   de Tesseract 7 devuelve inmediatamente desde su wrapper `terminate` y descarta
   la promesa del hilo nativo. Se registra el evento `exit` antes del cierre y se
   espera una única promesa de liberación, incluso tras cancelación. Una prueba
   con un Worker real reproduce el wrapper que resuelve antes de su salida.
4. **Embeddings de todo el documento en una respuesta.** Ahora se solicitan lotes
   secuenciales de hasta 32 entradas. Se mantiene su orden y dimensión y se
   rechazan índices duplicados/faltantes. Todos los lotes deben validarse antes
   de borrar fragmentos existentes; un lote posterior fallido no entrega un
   resultado parcial. El proveedor, modelo, precisión numérica y límites del
   chat permanecen configurados como antes.
5. **Copias redundantes y cálculo sin consumidor.** Se elimina una copia del PDF
   que `PDFParse` ya realiza internamente y se usan vistas del PNG respetando
   desplazamiento y longitud. Los PNG reconocidos salen del mapa del lote.
   En la ruta de referencia exacta se omite el segundo embedding de módulo,
   porque esa ruta solo usa el vector global. La búsqueda semántica conserva
   sus dos vectores cuando son distintos y necesarios.

La inspección de conexiones y consultas encontró un cliente Supabase compartido
con persistencia y auto-renovación de sesión desactivadas; retrieval solicita
hasta diez candidatos por búsqueda y no carga los vectores del corpus en Node.
Los registros de tokens y cachés existentes tienen límites o poda. No se añadió
una caché de autorización, una reducción de evidencia ni una migración para
resolver un problema que no quedó demostrado en esas áreas.

## Medición reproducible

El arnés de producto es [`benchmark-api-memory.mjs`](../../scripts/benchmark-api-memory.mjs).
Ejecuta Nest completo y las clases compiladas en un proceso nuevo por muestra.
Usa Windows x64, Node 24.14.0, heap de 384 MiB, un directorio temporal sin archivos
de entorno y una lista permitida de variables sin credenciales. El proveedor de
embeddings es un servidor HTTP en loopback que vive fuera del proceso medido.
No se usa el corpus ni servicios de producción.

Se registran RSS, máximo RSS del proceso, heap, memoria externa, CPU y tiempo;
el pico proviene de `process.resourceUsage().maxRSS`, además del muestreo. El GC
forzado solo se usa para comparar memoria retenida en el arnés. RSS incluye
memoria nativa; el límite de heap **no** es un límite de RAM de 512 MB ni reproduce
el contenedor de Render. Definiciones: [memoria del proceso en Node 24](https://nodejs.org/docs/latest-v24.x/api/process.html#processmemoryusage)
y [terminación de Workers](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate).

Tres muestras por escenario, medianas de la compilación final:

| Escenario                                   | RSS/pico antes (MiB) | RSS/pico después (MiB) | Tiempo de operación antes → después |
| ------------------------------------------- | -------------------: | ---------------------: | ----------------------------------: |
| Arranque, RSS tras GC                       |               157,30 |                 122,16 |             arranque 2671 → 1950 ms |
| Troceo de 600 artículos, pico               |               351,89 |                 330,63 |                      1929 → 2089 ms |
| Ingesta Markdown de 600 fragmentos, pico    |               389,25 |                 359,23 |                      2450 → 2506 ms |
| Extracción de 5 páginas y rasterizado, pico |               206,26 |                 194,04 |                       969 → 1444 ms |
| OCR local de una página, pico               |               272,89 |                 252,39 |                      1279 → 1681 ms |

Reducciones observadas: RSS de arranque **22,3 %**; pico de ingesta **7,7 %**;
pico de OCR sintético **7,5 %**. Los procesos son nuevos por muestra; el escenario
OCR comparte caché local de idioma entre muestras de una misma ejecución. No se
describen todas como muestras sin caché. No se midió una carga sostenida.

La carga diferida traslada coste al primer uso de cada extractor. No hay mejora
universal demostrada de CPU o latencia: la CPU de la ingesta en este ensayo pasó
de 2891 a 2859 ms, diferencia pequeña con solo tres muestras. Los 600 textos
pasan de una solicitud de embeddings a 19
solicitudes secuenciales; una red real puede aumentar la duración. Se prioriza
acotar el pico de decodificación y evitar solapamientos.

Los hashes completos de los 600 fragmentos y sus metadatos, de los vectores
persistidos en lotes de 25 y de los textos/PNG de PDF coinciden antes y después
en las tres muestras. También coincide el texto reconocido por Tesseract real
en la página sintética. Esto verifica igualdad en esas entradas; no reemplaza
una campaña semántica con corpus real.

Datos conservados: [base](../performance/2026-10-16-api-memory/before.json),
[base OCR](../performance/2026-10-16-api-memory/ocr-before.json) y
[compilación final](../performance/2026-10-16-api-memory/after.json).

Reproducción después de compilar, sin otras pruebas/builds simultáneos:

```powershell
npm run build --workspace=api
node scripts/benchmark-api-memory.mjs --scenarios boot,chunk,ingest,pdf,ocr --runs 3 --output resultado.json
```

`--dist <directorio>` permite medir una compilación base conservada como artefacto
sin cambiar el checkout. Los JSON registran hashes SHA-256 de los módulos
compilados para identificar la versión medida.

## Verificación y límites

La auditoría independiente R1 detectó los dos casos de drenaje de recursos
descritos arriba; se corrigieron mediante propiedad conjunta de recursos y
contrapruebas. Un auditor nuevo revisó la corrección R2: **APPROVE**, ambos HIGH
resueltos y sin nuevos BLOCKER/HIGH confirmados. Nueve mutaciones verificadas
hicieron fallar sus pruebas y restauraron los archivos con hash idéntico.

Verificación final: **API 113 suites / 1602 pruebas**, cobertura global
93,46 % de sentencias / 84,53 % de ramas / 94 % de funciones / 95 % de líneas;
**E2E 2 suites / 35 pruebas**; tipos, lint, build, formato focal, sintaxis del
arnés y `git diff --check` PASS. Tras compilar otra vez, los seis hashes de
módulos del JSON final siguen coincidiendo con los artefactos.

No cambian autenticación, RBAC/RLS, tablas, Storage, proveedores, prompts,
aplicabilidad salarial/temporal, identidad exacta, top-k, saneamiento, límites
OCR, citas, ubicaciones ni texto histórico. No se reindexa ni modifica el corpus.

Los fallos de recursos encontrados son demostrables con sus contrapruebas, pero
no se ha establecido que causaran un reinicio concreto de producción. Estos
ensayos no prueban ausencia de fugas sostenidas ni garantizan caber en Render
con PDFs grandes, OCR extenso y cargas simultáneas. La descarga, el parseo y las
RPC sin cancelación nativa pueden retener una plaza hasta que respondan: se
impide lanzar otra ingesta sobre recursos que siguen ocupados. El worker sigue
compartiendo RAM/CPU con las peticiones HTTP.

La validación posterior en Render requiere desplegar esta rama e inspeccionar
RSS/CPU y reinicios durante carga representativa. Ese resultado no se atribuye
a esta verificación local.
