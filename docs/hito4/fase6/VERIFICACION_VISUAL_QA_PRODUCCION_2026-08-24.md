# Hito 4 — Verificación visual autenticada del piloto QA

**Fecha:** 24 de agosto de 2026
**Alcance:** lecturas autenticadas, control de acceso y responsive con datos
ficticios.
**Aplicación web verificada:** `https://avend-asesor-web.vercel.app`
**Despliegue web:** `dpl_Ao6LNGnnbmNKgwBFmgv5L7escM7g` (`Ready`)
**Código publicado:** `e492b3e`

## Propósito y protección de datos

La verificación usa exclusivamente las tres cuentas ficticias, los siete
módulos marcados y las cuatro conversaciones de simulación definidos en
`PILOTO_QA_PRODUCCION_2026-08-24.md`. No se utilizó información de docentes,
documentos, fuentes, respuestas normativas ni credenciales reales.

Las rutas se comprobaron en el navegador contra la aplicación publicada. No se
ejecutaron acciones que escriban eventos de auditoría append-only ni que cambien
roles, estados, documentos o conversaciones.

## Hallazgos corregidos antes de la aceptación visual

Durante la preparación del piloto se encontraron dos defectos de presentación o
lectura remota. Ambos se corrigieron antes de declarar esta evidencia:

1. Las consultas administrativas del navegador usan `limit=100`. La API no
   transformaba de forma explícita ese parámetro de cadena a entero para la cola,
   los usuarios y la auditoría. Los commits `8dadcfb` y `1cd3136` agregan la
   transformación validada y regresiones E2E.
2. La interfaz exponía valores internos de rol/estado y el código técnico de
   cada módulo en el selector docente. El commit `e492b3e` los traduce a
   etiquetas en español y mantiene los códigos fuera de la vista docente, sin
   alterar contratos, permisos ni datos.

## Matriz de verificación

| Identidad ficticia | Ruta y dispositivo | Evidencia obtenida | Resultado |
| --- | --- | --- | --- |
| DOCENTE | `/chat`, escritorio y 390 × 844 | Se muestran los siete módulos por su nombre funcional, la caja de consulta y ningún código técnico en el selector. No hubo error de interfaz ni desbordamiento horizontal en móvil. | PASS |
| DOCENTE | `/admin`, escritorio | Redirección a `/access-denied`; no se renderiza navegación ni contenido administrativo. | PASS |
| ADMIN | `/admin`, escritorio | El resumen se carga con rol localizado como “Administrador”, sin exponer el valor interno. | PASS |
| ADMIN | `/admin/operations`, 390 × 844 | Indicadores y estado vacío de la cola legibles, sin overlay de error ni desbordamiento horizontal. El menú administrativo se despliega y expone las rutas autorizadas. | PASS |
| SUPERADMIN | `/admin/users`, escritorio | Se ven solo las tres cuentas QA ficticias con etiquetas “Docente”, “Administrador”, “Superadministrador” y “Activa”. La auditoría permanece vacía. | PASS |

En las rutas verificadas el navegador no reportó errores ni overlays de
Next.js/Vite. Esta evidencia es de interfaz y autorización efectiva; no
sustituye los contratos de API, RLS ni las pruebas automatizadas ya ejecutadas.

## Disponibilidad posterior al despliegue

- `GET /health/ready` de la API pública: `200`.
- Inicio público de la web: `200` y contenido de marca presente.
- Inspección de Vercel: despliegue `Ready`; la consulta de errores del último
  periodo no devolvió eventos.

## Calidad del cambio web

- `npm run test --workspace=web`: **PASS**, 100 pruebas.
- `npm run typecheck --workspace=web`: **PASS**.
- `npm run lint --workspace=web`: **PASS**.
- `npm run build --workspace=web`: **PASS**.
- Revisión independiente del diff de interfaz: sin hallazgos
  BLOCKER, HIGH, MEDIUM ni LOW. La única observación opcional, CSS sin uso del
  código ocultado, se retiró antes de publicar.

## Límites que permanecen deliberadamente fuera del piloto

- No se probó borrar historial, revisar una consulta no resuelta ni cambiar
  rol/estado en producción, porque esas acciones generan auditoría append-only
  o alteran datos. Requieren staging desechable o una decisión explícita de
  retención de evidencia QA.
- No se activaron proveedor IA, ingesta RAG, PDFs, correo, memoria FAQ ni
  telemetría de costo.
- El resultado no constituye aceptación contractual final del Hito 4: esa
  aceptación corresponde al cliente después de su revisión funcional.
