# Hito 0 — Base visual e identidad de interfaz

## Objetivo

Preparar una base visual reutilizable para AVEND ASESOR sin introducir ni
alterar funcionalidad, backend, contratos de API, autorización, RLS, Storage o
modelo de datos.

## Fuente de verdad visual

La guía visual y funcional proporcionada por AVEND es la referencia aprobada.
No se reinterpretan el logo, la paleta, el orden de los módulos ni la jerarquía
de interacción. Los referentes entregados se usan para entender densidad,
estructura y comportamiento, no para copiar una identidad ajena.

## Entregado

- Tokens globales con la paleta aprobada: azul profundo `#0D1B3D`, azul de
  acento `#1677FF`, azul claro `#E8F1FF`, fondo `#F3F5F9`, borde `#E5E7EB`,
  texto secundario `#667085`, texto principal `#111827` y blanco `#FFFFFF`.
- `BrandLogo`, componente de servidor que consume exclusivamente las variantes
  WebP oficiales para fondo claro u oscuro.
- Paquete de favicon integrado bajo `apps/web/public/favicon/`, con metadatos,
  manifest, iconos Apple/Android y color de interfaz del navegador.
- Base global de accesibilidad: foco visible, selección legible, estilo
  reutilizable para el enlace de salto de contenido y respeto por
  `prefers-reduced-motion`.
- Pruebas unitarias del selector de logo para prevenir sustitución accidental
  del activo oficial.

## Criterios para las siguientes fases visuales

1. Usar los tokens de esta fase, no valores de color improvisados.
2. Mostrar el logo blanco oficial sobre la barra lateral azul profundo y la
   variante oscura sobre fondo claro.
3. Conservar los módulos y submódulos en el orden de la guía; la barra lateral
   no desplegará submódulos.
4. Cada nueva superficie debe incluir estados de foco, teclado, carga, vacío,
   error y denegación que correspondan a su funcionalidad existente.
5. La interfaz solo presenta datos y acciones ya autorizadas por el servidor;
   nunca sustituye controles de NestJS, Supabase Auth o RLS.

## Exclusiones explícitas

- No se creó un chat simulado ni se adelantó RAG, SSE, historial, fuentes o
  recuperación de respuestas.
- No se alteró código de backend, migraciones, proveedores, secretos ni
  configuración de ambientes.
- Las pantallas de autenticación y administración se adaptarán en sus fases
  visuales previstas (Hitos 1 y 2) sobre esta base.
