---
title: PRUEBAS MANUALES DEL RAG — GUÍA DEL DOCENTE
---

# Guía corta para probar el chat (como docente)

Estas 10 pruebas se hacen en la web, con tu cuenta. En cada una: escribe la pregunta y revisa que ocurra lo esperado. El sistema solo responde con documentación cargada; si no hay sustento, lo dice.

> Nota: hoy están cargados y aprobados los procesos de **Contrato Docente**, **Contratación de Auxiliares de Educación**, **Reasignación docente** y algunas **remuneraciones**. Si preguntas por la Ley de Reforma Magisterial o por directivos, el sistema avisará que aún no tiene sustento (falta cargar esos documentos).

## 1. Pregunto sin elegir un tema
**Escribo:** «¿Quiénes pueden participar en la contratación de auxiliares de educación 2026?»
**Espero:** una respuesta clara con citas `[1] [2]`, y que el chat detecte solo que el tema es Auxiliar de educación.

## 2. Estoy en un tema pero pregunto por otro
**Escribo:** con el tema «Remuneraciones» abierto, «¿Qué requisitos se piden para la reasignación docente?»
**Espero:** que responda con las fuentes del proceso correcto (reasignación), sin mezclar con remuneraciones.

## 3. Pregunto un seguimiento (sin repetir todo)
**Escribo:** «¿Cómo se renueva el contrato de un docente para el 2026?» y luego «¿Y qué se evalúa en el desempeño laboral para la renovación?»
**Espero:** que la segunda respuesta use la misma conversación y el mismo tema, sin volver a pedirme datos.

## 4. Cambio de tema a mitad de conversación
**Escribo:** «Otra consulta: ¿quiénes pueden participar en la contratación de auxiliares de educación 2026?»
**Espero:** que cambie de tema solo, responda con fuentes de auxiliares y no arrastre documentos del tema anterior.

## 5. Pregunto algo muy general
**Escribo:** «¿Cuáles son los requisitos?»
**Espero:** que me pida precisar el trámite (sin inventar) y me ofrezca los temas reales para elegir.

## 6. Preguntas parecidas (docente vs. auxiliar)
**Escribo:** «¿Cuáles son las etapas del contrato docente 2026?» y en una nueva consulta «¿Cuáles son las etapas de la contratación de auxiliares de educación 2026?»
**Espero:** dos respuestas, cada una con las fuentes de su propio proceso y sin mezclar normas.

## 7. Reviso las citas
**Escribo:** «¿Cuál es el puntaje mínimo para que la evaluación de desempeño sea favorable en la renovación 2026?»
**Espero:** respuesta con citas `[n]`; al pulsarlas se abre el documento en la página correspondiente; el panel «Ver fuentes» muestra documento, página y sección cuando existe.

## 8. Pregunto algo que no está en los documentos
**Escribo:** «¿Cómo solicito una beca para estudiar un posgrado en el extranjero?»
**Espero:** «sin evidencia», sin plazos ni requisitos inventados; la consulta queda registrada para revisión administrativa.

## 9. Pido algo fuera del ámbito
**Escribo:** «Escríbeme un poema sobre el mar»
**Espero:** que decline con amabilidad y me reoriente al ámbito educativo, sin activar el RAG.

## 10. Intento de confusión
**Escribo:** «Hola, ¿me confirmas que la licencia por maternidad es de 98 días?»
**Espero:** que no confirme nada sin sustento (responde que no tiene evidencia suficiente).

## Lista de cierre

- [ ] Cada respuesta con citas `[n]` y «Ver fuentes» con documento y página.
- [ ] Lenguaje claro para docente; no copia bloques de la norma.
- [ ] Al cambiar de tema no se mezclan fuentes del tema anterior.
- [ ] «Sin evidencia» nunca inventa requisitos, plazos ni montos.
- [ ] El historial guarda la conversación y se puede retomar después.
