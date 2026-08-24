# Hoja de ruta visual, interfaz y UI/UX — AVEND ASESOR

## Regla de prioridad

El trabajo visual, de interfaz y UI/UX queda en segundo plano por defecto. Solo
se inicia o amplía mediante una instrucción explícita del Product Owner. Una
instrucción visual no autoriza cambios de backend, API, seguridad, RLS,
Storage, base de datos, proveedores, reglas de negocio ni criterios de
aceptación funcionales.

Cuando se autorice una tarea visual, se aplicará `ui-ux-pro-max` y la guía
correspondiente de Next.js. Se verificará accesibilidad, respuesta en escritorio
tableta/teléfono y preservación de todos los límites server-side existentes.

La identidad definitiva no se inventará: logo, paleta institucional, fuentes y
referencias finales requieren insumos o aprobación expresa de AVEND. Las
recomendaciones generadas por la Skill son propuestas, no decisiones de marca.

## Público objetivo y facilidad de uso

La interfaz se dirige principalmente a docentes y profesionales de 30 años o
más. Esto exige comprensión inmediata, no una interfaz infantilizada. Cada fase
visual debe mantener texto base de al menos 16px, contraste AA, líneas de
lectura cómodas, controles de al menos 44px, etiquetas explícitas para iconos,
mensajes de estado claros, navegación predecible y movimiento discreto que
respete `prefers-reduced-motion`. Se evita la densidad excesiva, tipografía
pequeña, instrucciones técnicas no explicadas y acciones que solo aparezcan al
pasar el cursor.

## Mapa de hitos y fases visuales

| Hito | Fase visual | Alcance de interfaz | Estado |
| --- | --- | --- | --- |
| Hito 0 | Preparación transversal | Inventario de marca, tokens, componentes base y criterios de accesibilidad; no modifica funcionalidades | Preparación autorizada |
| Hito 1 | Fase 3 | Refinamiento de registro, confirmación, acceso y recuperación; estados de carga/error y accesibilidad | Implementado y verificado localmente; auditoría independiente pendiente |
| Hito 1 | Fase 4 | Navegación según rol, vista de acceso denegado y punto de entrada administrativo protegido | Implementado y verificado localmente; auditoría independiente pendiente |
| Hito 2 | Fase 5 | Rediseño del panel administrativo de módulos, documentos, formularios, tablas, estados y descargas | Implementado y verificado localmente; auditoría independiente pendiente |
| Hito 3 | Fase 5 | Chat docente, selector de módulo, streaming, aclaraciones, no-evidencia, fuentes e historial | Implementado localmente; liberación remota depende del release acumulativo y de proveedor/corpus autorizados |
| Hito 3 | Fase 6 | Validación visual y responsive de CA-06 a CA-11 sin alterar el motor RAG | Integrada con la Fase visual Hito 4; requiere pruebas autenticadas de staging |
| Hito 4 | Fase 6 | Dashboard, usuarios/roles, consultas no resueltas, métricas, auditoría y responsive | Activa: frontend BFF y pruebas locales; no se activa IA/correo ni se modifican contratos |
| Hito 5 | Fases por planificar | Pulido de producción, revisión de consistencia, accesibilidad, manuales visuales y capacitación | Requiere desglose oficial del Hito 5 |

## Orden de ejecución cuando se active el frente visual

1. Confirmar objetivo de la pantalla y datos de marca disponibles.
2. Diseñar tokens y componentes reutilizables sin modificar contratos de API.
3. Actualizar una superficie funcional por vez, con estados vacío, carga, error,
   éxito y denegación cuando aplique.
4. Probar teclado, lectores de pantalla, contraste, movimiento reducido y
   anchos de 375, 768, 1024 y 1440 píxeles.
5. Ejecutar las pruebas web y regresiones funcionales existentes antes de dar
   por cerrada la mejora visual.

## Límites actuales

- No se publican cambios ni se alteran ambientes por trabajo visual.
- No se crea una nueva funcionalidad para justificar una pantalla.
- El frontend nunca sustituye autorización de NestJS, RLS ni controles de
  servidor.
- El chat de Hito 3 conserva como requisito previo el SSE, el historial y las
  fuentes reales; la interfaz no puede simularlos.
- La revisión independiente de las superficies visuales requiere que Claude
  Code vuelva a estar autenticado o que se habilite otro auditor independiente.
