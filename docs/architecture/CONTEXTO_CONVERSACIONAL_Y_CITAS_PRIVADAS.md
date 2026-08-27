# Contexto conversacional, cambio de tema y citas privadas

Estado: decisión implementada para cubrir CU-04, CU-05, CU-06 y CU-08.

## Decisiones

1. La conversación se recupera mediante un RPC exclusivo de `service_role` que valida al propietario y rechaza conversaciones eliminadas. El contexto queda limitado a 12 mensajes, 10 000 caracteres totales y 2 000 caracteres por mensaje.
2. La pregunta actual se vectoriza por separado y es la única entrada usada para decidir el módulo. El historial solo amplía la búsqueda dentro del módulo ya seleccionado; nunca decide un cambio de tema.
3. Un cambio claro a otro módulo crea una conversación nueva. Se considera claro cuando el módulo anterior no recupera evidencia o cuando el nuevo módulo lo supera por un margen de relevancia de al menos 0,08. Si ambos compiten, se crea una conversación global nueva, se conservan fuentes deduplicadas y se solicita una precisión sin mezclar evidencia en una respuesta final.
4. El historial se entrega al modelo dentro de un bloque delimitado como dato no confiable. La política de sistema conserva prioridad, exige evidencia vigente y prohíbe obedecer instrucciones encontradas en fuentes o mensajes previos.
5. La API genera un UUID por cita antes del streaming y la finalización atómica lo persiste como `chat_message_sources.id`. Las aclaraciones pueden persistir entre una y diez fuentes vigentes; una respuesta `no_evidence` continúa exigiendo cero fuentes.
6. La descarga de una fuente requiere la cadena `cita -> respuesta -> conversación -> propietario`. El backend recibe la ruta privada mediante un RPC `security definer`, registra la autorización y emite una URL firmada de 60 segundos. La API nunca devuelve bucket ni ruta.

## Flujo

1. Validar identidad, rol y propiedad del contexto solicitado.
2. Clasificar la pregunta actual mediante recuperación global.
3. Recuperar en el módulo seleccionado con contexto acotado cuando no existe cambio claro.
4. Crear o continuar la conversación según el módulo resuelto.
5. Emitir UUID y metadatos de fuentes; generar o aclarar; persistir respuesta y citas de forma atómica.
6. Autorizar cada apertura de fuente de forma independiente y de vida corta.

## Invariantes de seguridad

- No existe acceso directo desde el navegador a Supabase para chat o documentos privados.
- `anon` y `authenticated` no pueden ejecutar los RPC de contexto o autorización de fuentes.
- Una cita ajena o asociada a una conversación eliminada responde como recurso inexistente.
- El cambio de tema no reutiliza contexto ni fuentes del módulo anterior.
- Las respuestas sin evidencia no invocan al proveedor generativo ni almacenan citas.

## Verificación exigida

- Pruebas unitarias de continuidad, límites, historial con forma de inyección, cambio de tema, ambigüedad y URL privada.
- pgTAP de privilegios, propiedad, borrado lógico, auditoría, UUID estable, aclaración con evidencia e idempotencia.
- Ejecución local de pgTAP condicionada a que el stack local de Supabase ya esté disponible; no se debe sustituir por una prueba contra producción.
