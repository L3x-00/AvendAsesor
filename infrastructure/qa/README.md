# Piloto QA ficticio de producción

`Invoke-QAPilot.ps1` prepara un conjunto mínimo para comprobar las superficies
de lectura de Hito 4 en producción. No es un seed automático de Supabase y no
se ejecuta mediante `supabase db push --include-seed`.

## Alcance exacto

- Tres cuentas de Auth con correo reservado `.invalid`, confirmadas sin enviar
  correo, y perfiles `docente`, `admin` y `superadmin`.
- Siete módulos visuales con `metadata.qa_pilot_id`.
- Cuatro conversaciones de la cuenta docente, todas con el prefijo
  `QA PILOT 20260824 -` y una pregunta que declara explícitamente su naturaleza
  de simulación. No se inserta una respuesta ficticia: una respuesta sin fuentes
  o sin el flujo RAG real incumpliría el contrato de chat.

No crea documentos, PDFs, objetos Storage, chunks, vectores, fuentes,
proveedor IA, ingesta, preguntas no resueltas, revisiones ni eventos de
auditoría. Por ello no fabrica sustento normativo ni habilita RAG.

## Seguridad operacional

- Por defecto solo muestra el plan. Para aplicar o limpiar requiere
  `-AcknowledgeProductionQaPilot` y una clave temporal moderna
  `SUPABASE_QA_PILOT_SECRET_KEY` con prefijo `sb_secret_`.
- La clave nunca se escribe, imprime ni acepta en argumentos. El script rechaza
  claves legacy `service_role` y la envía únicamente como `apikey`, nunca como
  bearer token.
- Al crear por primera vez las cuentas, genera una contraseña y la almacena
  cifrada con DPAPI para el usuario Windows que ejecutó el piloto, en una ruta
  ignorada por Git. No se guarda ninguna contraseña en código, documentación ni
  salida de consola. El titular local puede copiarla al portapapeles solo tras
  confirmación explícita con `Copy-QAPilotPassword.ps1`; debe limpiar el
  portapapeles tras iniciar sesión.
- Los roles se establecen solo cuando la cuenta acaba de crearse. Si una cuenta
  QA existente tiene un rol distinto, el script falla sin sobrescribirla.
- La promoción inicial de ADMIN y SUPERADMIN es una excepción única y acotada:
  usa privilegio de servidor solo sobre perfiles recién creados y ficticios,
  antes de que existan flujos de negocio. No simula un cambio de rol de usuario
  ni crea una evidencia de auditoría falsa.
- La limpieza solo considera los tres correos QA exactos, conversaciones con el
  prefijo exacto y módulos cuyo `metadata.qa_pilot_id` coincide. Antes de tocar
  una cuenta, verifica también `user_metadata.qa_pilot_id`; una coincidencia de
  correo sin ese marcador detiene la operación.

## Límite deliberado

Las acciones de borrar historial, revisar una pregunta no resuelta o cambiar
roles desde la interfaz crean evidencias append-only. No se incluyen en este
piloto reversible: para probarlas se debe elegir un staging desechable o
autorizar expresamente conservar esos eventos QA en producción.

Por el mismo motivo, este piloto solo comprueba los estados vacíos de Operación
y Auditoría. No constituye aceptación de sus vistas pobladas.

## Cierre de la operación

El proceso que aplica el piloto debe terminar con
`SUPABASE_QA_PILOT_SECRET_KEY` fuera de su entorno de proceso; nunca se agrega a
un archivo `.env`, a Vercel, a Render ni a Git. Si se emitió una clave moderna
exclusivamente para este piloto, su revocación o rotación se realiza después en
una operación de credenciales aprobada y separada. Esta herramienta no crea,
rota ni revoca claves de Supabase.
