# MinerU, tablas y páginas en el RAG

## Decisión

MinerU se integra como **preprocesamiento opcional**, no como dependencia del
runtime de la API. La API corre en Render Free (512 MB) y no puede cargar los
modelos de MinerU sin arriesgar el worker de ingesta, el chat y el OCR actual.
El PDF sigue siendo la fuente canónica de la cita y del visor; MinerU solo
enriquece el texto que se indexa.

Flujo:

1. Un operador convierte el PDF con MinerU 4.0.12.
2. El Markdown resultante se guarda como sidecar privado junto al PDF:
   `documents/<documento>/versions/<version>.pdf.mineru.md`.
3. El worker de ingesta intenta leer ese sidecar. Si existe y es válido, usa
   sus páginas y tablas; si falta, está deshabilitado o no cumple el contrato,
   ejecuta la extracción PDF anterior sin cambiar el trabajo.
4. Las citas conservan la página física del PDF porque el Markdown trae
   marcadores `<!-- page N of M -->` generados por MinerU.
5. Las tablas se conservan como bloques Markdown con sus filas y columnas; el
   troceo y el prompt ya no las aplanan en una sola línea. Las respuestas
   salariales con tablas se retienen hasta comprobar que el importe y su
   condición (jornada, vínculo, escala o período) están en la misma fila; si no
   coinciden, se pide una precisión en vez de mostrar una cifra dudosa.

No hay migración de base de datos ni cambio de contrato del chat. El sidecar es
un objeto opcional de Storage, no una versión documental nueva.

## Requisitos

- MinerU 4.0.12 instalado en un entorno local (por ejemplo, `.mineru/`).
- El servidor local de MinerU iniciado:
  `.mineru/Scripts/mineru.exe server start` (Windows) o
  `.mineru/bin/mineru server start` (Linux/macOS).
- Para subir el sidecar a producción: Supabase CLI autenticada con acceso al
  proyecto y un administrador que figure como solicitante del reencolado.

MinerU es una herramienta de escritorio/operación. No se ejecuta en Render.

## Conversión local

```powershell
# Genera norma.pdf.mineru.md junto al PDF
npm run rag:mineru -- --file "D:\documentos\norma.pdf"

# O indica la salida y arranca el servidor si hace falta
npm run rag:mineru -- --file "D:\documentos\norma.pdf" `
  --output "D:\documentos\norma.mineru.md" --start-server

# Ejecutable alternativo (también se puede definir MINERU_BIN)
npm run rag:mineru -- --file "D:\documentos\norma.pdf" `
  --mineru "C:\ruta\mineru.exe"
```

El comando imprime páginas detectadas, líneas de tabla y tamaño. Si el
Markdown no trae marcadores de página, falla en vez de subir un sidecar que
perdería la ubicación de las citas.

También se puede subir el `.md` desde el panel como **Nueva versión**. En ese
caso el documento pasa a ser Markdown y el visor deja de ser PDF; para conservar
el PDF y sus páginas se recomienda el sidecar.

## Sidecar en un proyecto Supabase

Primero un dry run: descarga, convierte y deja el PDF y el Markdown temporales
para revisión, sin escribir nada en Supabase. El comando exige que las páginas
sean contiguas y que el total coincida con el PDF registrado; si no, falla
antes de subir nada.

```powershell
npm run rag:mineru -- --project-ref <ref> --version <document_version_id> `
  --actor-email <correo-admin>
```

Después de revisar el Markdown, autoriza la subida y el reencolado:

```powershell
npm run rag:mineru -- --project-ref <ref> --version <document_version_id> `
  --actor-email <correo-admin> --confirm-upload
```

La clave `service_role` se pide a la CLI en memoria y nunca se imprime. El
comando sube `${storage_path}.mineru.md` y llama a
`retry_document_ingestion`; el worker reemplaza los fragmentos del documento.

## Contrato del sidecar

- Debe empezar cada página con `<!-- page N -->` o `<!-- page N of M -->`.
- Las páginas deben ser contiguas desde la 1 hasta `M`; un hueco, una página
  vacía o un total declarado distinto del último marcador invalida el sidecar.
- Si el PDF tiene un total verificado, `M` debe coincidir exactamente.
- Se aceptan tablas Markdown (`| ... |`), listas y encabezados.
- Se descartan imágenes y comentarios HTML que no sean marcadores de página.
- Tope: 8 MiB y 5 millones de caracteres. Si se excede, se ignora el sidecar.
- Un sidecar inválido nunca rompe la ingesta: se registra un aviso y se usa la
  extracción PDF y su OCR. No se indexa una conversión parcial.

## Variable de entorno

| Variable | Default | Efecto |
| --- | --- | --- |
| `RAG_MINERU_SIDECAR_ENABLED` | `true` | Si es `false`, el worker no busca sidecars y usa siempre la extracción PDF. |

## Verificación después de reindexar

1. En el panel, confirma que la versión volvió a `indexed`.
2. Pregunta por un dato que esté dentro de una tabla del documento.
3. Comprueba que la cita muestre el rango de páginas del PDF original.
4. Pregunta por un requisito o plazo que antes caía en «sin evidencia» y
   compara la respuesta con el PDF.
5. Si el resultado no convence, elimina el sidecar de Storage y reencola: la
   ingesta vuelve a la extracción anterior sin tocar el PDF ni la base.

## Límites conocidos

- Solo mejora los documentos que se conviertan y reencolen; no reescribe el
  corpus por sí solo.
- Un PDF escaneado sin capa de texto sigue dependiendo de MinerU/OCR; el OCR
  local anterior se conserva como respaldo.
- MinerU puede cambiar el orden de bloques. Los marcadores permiten detectar
  páginas fuera de rango, huecos y páginas vacías, pero la revisión humana del
  Markdown sigue siendo necesaria antes de autorizar la subida.
- Las tablas complejas con celdas combinadas pueden requerir revisión manual.
- El sidecar no está vinculado criptográficamente al PDF: debe generarse desde
  la misma versión que se va a citar. Si se reemplaza el PDF, hay que regenerar
  o eliminar el sidecar (véase TD-008).
- Una tabla de más de 800 tokens puede partirse en ventanas de tokens y perder
  el encabezado en la segunda ventana (véase TD-007).
