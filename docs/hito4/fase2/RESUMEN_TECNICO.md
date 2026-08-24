# Hito 4 — Fase 2: historial privado y continuidad segura

## Resultado

El historial de chat ya dispone de lectura paginada mediante cursor estable y eliminación lógica limitada al propietario. No hay borrado físico, acceso directo desde navegador ni reactivación de una conversación eliminada.

## Contrato implementado

- `list_chat_conversations_page` ordena por `updated_at DESC, id DESC`; el cursor codifica ambos valores para que una página no repita registros.
- La API solicita una fila adicional para calcular `nextCursor`, conserva un límite externo de 50 y no devuelve más datos que el resumen mínimo de cada conversación.
- `delete_chat_conversation` bloquea el registro, comprueba propietario y estado activo, y marca `is_deleted/deleted_at` de forma atómica.
- Los RPC permanecen sin privilegios para `anon` y `authenticated`; únicamente el adaptador de servidor puede invocarlos.

## Corrección de compatibilidad

La auditoría de regresión identificó que algunos contratos históricos de Hito 3 usan identificadores de prueba sin perfil. La migración correctiva `20260823214500` conserva su eliminación lógica y evita registrar una atribución ficticia. En el flujo real de API el usuario ya fue autenticado y validado contra `profiles`, por lo que sí genera el evento de auditoría de Fase 4.

## Verificación local

- 15 contratos pgTAP específicos de historial: paginación, cursores inválidos, propiedad y doble eliminación.
- Regresión completa de base de datos: 251 contratos superados.
- Pruebas unitarias de API incluidas en la regresión de Fase 4.

## Límites deliberados

- No se purga contenido ni se ofrece restauración administrativa en esta fase.
- No se construye interfaz de historial, responsive ni componentes visuales: quedan diferidos hasta después del cierre del Hito 4.
