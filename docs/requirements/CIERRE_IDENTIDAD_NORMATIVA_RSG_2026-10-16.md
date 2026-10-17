# Cierre de identidad normativa RSG — 2026-10-16

Continuación de TSK-0096, implementada por OpenCode en PR #121 y fusionada en
`4f0cf13`. La base del cierre es `main@f76f92f`, que ya contiene ese cambio.

## Reproducción en producción

Se usó el chat desplegado, con la sesión existente de la cuenta ficticia de QA.
La lectura de las fichas conocidas confirmó el proyecto de producción
`blxrdotroysitfyehmqw`: ambas están aprobadas y tipadas como
`RESOLUCION_SECRETARIA_GENERAL`, con sus números registrados correctos.
El cierre no requiere repetir DDL, retipado ni ingesta.

| Caso anterior a esta corrección                             | Resultado observado                                                                                                     | Conversación                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| RSG 326-2017-MINEDU: registro y control de asistencia       | Respuesta con cinco fragmentos del documento correcto, citas [2]/[3], conservada al recargar; el PDF abrió en página 18 | `4f8021c6-268e-4c21-935a-aedaf8e384ae` |
| RSG 121-2018-MINEDU: finalidad del instructivo de planillas | Aclaración de vínculo laboral para una cifra que no se había pedido                                                     | `0692368c-0032-43da-aeb4-58c777c115f5` |
| RSG 9999-2018-MINEDU: planilla de pagos                     | `no_evidence`, sin fuentes sustitutas; conservado al recargar                                                           | `22628ae5-e206-473f-8695-95f2f1583096` |

La pregunta de reproducción se conserva completa y se repetirá literalmente al
verificar la corrección publicada:

> Según la Resolución de Secretaría General N.° 121-2018-MINEDU, ¿cuál es la finalidad del instructivo para la elaboración y aprobación de la planilla de pagos?

## Corrección

El perfil salarial trataba cualquier mención de «pagos» como un pedido de monto.
El título de un instructivo activaba por ello una aclaración sobre cifras
distintas que aparecían dentro del documento, aunque se hubiera pedido su objeto.

Se excluye únicamente la cláusula que pregunta por la finalidad documental.
Las otras cláusulas de una consulta compuesta conservan sus señales salariales,
incluso sin un verbo de cobro: «y el sueldo que recibe un profesor» mantiene
las aclaraciones y la incompatibilidad con otra jornada. Los importes y las
peticiones de cálculo mantienen los controles también dentro de esa cláusula.
Las coordinaciones nominales del título, incluidas listas con comas,
se reconocen para no confundir el título con un segundo pedido. También se
admiten peticiones como «Explícame la finalidad…» y la abreviatura RSG.
Una finalidad nueva tampoco hereda factores de un pedido salarial anterior.

La revisión posterior de montos evalúa el contenido generado por el proveedor
independientemente de que la pregunta sea documental. Se conserva la exención
previa cuando se solicitó expresamente un concepto adicional. Una asignación presentada como
sueldo, o una regla reemplazada presentada como vigente, conserva la señal de
revisión humana y su extracto. Esa señal no equivale a una validación jurídica
ni a un bloqueo automático de la respuesta.

No se cambian identidad exacta, corpus, migraciones, autorización, proveedor,
modelos, top-k ni formato de las citas. Los mensajes previos no se reescriben.

## Verificación de la corrección

- La reproducción inicial produjo cuatro fallos nuevos antes de la corrección.
- La primera revisión detectó una evasión en consultas compuestas y la omisión
  de la revisión posterior de cifras. Ambos casos se reprodujeron con cinco
  pruebas fallidas antes de corregirlos.
- Tres suites focales: 199 pruebas aprobadas. Incluyen identidad exacta ausente,
  petición documental con cifras distintas, consultas mixtas, filtro de jornada,
  corte de herencia en cadenas de más de tres turnos y revisión de una asignación
  que el proveedor simulado presenta como sueldo.
- Nueve mutaciones de las protecciones verifican que retirar cada control hace
  fallar su prueba, y restauran los archivos con hash verificado.
- E2E: dos suites, 35 pruebas aprobadas.
- API completa tras los ajustes de revisión: 113 suites, 1.639 pruebas
  aprobadas; formato, lint, tipos, compilación y diff aprobados. La verificación
  remota del commit final se registra en el PR.

Los resultados de integración, revisión independiente final y repetición del
chat publicado se registran en el cierre del PR de esta corrección. Las capturas
y lecturas acotadas de los mensajes de QA se conservan localmente sin
credenciales, tokens ni enlaces firmados.

Este cierre acotado no certifica la campaña completa del punto 6 ni demuestra
estabilidad de memoria bajo carga en Render.

Se conserva el límite previo de números de norma con separador de miles
(«1.234-2025»): no se amplía el resolutor de identidades como parte de esta
corrección de intención documental.
