# Plan de mejoras de interfaz — 29 de septiembre de 2026

## Objetivo

Reducir pasos y ambigüedad en Módulos, Usuarios, Historial y Mi perfil, sin cambiar las reglas de acceso ni ocultar información necesaria para completar una operación.

## Decisiones de diseño

1. **Confirmar antes de reaccionar.** Los modales se cierran y los elementos nuevos se resaltan únicamente después de que el servidor confirma el guardado.
2. **Conservar el contexto.** La carga iniciada desde Normativa, Cronograma, Anexos o Preguntas frecuentes fija el módulo o submódulo y el tipo de contenido. Normativa conserva una elección acotada porque incluye varias clases legales.
3. **Mostrar lo necesario primero.** La carga contextual prioriza archivo, título y clasificación; los datos complementarios quedan plegados.
4. **Separar operaciones independientes.** En Perfil, los datos personales y el correo se guardan por separado. El cambio de correo conserva la confirmación de Supabase y evita estados parciales entre identidad y perfil.
5. **Mantener acciones predecibles.** La eliminación del historial vuelve a la primera página y actualiza la lista, evitando reutilizar un cursor que dejó de ser válido.
6. **Accesibilidad desde el componente.** Controles de al menos 44 px, foco visible, nombres accesibles, mensajes asociados al campo y movimiento reducido cuando el sistema lo solicita.

## Alcance implementado

### Módulos y submódulos

- Estado Activo/Inactivo alineado en todas las tarjetas.
- Acción Crear ubicada al extremo izquierdo.
- Cierre automático del modal tras éxito.
- Foco, desplazamiento y resaltado temporal del elemento recién creado.
- El mismo comportamiento se aplica a módulos y submódulos.

### Carga contextual de documentos

- El módulo o submódulo queda fijado por la pantalla de origen.
- Anexo, Cronograma y Preguntas frecuentes quedan preseleccionados y bloqueados.
- Normativa muestra únicamente tipos normativos válidos.
- Formulario resumido con datos opcionales plegados.
- La clasificación enviada al servidor determina la sección donde aparece el documento.

### Usuarios

- Barra de acciones compacta.
- Altas de usuario y administrador conservan prioridad visual.
- Importar y Exportar Excel usan presentación secundaria.
- Cada formulario se despliega de manera independiente y adaptable a móvil.

### Historial

- Confirmación visible: «Historial quitado correctamente.»
- Retorno limpio a `/history` y actualización de la lista.
- Se elimina la dependencia del cursor anterior después de borrar una conversación.

### Mi perfil

- Edición de nombre, teléfono, departamento y ciudad.
- Cambio de correo mediante confirmación en el nuevo correo.
- Cerrar sesión en la cabecera.
- Accesos rápidos convertidos en tarjetas de acción con icono y dirección visible.
- Migración con permisos por columna y política RLS limitada al perfil propio.

## Criterios de aceptación

- Ningún modal se cierra cuando el servidor devuelve error.
- El usuario recién creado en Módulos queda visible, enfocado y resaltado.
- Una carga contextual no permite cambiar de módulo por accidente.
- El documento aparece en la categoría seleccionada.
- Abrir un alta en Usuarios no altera visualmente las otras acciones.
- Borrar una conversación no muestra el límite global de error.
- Un usuario autenticado puede modificar solo sus campos personales; no puede cambiar rol, estado ni vigencia.
- El cambio de correo requiere confirmación y vuelve a Mi perfil.

## Verificación prevista

- Pruebas unitarias y de interacción focales.
- Suite web completa, lint, TypeScript y build de producción.
- Prueba pgTAP del perfil propio y revisión de seguridad de Supabase.
- Revisión independiente del diff antes de integrar.
