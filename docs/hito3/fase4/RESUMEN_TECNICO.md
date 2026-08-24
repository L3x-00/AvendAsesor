# Hito 3 — Fase 4: retrieval, fuentes y guardrails

## Objetivo

Recuperar únicamente evidencia vigente y decidir entre responder, pedir
aclaración o declarar falta de evidencia.

## Entregado

- Puerto de retrieval y adaptador server-side para la RPC de búsqueda.
- Consulta vectorial y texto completo con umbral configurable inicial de 0.70
  y máximo de cinco resultados.
- Filtro duro por módulo seleccionado.
- Detección de evidencia repartida entre módulos: solo se pide aclaración si
  los resultados no comparten un módulo; un documento asociado a varios no
  genera un falso positivo.
- Prompt evidence-only que trata los chunks como datos no confiables, limita
  su tamaño, neutraliza delimitadores de control y prohíbe instrucciones
  documentales, secretos, herramientas o hechos inventados.
- Puerto `AnswerGateway` con adaptador OpenAI intercambiable. Sin clave o ante
  error de proveedor, el flujo falla de forma segura y no inventa una respuesta
  extractiva.
- RPCs `begin_chat_turn` y `complete_chat_turn`: validan pertenencia, módulo,
  versión y chunks citados; guardan respuesta y fuentes como instantáneas en
  una sola transacción o registran la consulta no resuelta.
- Pruebas de filtro, no-resultados, ambigüedad, prompt injection, proveedor
  sin clave y persistencia/rollback de fuentes.

## Resultado

La Fase 4 queda lista para el chat real de Fase 5. CA-07 a CA-10 tienen
evidencia automatizada local; su aceptación contractual remota sigue separada.
