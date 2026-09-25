# Hito 3 — Cumplimiento de los lineamientos del cliente y validación integral

Fecha: 2026-09-24 · Rama: `feat/hito3-cumplimiento-cliente`

Este documento resume cómo AVEND ASESOR cumple cada uno de los 12 lineamientos
funcionales del Hito 3, con qué evidencia, y el resultado de la validación
integral con documentos y servicios reales.

## Cómo se verificó

1. **Auditoría de cumplimiento** por lineamiento (auditores independientes),
   con baterías empíricas: más de 300 frases reales pasadas por el
   clasificador y simulaciones del flujo completo API → web.
2. **Datos reales de producción** (solo lectura): puntajes de similitud y
   ruteo medidos sobre los 3 documentos indexados.
3. **Validación integral** (`npm run acceptance:hito3`): los 15 casos mínimos
   del cliente y un red-team, con el retrieval y el modelo reales. Cuatro
   corridas, la última tras las correcciones de la revisión, con el mismo
   resultado.
4. **Pruebas automatizadas**: API 833 pruebas y web 477, todas en verde.
5. **Revisión independiente** en tres rondas, por dimensiones (evidencia y seguridad, API, web, ingesta), con verificación adversarial de cada hallazgo. Los hallazgos confirmados que afectan los lineamientos se corrigieron (ver «Revisión independiente»).

## Matriz de cumplimiento

| # | Lineamiento | Cómo lo cumple el sistema | Evidencia |
| --- | --- | --- | --- |
| 1 | Identidad y alcance | Antes de buscar, un clasificador determinista decide si el mensaje es charla, del ámbito educativo o ajeno. El prompt declara el alcance: docentes, auxiliares y directivos. | 103/103 consultas educativas llegan al RAG en la batería; casos C02 y C03 |
| 2 | Conversación natural | Saludos, cortesías («¿cómo está?»), agradecimientos, acuses («ok», «👍»), despedidas y «¿qué puedes hacer?» reciben una respuesta amable sin RAG ni conversación guardada. «¿Qué puedes hacer?» lista los temas reales. | C01, R03–R06; batería de 50 frases sociales |
| 3 | Consulta educativa sin nombrar módulo | Búsqueda global sobre todo el corpus; el módulo se infiere de las fuentes dominantes. | C02 (módulo inferido: Cargos y plazas) |
| 4 | RAG cuando se necesita sustento | Toda consulta del ámbito pasa por el RAG. Umbral calibrado con el corpus real (0.5). Si ninguna fuente trata el tema, el modelo emite una marca y el turno se cierra como «sin evidencia», sin fuentes. Las cifras que no figuran en la fuente citada se señalan para revisión. | C03, C06, C08; pruebas de la marca |
| 5 | Identificación inteligente del módulo | El módulo elegido es contexto, no barrera. Una fuente marginal de otro módulo ya no dispara aclaraciones. Una primera consulta sin tema («¿Cuáles son los requisitos?») pide precisar con los temas reales como botones, y el botón reenvía la pregunta. | C09, C12 |
| 6 | Continuidad y contexto | Los seguimientos elípticos («¿y cuál es el plazo?») se buscan con las consultas previas. Una conversación general no se parte. «Otra consulta: …» empieza sin arrastrar el tema anterior. | C10, C11 |
| 7 | Historial por usuario | Cada lectura está acotada al usuario autenticado. «Hola» o «gracias» aislados no crean conversación. Al retomar se cargan hasta 100 mensajes. El título omite el saludo y las consultas sin respuesta se señalan para reenviarlas. | C14, C15; pgTAP de aislamiento (P0002) |
| 8 | Respuestas sustentadas y fuentes | Las citas [n] enlazan con su fuente. Se muestran primero las fuentes citadas; las demás quedan plegadas. «Ver documento» abre el PDF en la página citada. La ficha de orientación indica la situación (vigente, reemplazada o archivada). Se descartan fragmentos duplicados. | C07 (todas las citas existen) |
| 9 | Sin evidencia suficiente | Mensaje claro y amable que invita a precisar u ofrece revisar antecedentes, sin completar con suposiciones. | C05, C08, R01 |
| 10 | Fuera de ámbito | Los temas ajenos (clima, deportes, recetas, poemas, programación, política, salud personal, trámites civiles) se declinan con cortesía y se reorienta. El contexto escolar protege las consultas docentes: «receta médica», «el clima institucional del colegio». | C13; 39/44 ajenas declinadas; 30/30 docentes protegidas |
| 11 | Saludo + consulta | Prevalece la consulta: la cortesía se descarta solo si no queda sustancia. | Ejemplo textual del cliente en la batería |
| 12 | Validación integral | Arnés reproducible con servicios reales, más pruebas manuales de historial y aislamiento. | 20/21 casos (ver abajo) |

## Resultado de la validación integral (corpus actual: 3 documentos)

| Caso del cliente | Resultado |
| --- | --- |
| C01 Saludo normal sin activar el RAG | PASA |
| C02 Consulta educativa sin mencionar módulo | PASA |
| C03 Consulta de docente | PASA |
| C04 Consulta de auxiliar de educación | PASA |
| C05 Consulta de directivo | REQUIERE CORPUS: responde «sin evidencia» sin inventar; no hay documentos de directivos |
| C06 Consulta normativa con sustento | PASA |
| C07 Respuesta con visualización de fuentes | PASA |
| C08 Consulta sin respuesta en los documentos | PASA |
| C09 Usuario en un módulo preguntando por otro | PASA |
| C10 Cambio de tema en la conversación | PASA |
| C11 Seguimiento dependiente del contexto | PASA |
| C12 Consulta ambigua que requiere precisión | PASA |
| C13 Consulta fuera del ámbito | PASA |
| C14 Historial guardado y recuperación | PASA (persistencia simulada; confirmar en la app) |
| C15 Un usuario no accede al historial de otro | PASA (confirmar en la app) |
| Red-team (6 casos) | PASA |

## Revisión independiente

Revisores independientes por dimensión, con un verificador adversarial para
cada hallazgo (intenta refutarlo sobre el código real):

- **Evidencia y seguridad:** 8 hallazgos. El más serio (HIGH): una negativa
  del modelo escrita antes de la marca se guardaba como respuesta con fuentes.
  Corregido con una ventana inicial: no se muestra nada hasta ver una cita, y
  una negativa sin citas se cierra como «sin evidencia». Los verificadores
  confirmaron que los 8 quedaron resueltos. Sin XSS, redirecciones abiertas ni
  exposición de secretos.
- **API:** 8 hallazgos confirmados (2 HIGH: pérdida de contexto en «otra
  pregunta: ¿y si…?» y en seguimientos como «¿y me pagan durante ese
  tiempo?»). Todos corregidos, con pruebas de regresión.
- **Web y contrato API↔web:** ningún evento de la API es rechazado por la web.
  8 hallazgos menores, corregidos: «Otra consulta» a secas, reintento tras
  una aclaración, aviso «no se completó» en falso, citas en las aclaraciones
  y título del historial.

- **Segunda ronda:** 1 HIGH confirmado. Una negativa del modelo sin la marca
  («Lo siento, pero las fuentes…») se mostraba con fuentes. Se corrigió con
  una regla fail-closed: una respuesta que no cita ninguna fuente entregada se
  cierra como «sin evidencia». También se corrigieron la marca con corchetes
  simples, los anuncios «Cambiando de tema» o «Nueva pregunta», las preguntas
  de capacidad dichas con el rol, «Hola, ¿qué hora es?», el título del
  historial y el aviso «no se completó».
- **Ingesta:** 1 HIGH. Un anexo grande en tablas bloqueaba la API durante
  minutos al fragmentarse. Ahora el troceo es lineal. También se corrigieron
  el límite real de 800 tokens, la página del solapamiento (para que «Ver
  documento» abra la página correcta), los caracteres partidos y el título de
  un artículo separado de su cuerpo.
- **Tercera ronda:** 3 MEDIUM corregidos:
  - Citas agrupadas «[1, 2]»: con la regla fail-closed se cerraban como «sin
    evidencia».
  - Seguimientos como «¿y estos descuentos…?»: perdían el hilo.
  - Un artículo breve se tomaba como título del siguiente.

  Además, una cita a una fuente inexistente («[2012]») ya no cuenta como
  sustento.

Cada ronda de correcciones se volvió a validar con los servicios reales. Una
regresión detectada así (el anuncio de tema nuevo) se corrigió antes de cerrar.

## Pendientes para cerrar el Hito 3

1. **Fusionar y desplegar** la rama (sin migraciones). Ver
   `RUNBOOK_ACTIVACION_EJE_B.md` §1.
2. **Reindexar** los 3 documentos (obligatorio). Así se limpian los fragmentos
   duplicados y se corrigen las páginas y los artículos de cada fragmento.
   Ver §3 del runbook; requiere autorización del PO.
3. **Cargar el corpus completo**, que incluya directivos, auxiliares y los
   procesos de los ejemplos del cliente, y **repetir la validación integral**.
4. **Pruebas manuales** de historial y aislamiento con dos cuentas (runbook §5).

## Fuera de alcance de esta entrega (registrado)

- La descarga de una fuente no vuelve a verificar la vigencia actual del
  documento (M9). El historial muestra la situación que tenía al responder.
  Requiere una migración.
- En documentos Word o Markdown la página figura como 1 (el extractor no
  pagina). Requiere una migración para exponer el formato.
- La búsqueda léxica es solo desempate (AND estricto); la recuperación es
  semántica.
- El límite de consultas es por IP (H7); todo llega desde Vercel.
- Hallazgos LOW de la tercera ronda, registrados como mejora (casos raros que
  no afectan los 15 casos del cliente):
  - El solapamiento que sigue a un cuerpo largo con título puede indicar una
    página antes.
  - Un chunk de 100 tokens o menos puede repetirse dentro del siguiente (el
    retrieval ya descarta el contenido).
  - Las URL de más de 200 caracteres se guardan partidas.
  - Las series de símbolos se acortan.
  - El texto multibyte sin espacios sigue siendo lento de fragmentar.
  - El aviso «no se completó» usa el reloj del navegador.
  - La marca «tema nuevo» se pierde si la pregunta siguiente falla y se
    reintenta.
