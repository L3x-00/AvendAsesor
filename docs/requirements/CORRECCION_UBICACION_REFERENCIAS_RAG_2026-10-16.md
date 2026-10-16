# Ubicación verificable en las referencias del RAG

## Problema y causa comprobada

El historial aportado muestra el mensaje «No se identificó una ubicación más
precisa en el fragmento» tanto en fuentes citadas como en fragmentos revisados.
La interfaz lo mostraba cuando no había sección, artículo ni numeral, aunque
sí tenía la página física o el rango de páginas del PDF.

La migración `20261014165506_rag_verified_metadata.sql` anuló metadatos históricos
que no demostraban ubicación estructural. La lectura del corpus de producción
el 16 de octubre de 2026 confirmó 23 fragmentos de cuatro registros documentales:
DS 049-2025-EF y preguntas frecuentes de auxiliares. Sus referencias jurídicas
están vacías; algunos títulos restantes son cabeceras de El Peruano que la
interfaz descarta correctamente. El fragmento salarial de la página 3 mezcla
numerales, el artículo 3 y un artículo de otra norma reproducido por modificación.
No permite atribuir todo su contenido a un único artículo.

## Corrección

Cuando faltan metadatos estructurales válidos, la columna **Ubicación** muestra:

- PDF: «Página 3 del PDF · Sin sección o artículo identificado» o el rango real.
- Word y otros formatos: «Fragmento del documento · Sin sección o artículo identificado».

Se conservan sección, artículo y numeral cuando existen. El mismo componente
cubre fuentes citadas, fragmentos no citados, historial y ficha de orientación.
No cambia el contrato, el RAG, la ingesta, la persistencia ni el acceso a fuentes.
Los enlaces conservan la página inicial y las descargas autorizadas.

La corrección no reconstruye artículos desconocidos ni reprocesa documentos.
Recuperar mayor detalle en material antiguo requiere una estructura comprobable
en el documento y, cuando corresponda, un reproceso autorizado del corpus.

## Verificación

- Web completa: 111 archivos y 913 pruebas aprobadas.
- Regresiones: página única, rango, total desconocido, cabecera descartada,
  Word sin páginas PDF, ambas tablas, metadatos presentes y enlaces existentes.
- Tipos, lint de los archivos afectados, compilación web y comprobación del diff:
  aprobados.
- Revisión independiente final: APPROVE, sin BLOCKER, HIGH ni MEDIUM.
- Diagnóstico del corpus: solo lectura; ninguna escritura ni reindexado remoto.

Rama independiente: `codex/corregir-ubicacion-referencias-rag`, desde
`origin/main@7fbf03a`. Los cambios SQL y pruebas de otra IA quedan fuera de la entrega.

Límite heredado: las fuentes antiguas sin MIME conservan la clasificación PDF
que ya aplicaba la interfaz. No se ha validado manualmente este cambio en producción.
