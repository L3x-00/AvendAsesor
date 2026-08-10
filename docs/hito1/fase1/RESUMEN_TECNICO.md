# Fase 1 — Base de ingeniería, contratos y calidad

## Objetivo

Dejar una base de implementación verificable para Auth y RBAC antes de integrar cuentas o credenciales externas. Esta fase reduce retrabajo: fija límites entre web, API, Supabase y datos; establece las pruebas que protegerán el backend y convierte los requisitos del Hito 1 en casos comprobables.

## Incluye

- Inventario del estado actual, deuda heredada y comandos de calidad.
- Definición y aplicación de una política soportada de Node.js para desarrollo y CI, basada en compatibilidad comprobada de las herramientas del repositorio.
- Arquitectura modular inicial mediante `AuthModule`, `UsersModule` y `AuthorizationModule`, sin crear funcionalidades futuras del producto.
- Decisión documentada del límite de responsabilidades: Supabase Auth gestiona credenciales, sesiones y correo; la API valida identidad y AVEND ASESOR conserva perfiles, roles y autorización de negocio.
- Evaluación acotada y ADR para el acceso a datos/migraciones antes de adoptarlo. No se incorporan dos ORM ni una abstracción sin una necesidad demostrada.
- Contratos de API, modelos de error, validación, configuración tipada y archivos `.env.example` sin valores sensibles.
- Puerta de calidad: comandos de lint, typecheck, pruebas unitarias, integración API, E2E y build; estructura de fixtures y convenciones para pruebas deterministas.
- Corrección de la advertencia de lint heredada `no-floating-promises` o su manejo explícito con reporte de errores, para que la línea base no esconda fallos nuevos.

## No incluye

- Creación de proyectos Supabase, Resend, Vercel o Render.
- Registro, login, tablas de negocio, migraciones reales, correos o UI final.
- IA, RAG, documentos, panel administrativo funcional o despliegues.

## Diseño técnico previsto

```text
apps/web  -> formularios y experiencia de sesión
                | contratos compartidos, nunca secretos
apps/api  -> autenticación de solicitudes, perfiles, RBAC y API
                | adaptador de identidad y repositorios
Supabase  -> Auth, PostgreSQL y políticas de datos (Fase 2)
```

La protección de rutas de Next.js se tratará como comodidad de navegación. Ninguna ruta o endpoint administrativo dependerá solo de esa capa: la API y las políticas de datos deberán denegar explícitamente los accesos no autorizados.

## Plan de ejecución

1. Inspeccionar el starter y sus pruebas para no reemplazar comportamiento funcional sin evidencia.
2. Registrar ADR de acceso a datos y de frontera Auth/API solo después de una prueba técnica breve y reproducible.
3. Implementar configuración validada al inicio de la aplicación, manejo central de errores y convenciones de respuesta que no filtren secretos ni datos de autenticación.
4. Preparar adaptadores sustituibles para Supabase y correo, de forma que las pruebas usen dobles controlados y no cuentas reales.
5. Crear la estructura de suites, datos de prueba y scripts de CI. El backend debe poder probar reglas y guards sin red; las integraciones reales se ejecutarán en un ambiente aislado.
6. Añadir pruebas de regresión de la base y corregir cualquier fallo introducido.

## Criterios de salida

- La política de Node, las dependencias nuevas y los ADR aplicables están documentados con evidencia.
- La API dispone de una base de configuración y pruebas reutilizable; los tests no requieren secretos ni conectarse a producción.
- Lint, typecheck, unitarias, integración API, E2E inicial y build están verdes en el entorno soportado, o cualquier limitación externa está registrada como bloqueo real.
- Se corrigió o se hizo explícito el manejo de la advertencia heredada de `bootstrap()`.
- La revisión independiente no deja hallazgos `BLOCKER` o `HIGH` dentro de la fase.

## Riesgos y dependencias

- No se debe fijar ni publicar una configuración cloud real hasta recibir accesos aprobados.
- La decisión de datos debe comprobar compatibilidad con migraciones, RLS y los tipos de Supabase; una preferencia de herramienta no basta.
- Esta fase es la puerta obligatoria para Fase 2. Cualquier cambio de arquitectura persistente exige ADR y revisión.

## Registro de ejecución — 2026-08-08

Implementado en esta fase:

- Política de Node.js/npm, `.nvmrc` y CI alineados; el runtime de despliegue se comprobará antes de staging.
- Configuración de API validada con Zod, `.env.example` sin secretos y conservación de variables futuras para proveedores aún no integrados.
- Endpoint `GET /health`, configuración global de NestJS, Helmet, CORS de origen explícito y `ValidationPipe` restrictivo.
- Base de pruebas Jest/Supertest con cobertura obligatoria en CI: 90% de líneas, funciones y sentencias; 80% de ramas por decoradores generados.
- ADR-0002 que fija la frontera entre Supabase Auth futuro y la autorización de negocio de AVEND ASESOR. No se adoptó ORM ni SDK de Supabase.
- Módulos intencionalmente vacíos `AuthModule`, `UsersModule` y `AuthorizationModule`; fijan los límites de integración sin incorporar credenciales, persistencia o RBAC antes de la Fase 2.

Verificación local superada: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (10 pruebas; 100% líneas, funciones y sentencias; 83.33% ramas), `npm run test:e2e`, `npm run build`, `git diff --check` y `npm audit --omit=dev --audit-level=high`.

Estado de revisión: `REVIEW`. Se intentó una revisión read-only de Claude Code dos veces; la segunda esperó 184 segundos y terminó sin respuesta ni hallazgos. No se considera revisión independiente ejecutada. La Fase 2 no debe comenzar hasta completar esa revisión o registrar una alternativa independiente.
