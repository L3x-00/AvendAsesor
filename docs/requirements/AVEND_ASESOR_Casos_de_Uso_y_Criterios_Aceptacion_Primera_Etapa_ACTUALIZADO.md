---
title: CASOS DE USO Y CRITERIOS DE ACEPTACIÓN
---

**AVEND ASESOR -- PRIMERA ETAPA**

*Documento para validar funcionalmente los avances del proyecto*

# 1. Finalidad del documento

Este documento define casos concretos de uso y criterios de aceptación
para revisar los avances de AVEND ASESOR durante la primera etapa del
proyecto.

Su propósito es convertir los requerimientos y lineamientos funcionales
ya acordados en situaciones que puedan probarse de manera objetiva,
evitando interpretaciones distintas sobre cuándo una funcionalidad se
considera correctamente implementada.

No reemplaza el contrato ni sus anexos; los complementa como instrumento
práctico de validación.

# 2. Criterio general de aceptación

Una funcionalidad se considera aceptable cuando puede ser probada por el
cliente en un entorno funcional, responde al comportamiento esperado,
mantiene coherencia con el resto de la plataforma y no presenta errores
que impidan su uso normal.

-   La prueba debe poder realizarse desde una interfaz funcional, no
    únicamente mediante explicaciones técnicas.

-   El comportamiento debe ser consistente en más de una consulta de
    prueba.

-   Las respuestas del RAG deben estar sustentadas en la documentación
    disponible.

-   Las referencias o citas deben dirigir al documento o fragmento
    correspondiente.

-   Cuando no exista sustento suficiente, el sistema debe indicarlo sin
    inventar información.

-   Las funciones administrativas deben poder ser utilizadas sin
    depender del desarrollador para cada actualización ordinaria.

-   Los errores críticos, bloqueos o pérdida de información impiden
    considerar aprobada la funcionalidad.

# 3. Casos de uso de la primera etapa

## CU-01 -- Ingreso y nueva consulta

**Escenario:**

El usuario ingresa a AVEND ASESOR y desea realizar una consulta.

**Comportamiento esperado:**

La plataforma muestra de forma clara el espacio de conversación y
permite iniciar una nueva consulta sin recorrer múltiples pantallas.

**Criterios de aceptación:**

-   La opción Nueva consulta es visible y comprensible.

-   El usuario puede escribir y enviar un mensaje.

-   La interfaz no presenta bloqueos ni pasos innecesarios para
    comenzar.

-   El diseño se adapta correctamente a la pantalla utilizada.

## CU-02 -- Consulta libre sin seleccionar proceso

**Escenario:**

El usuario escribe una consulta con sus propias palabras, sin
seleccionar previamente un proceso.

**Comportamiento esperado:**

El sistema interpreta la intención y orienta la consulta hacia el
proceso correspondiente, sin exigir al usuario conocer previamente el
nombre técnico.

**Criterios de aceptación:**

-   La consulta puede enviarse sin seleccionar un proceso.

-   El sistema identifica o infiere razonablemente el tema relacionado.

-   La respuesta utiliza documentación pertinente al proceso
    identificado.

-   Si existe ambigüedad real, solicita una precisión de manera natural.

## CU-03 -- Consulta desde un proceso seleccionado

**Escenario:**

El usuario selecciona un proceso y formula una consulta dentro de ese
contexto.

**Comportamiento esperado:**

El sistema utiliza el proceso seleccionado como contexto para orientar
la búsqueda y la respuesta.

**Criterios de aceptación:**

-   El proceso seleccionado queda asociado a la consulta.

-   La respuesta no mezcla documentación de procesos no relacionados.

-   El usuario puede continuar preguntando dentro del mismo contexto.

## CU-04 -- Conversación natural con pregunta aclaratoria

**Escenario:**

El usuario plantea una situación incompleta, por ejemplo: "Necesito
ausentarme dos meses de mi colegio."

**Comportamiento esperado:**

El sistema ofrece una primera orientación útil y, si requiere un dato
que modifica la respuesta, formula una pregunta breve para precisar el
caso.

**Criterios de aceptación:**

-   La respuesta no se limita únicamente a preguntar.

-   El sistema brinda una orientación inicial sustentada cuando sea
    posible.

-   La pregunta aclaratoria tiene relación directa con la consulta.

-   No formula preguntas innecesarias ni repite datos ya proporcionados.

## CU-05 -- Conservación del contexto de conversación

**Escenario:**

El usuario proporciona datos relevantes en mensajes sucesivos y luego
realiza una pregunta relacionada.

**Comportamiento esperado:**

El sistema comprende que la nueva pregunta forma parte del mismo caso y
reutiliza la información previa.

**Criterios de aceptación:**

-   No solicita nuevamente datos ya proporcionados.

-   La nueva respuesta mantiene el proceso y datos relevantes del caso.

-   La conversación conserva coherencia entre mensajes sucesivos.

## CU-06 -- Cambio de tema durante la conversación

**Escenario:**

Durante una conversación sobre un proceso, el usuario cambia a otro tema
o procedimiento.

**Comportamiento esperado:**

El sistema reconoce el nuevo tema y cambia el conjunto documental
utilizado, evitando mezclar ambos procesos.

**Criterios de aceptación:**

-   El cambio de tema es detectado correctamente.

-   Las fuentes posteriores corresponden al nuevo proceso.

-   La conversación no arrastra información que genere una respuesta
    incorrecta.

## CU-07 -- Respuesta sustentada mediante RAG

**Escenario:**

El usuario formula una consulta cuyo contenido se encuentra en la
documentación cargada.

**Comportamiento esperado:**

El sistema recupera información pertinente y genera una respuesta
comprensible apoyada en dicha documentación.

**Criterios de aceptación:**

-   La respuesta tiene relación directa con la consulta.

-   La información principal puede verificarse en los documentos
    cargados.

-   No se incorporan afirmaciones relevantes sin sustento documental
    cuando la respuesta deba provenir del RAG.

-   La redacción es comprensible para un docente y no se limita a copiar
    fragmentos.

## CU-08 -- Citas y fuentes verificables

**Escenario:**

Una respuesta utiliza una norma, resolución, oficio u otro documento
como sustento.

**Comportamiento esperado:**

Las afirmaciones relevantes muestran referencias visibles como \[1\],
\[2\] u otro mecanismo equivalente.

**Criterios de aceptación:**

-   La referencia puede seleccionarse o abrirse.

-   Se identifica el documento de origen.

-   Se muestra la página, artículo, numeral, sección o fragmento cuando
    la información esté disponible.

-   La fuente mostrada respalda efectivamente la afirmación asociada.

-   El usuario puede revisar el documento relacionado sin perder la
    continuidad de la consulta.

## CU-09 -- Consulta sin sustento suficiente

**Escenario:**

El usuario realiza una pregunta para la cual la documentación cargada no
contiene información suficiente.

**Comportamiento esperado:**

El sistema reconoce la limitación y evita completar la respuesta con
información inventada.

**Criterios de aceptación:**

-   La respuesta indica que no existe sustento suficiente.

-   No inventa requisitos, plazos, derechos, montos o procedimientos.

-   La consulta queda registrada para revisión administrativa.

-   El sistema puede brindar únicamente aquello que sí esté respaldado,
    diferenciándolo de lo no confirmado.

## CU-10 -- Registro e historial de consultas

**Escenario:**

El usuario realiza varias consultas en distintos momentos.

**Comportamiento esperado:**

Las conversaciones quedan organizadas para poder revisarlas
posteriormente.

**Criterios de aceptación:**

-   El usuario puede visualizar sus consultas anteriores.

-   Puede abrir una conversación y revisar su contenido.

-   La identificación de cada conversación es suficientemente clara por
    tema o fecha.

-   No se mezclan conversaciones distintas.

## CU-11 -- Gestión de procesos desde administración

**Escenario:**

El administrador necesita crear, editar, activar o desactivar un
proceso.

**Comportamiento esperado:**

La gestión puede realizarse desde el panel administrativo y reflejarse
en la estructura utilizada por la plataforma.

**Criterios de aceptación:**

-   Existe una sección de gestión de procesos o módulos.

-   Se puede crear y editar la información prevista.

-   Se puede activar o desactivar un proceso.

-   Los cambios se reflejan correctamente en el sistema sin requerir
    modificación manual de código para cada operación ordinaria.

## CU-12 -- Carga y asociación de documentos

**Escenario:**

El administrador incorpora un documento relacionado con un proceso
determinado.

**Comportamiento esperado:**

El documento puede cargarse, asociarse al proceso y quedar disponible
para el funcionamiento del RAG luego de su procesamiento.

**Criterios de aceptación:**

-   El archivo se carga correctamente.

-   Puede asociarse al proceso correspondiente.

-   El sistema conserva la relación entre documento y proceso.

-   El documento queda disponible para ser recuperado en una consulta de
    prueba.

-   El administrador puede identificar el estado del documento.

## CU-13 -- Ampliación progresiva de la base documental

**Escenario:**

Se agrega nueva documentación a un proceso existente.

**Comportamiento esperado:**

El conocimiento utilizado por el sistema puede ampliarse sin rehacer la
plataforma ni depender de cambios estructurales por cada archivo.

**Criterios de aceptación:**

-   La nueva documentación puede incorporarse desde administración.

-   Una consulta posterior puede recuperar información del nuevo
    documento.

-   La documentación anterior continúa funcionando.

-   La ampliación no altera indebidamente otros procesos.

## CU-14 -- Generación de documento desde la orientación

**Escenario:**

Luego de una consulta, el usuario desea preparar el documento o formato
relacionado disponible en la plataforma.

**Comportamiento esperado:**

La plataforma reutiliza la información conocida, solicita los datos
faltantes y genera una vista previa del documento.

**Criterios de aceptación:**

-   La acción para preparar el documento aparece cuando corresponde.

-   No se vuelven a solicitar datos ya proporcionados si pueden
    reutilizarse.

-   El usuario puede revisar el contenido antes de descargar.

-   La descarga funciona en los formatos previstos en el proyecto.

-   Los datos ingresados aparecen correctamente en el documento.

## CU-15 -- Gestión de usuarios y roles

**Escenario:**

El administrador revisa usuarios y permisos disponibles en la
plataforma.

**Comportamiento esperado:**

Los roles y accesos acordados se aplican correctamente y las funciones
administrativas permanecen restringidas a quienes corresponda.

**Criterios de aceptación:**

-   El administrador puede visualizar los usuarios previstos.

-   Los permisos se aplican según el rol.

-   Un usuario sin permiso administrativo no puede acceder a las
    funciones de administración.

-   Los cambios de estado o permisos se reflejan correctamente.

# 4. Pruebas integrales recomendadas

Las pruebas integrales deben comprobar que varias funciones trabajan
juntas dentro de un recorrido real. Para esta primera etapa se
utilizarán principalmente Ley y Reglamento, Contrato Docente y
Contratación de Auxiliares de Educación, porque permiten verificar tanto
consultas generales como procesos documentales distintos y comprobar que
el RAG no mezcle fuentes entre ellos.

  -----------------------------------------------------------------------
  **Prueba integral**                 **Recorrido esperado**
  ----------------------------------- -----------------------------------
  PI-01 -- Ley y Reglamento           El usuario formula una consulta
                                      general sobre un derecho, deber,
                                      condición o aspecto regulado por la
                                      Ley de Reforma Magisterial. El
                                      sistema identifica que la consulta
                                      corresponde a Ley y Reglamento,
                                      recupera la documentación
                                      pertinente, brinda una orientación
                                      comprensible, incorpora citas y
                                      permite abrir la fuente. Luego el
                                      usuario realiza una pregunta
                                      relacionada y el sistema conserva
                                      el contexto.

  PI-02 -- Contrato Docente           El usuario plantea una situación
                                      relacionada con Contrato Docente
                                      sin necesariamente indicar el
                                      nombre del proceso. AVEND ASESOR
                                      identifica el proceso, brinda una
                                      primera orientación, solicita una
                                      precisión solo si es necesaria,
                                      consulta la documentación cargada
                                      de Contrato Docente y responde con
                                      sustento verificable. La
                                      conversación puede continuar hacia
                                      requisitos, etapas, documentación u
                                      otra consulta vinculada.

  PI-03 -- Contratación de Auxiliares El usuario realiza una consulta
  de Educación                        sobre postulación, requisitos o una
                                      situación relacionada con la
                                      Contratación de Auxiliares de
                                      Educación. El sistema debe
                                      distinguir este proceso de Contrato
                                      Docente, utilizar la documentación
                                      correspondiente, responder de forma
                                      clara y mostrar las citas. La
                                      conversación continúa dentro del
                                      mismo proceso sin mezclar normas o
                                      documentos de contratación docente.

  PI-04 -- Diferenciación entre       Se realizan dos consultas
  procesos similares                  similares: una correspondiente a
                                      Contrato Docente y otra a
                                      Contratación de Auxiliares de
                                      Educación. El sistema debe
                                      identificar correctamente cada
                                      proceso y responder utilizando las
                                      fuentes propias de cada uno. Esta
                                      prueba busca detectar mezclas
                                      documentales, errores de
                                      clasificación o recuperación
                                      incorrecta del RAG.

  PI-05 -- Incorporación de nueva     El administrador selecciona uno de
  documentación                       los procesos anteriores, carga un
                                      nuevo documento, lo asocia y espera
                                      su procesamiento. Después se
                                      realiza una consulta cuyo sustento
                                      se encuentra en dicho documento.
                                      AVEND ASESOR debe recuperarlo y
                                      presentarlo como fuente pertinente
                                      sin afectar la documentación ya
                                      existente.

  PI-06 -- Consulta sin sustento      Se formula intencionalmente una
  suficiente                          pregunta cuya respuesta no esté
                                      suficientemente cubierta por la
                                      documentación cargada. El sistema
                                      reconoce la insuficiencia, evita
                                      inventar información, comunica la
                                      limitación de manera natural y
                                      registra la consulta para revisión
                                      administrativa.
  -----------------------------------------------------------------------

## 4.1 Qué se busca comprobar con estas pruebas

-   Que AVEND ASESOR comprenda una consulta aunque el usuario no
    seleccione previamente un proceso.

-   Que distinga correctamente Ley y Reglamento, Contrato Docente y
    Contratación de Auxiliares de Educación.

-   Que el RAG recupere documentos del proceso correcto y no mezcle
    fuentes similares.

-   Que las citas permitan comprobar la información utilizada.

-   Que el contexto se conserve durante la conversación.

-   Que una nueva carga documental pueda utilizarse posteriormente en
    consultas.

-   Que el sistema reconozca cuándo no cuenta con sustento suficiente.

# 5. Clasificación de observaciones durante la revisión

Para facilitar las reuniones de revisión, las observaciones pueden
clasificarse de la siguiente manera:

  -----------------------------------------------------------------------
  **Tipo de observación**             **Descripción**
  ----------------------------------- -----------------------------------
  Crítica                             Impide utilizar una funcionalidad
                                      principal, genera pérdida de datos,
                                      bloquea el flujo o produce
                                      respuestas manifiestamente
                                      incorrectas.

  Alta                                La funcionalidad existe, pero no
                                      cumple un criterio importante de
                                      uso, seguridad, fuente, proceso o
                                      administración.

  Media                               La función opera, pero requiere
                                      corrección de comportamiento,
                                      claridad, navegación o
                                      consistencia.

  Visual / experiencia                Ajuste de presentación,
                                      distribución, textos, jerarquía
                                      visual o facilidad de comprensión.
  -----------------------------------------------------------------------

# 6. Evidencia esperada para una entrega

Para facilitar la validación de un avance o hito, la entrega debe
permitir revisar directamente las funcionalidades comprometidas.

-   Enlace funcional del entorno de prueba.

-   Credenciales o accesos necesarios para usuario y administración.

-   Funcionalidades relacionadas con el avance disponibles para prueba.

-   Documentación o indicación breve de qué se modificó cuando sea
    necesario.

-   Video corto de demostración cuando una función requiera explicar un
    flujo específico o cuando se haya acordado como evidencia.

-   Corrección de errores críticos identificados antes de considerar
    completada la revisión.

# 7. Criterio de aprobación

La aprobación de una funcionalidad o avance debe basarse en la prueba
real del comportamiento esperado y de sus criterios de aceptación,
considerando conjuntamente el contrato, los requerimientos y los
lineamientos funcionales del proyecto.

La revisión no debe limitarse a comprobar que existe un botón o una
pantalla; debe verificarse que la función cumple el propósito para el
cual fue definida y que se integra correctamente con el resto de AVEND
ASESOR.

# 8. Resumen de la primera etapa

Para esta primera etapa, las pruebas deben permitir confirmar
principalmente que AVEND ASESOR puede recibir consultas, comprender el
proceso o contexto, recuperar documentación mediante RAG, diferenciar
correctamente bases documentales como Ley y Reglamento, Contrato Docente
y Contratación de Auxiliares de Educación, responder con fuentes
verificables, conservar la conversación, manejar correctamente los casos
sin sustento y permitir la administración progresiva de procesos,
documentos y usuarios.

El objetivo es que los avances puedan evaluarse con situaciones reales
de uso y no únicamente por la presencia visual de componentes.
