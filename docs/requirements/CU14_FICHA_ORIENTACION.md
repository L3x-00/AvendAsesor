# CU-14 — Ficha de orientación AVEND

## Alcance implementado

La primera plantilla es una **ficha de orientación informativa**. No constituye
un acto administrativo, resolución ni constancia, y no reemplaza la normativa
vigente. La acción aparece únicamente en respuestas de rol `assistant` que ya
terminaron y conservan al menos una fuente verificable. No aparece durante el
streaming ni para aclaraciones, falta de evidencia o respuestas sin fuentes.

La ruta protegida de vista previa es
`/chat/:conversationId/orientacion/:messageId`. El servidor vuelve a autenticar
al usuario y recupera la conversación propia mediante la API. Una conversación
ajena, un mensaje inexistente, un mensaje que no sea respuesta de asistente, una
respuesta sin fuente o una respuesta sin su consulta previa producen un rechazo
cerrado.

## Datos y frontera de confianza

La pregunta, la orientación, la fecha y las citas siempre proceden de la
conversación recuperada por el servidor. El cliente solo puede aportar estos
datos opcionales de presentación:

| Campo | Límite |
| --- | ---: |
| Nombre del docente | 160 caracteres |
| Institución educativa | 200 caracteres |
| Título del caso | 200 caracteres |
| Notas del caso | 1 500 caracteres |

Los campos se normalizan como texto plano, se eliminan caracteres de control y
marcadores HTML, y se neutralizan inicios con forma de fórmula. No se interpreta
HTML. Los nombres de descarga se sanean por separado y se envían con un nombre
ASCII compatible y otro UTF-8 según RFC 5987.

## Descarga y fuentes

El Route Handler
`POST /api/chat/conversations/:conversationId/messages/:messageId/orientacion/:format`
admite `docx` y `pdf`, revalida la sesión y vuelve a consultar la conversación
antes de producir el binario. Responde con MIME, tamaño,
`Content-Disposition`, `no-store` y `nosniff`.

Cada fuente usa el UUID persistido de la cita. La interfaz abre
`GET /api/chat/sources/:sourceId/download` en una pestaña nueva. Ese BFF obtiene
la sesión verificada, consume
`GET /chat/sources/:sourceId/download-url` y redirige a la URL firmada de corta
duración; no entrega el bearer token ni una ruta privada en HTML o JavaScript.

Contrato backend requerido para la fuente:

```json
{
  "sourceId": "uuid",
  "url": "https://...",
  "expiresAt": "fecha ISO"
}
```

La respuesta se valida de forma estricta y la URL debe usar HTTP o HTTPS. El
catálogo de módulos conserva una revalidación máxima de 120 segundos y queda
etiquetado como `chat-modules` para que la administración pueda invalidarlo.

## Verificación mínima

- Visibilidad de la acción solo para respuestas elegibles.
- Protección de vista previa y exportación ante mensajes ajenos o no elegibles.
- Validación y saneamiento de campos, contenido y nombres.
- Firmas binarias OOXML (`PK`) y PDF (`%PDF-` / `%%EOF`).
- MIME y `Content-Disposition` de DOCX/PDF.
- Enlaces de fuente accesibles, metadatos completos y apertura en pestaña nueva.
- BFF sin token de sesión en el cuerpo y fallos upstream convertidos en errores
  seguros.

Esta evidencia es local. La integración real depende de que el backend publique
el UUID de cada cita y el endpoint autenticado anterior; no equivale a una
validación en staging, producción ni a aceptación contractual del cliente.
