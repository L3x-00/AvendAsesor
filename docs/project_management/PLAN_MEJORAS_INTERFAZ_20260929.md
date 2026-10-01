# Plan de mejoras de interfaz — 29 de septiembre de 2026 (revisado el 1 de octubre de 2026)

> Revisión TSK-0070. Una auditoría del PR #89 encontró que esta versión resumía lo
> implementado, pero no explicaba la mejor manera de hacer la carga contextual. También
> atribuía el error de Historial a una causa equivocada. Este documento corrige ambas
> cosas y describe el diseño vigente.

## Objetivo

Reducir pasos y ambigüedad en Módulos, Usuarios, Historial y Mi perfil sin cambiar las
reglas de acceso ni ocultar información necesaria para completar una operación. El
público son docentes y profesionales de 30 años o más, así que priorizamos:

- comprensión inmediata;
- texto de al menos 16 px y botones de al menos 44 px;
- etiquetas visibles junto a los iconos;
- respuesta visible a cada acción;
- movimiento sobrio, que respeta la preferencia de movimiento reducido.

## Principios de diseño

1. **Confirmar antes de reaccionar.** Los modales se cierran y lo nuevo se resalta solo
   cuando el servidor confirma el guardado. Si hay error, el formulario se queda abierto
   y conserva los datos.
2. **Conservar el contexto.** Si la acción nace dentro de un módulo o de una sección, el
   sistema ya sabe dónde está y no vuelve a preguntarlo.
3. **Mostrar lo necesario primero.** Solo es obligatorio lo que el sistema no puede
   deducir. Lo deducible llega prellenado y se puede cambiar; lo opcional queda plegado.
4. **Una sola cosa abierta a la vez.** Las acciones de una barra no se mueven ni cambian
   de tamaño cuando se abre una de ellas.
5. **El error técnico no se le traslada a la persona.** Un fallo transitorio no debe
   parecer una pérdida de datos ni obligar a pulsar «Intentar de nuevo» tras una acción
   que sí funcionó.
6. **Accesibilidad desde el componente.** Diálogos con `role="dialog"` y `aria-modal`,
   foco inicial y devolución del foco, Escape, mensajes ligados a su campo, y movimiento
   reducido cuando el sistema lo pide.

## Carga contextual (R5–R7): la mejor manera

### Alternativas evaluadas

| Opción | Ventajas | Inconvenientes | Decisión |
| --- | --- | --- | --- |
| A. Navegar a la página con `?cargar=1&tipo=…` y abrir el formulario completo arriba (versión del PR #89) | Reutiliza el formulario existente | Recarga toda la página en el servidor sin indicador y el formulario queda lejos de la sección pulsada; el foco no entra; pide datos que el sistema ya conoce | Descartada |
| B. Formulario en línea dentro de cada sección | Queda cerca del clic | Alarga la página y puede haber varios abiertos; la sección se desordena | Descartada |
| C. **Ventana modal en el cliente, con formulario resumido y prellenado** | Mismo patrón que «Crear módulo», que el PO ya validó; sin recarga del servidor; foco y Escape accesibles; se cierra sola al guardar | Requiere un componente nuevo | **Elegida** |

### Comportamiento elegido

- **Origen.** «+ Subir normativa», «+ Subir cronograma», «+ Subir anexos» y «+ Subir
  preguntas frecuentes» abren la ventana sin navegar.
- **Destino fijo.** El módulo o submódulo se muestra como dato fijo y no se puede
  cambiar por accidente.
- **Al guardar.**
  - La ventana se cierra.
  - La página se actualiza y la vista baja hasta la sección.
  - El documento nuevo parpadea dentro de su sección, que es la misma desde la que se
    abrió.
- **Lo que no cambia.** El formulario completo «+ Agregar documento» y el enlace
  `?cargar=1` desde Consultas y reportes siguen igual. Los enlaces antiguos
  `?cargar=1&tipo=…` abren la ventana de esa sección.

### Campos por sección

| Campo | Normativa | Cronograma | Anexos | Preguntas frecuentes | Fuente del valor |
| --- | --- | --- | --- | --- | --- |
| Archivo | Obligatorio | Obligatorio | Obligatorio | Obligatorio | La persona |
| Título | Obligatorio | Obligatorio | Obligatorio | Obligatorio | La persona |
| Número de anexo | — | — | Visible | — | Se guarda en `metadata.annexNumber`; ordena la sección |
| Tipo documental | Lista de tipos legales + «Otra norma» | Fijo | Fijo | Fijo | La sección de origen |
| Año | Prellenado | Prellenado | Prellenado | Prellenado | Año actual (editable) |
| Entidad emisora y dependencia | Prellenadas | Prellenadas | Prellenadas | Prellenadas | Los valores más frecuentes en los documentos del módulo; si no hay, visibles y obligatorias |
| Módulo o submódulo | Fijo | Fijo | Fijo | Fijo | La página de origen |
| Palabras clave, número de documento, artículo | Plegado | Plegado | Plegado | Plegado | Opcionales (palabras clave en lenguaje común, sin JSON) |

Los valores prellenados se muestran como un resumen con el botón «Cambiar».

### Reglas de clasificación (R7)

- **Normativa.** Muestra los tipos legales. «Otra norma» se guarda como tipo `OTRO`,
  con el nombre del tipo escrito por la persona y la marca
  `metadata.contentSection = 'NORMATIVA'`, de modo que aparece en Normativa y no en
  «Otros». Los documentos `OTRO` subidos antes de este cambio no tienen esa marca y
  siguen en «Otros».
- **Contenido del tema.** Se alimenta de **todos** los documentos del módulo o
  submódulo, con una consulta propia. La versión anterior usaba la página filtrada de
  20 elementos de la biblioteca, así que con filtros o muchos documentos una sección
  podía verse vacía o incompleta.
- **Anexos.** Se ordenan por `metadata.annexNumber`. Si falta, se toma el número del
  título; se reconocen «N.°», «Nro.», «No.», «Núm.» y números romanos.

### Criterios medibles

- Desde las 4 secciones, la persona solo escribe archivo y título (más el número en Anexos).
- La carga no navega en el servidor antes de enviar.
- Tras guardar, el documento aparece y parpadea en la sección de origen sin buscarlo.
- Ninguna sección muestra un recuento distinto por los filtros o la página de la biblioteca.

## Historial (R10): causa real del error

La pantalla «No pudimos cargar esta sección» que aparecía después de quitar un chat
**no** se debía a un cursor inválido. La paginación usa la tupla
`(updated_at, id)`, que sigue siendo válida aunque se borre esa fila.

La causa es el limitador de peticiones del API:

- **Fallo de la librería.** En `@nestjs/throttler` 6.5.0, al expirar un bloqueo se
  cancelan los temporizadores de todas las claves. Desde ese momento los contadores
  dejan de bajar y cada ruta termina respondiendo 429.
- **Contador compartido.** Sin `trust proxy`, en Render todas las personas compartían
  el mismo contador.

Corrección:

- **API.** Almacenamiento propio con ventana deslizante por clave y contador por persona
  (token verificado), con la IP como respaldo detrás de un solo proxy.
- **Web.**
  - El chat se retira de la lista al instante.
  - Se muestra la ventana emergente «Historial quitado correctamente» con «Aceptar»,
    que se cierra sola a los 4 s.
  - Se vuelve a `/history`.
  - Un fallo se informa con un mensaje propio y la lista se reconcilia con lo que quedó
    en el servidor.

## Resto del alcance

### Módulos (R1–R4)

- Insignia Activo/Inactivo alineada en todas las tarjetas.
- **Decisión del PO (30-09-2026):** buscador a la izquierda y «Crear…» en el extremo
  derecho. En móvil, el botón queda arriba a ancho completo.
- Al crear un módulo o submódulo:
  - la ventana se cierra solo si el servidor confirma;
  - se limpia la búsqueda para que la tarjeta nueva se vea;
  - la tarjeta recibe foco y parpadea de forma perceptible, y el resaltado siempre
    termina;
  - se retira `?creado` de la dirección.
- Si el padre está inactivo, el submódulo nace inactivo y se explica por qué. Si el
  padre tiene documentos propios, se indica antes de intentar crear.

### Usuarios (R8–R9)

- Barra compacta: dos altas principales y dos acciones discretas (Importar y Exportar).
- Un solo panel abierto a la vez, que se muestra debajo de la barra con «Cerrar». Abrir
  un alta no mueve ni estira los otros botones.

### Mi perfil (R11–R13)

- **Datos personales.** El docente edita nombre, teléfono, departamento y ciudad. En
  administración el nombre es de solo lectura porque lo gestiona el
  superadministrador.
- **Seguridad.** El guardado pasa por la función de base de datos
  `update_own_profile`, que normaliza y valida cada dato, exige una cuenta activa y
  vigente, y no permite cambiar rol, estado ni vigencia. La escritura directa a la
  tabla se retiró.
- **Cambio de correo con doble confirmación.**
  - Antes de enviar se explica que llegan dos enlaces y qué hacer sin acceso al correo
    actual.
  - Cada enlace vuelve a Mi perfil con un aviso claro: uno pendiente, cambio
    completado, revisar o error. Nunca termina en la pantalla genérica de enlace
    inválido.
- «Cerrar sesión» queda en el extremo superior derecho, también en móvil.
- Accesos rápidos como tarjetas de acción con icono, texto y flecha, de alturas iguales
  y que no cortan palabras.

## Verificación

- Pruebas unitarias y de interacción que comprueban el comportamiento pedido, no solo
  clases CSS.
- Suite web completa, lint, TypeScript y build de producción.
- API: pruebas del almacenamiento del limitador, incluida la que documenta el fallo del
  paquete, y del rastreador.
- pgTAP de la función de perfil y de los permisos (sin UPDATE directo).
- Revisión independiente por área antes de integrar.
- Smoke autenticado en producción después del despliegue.
