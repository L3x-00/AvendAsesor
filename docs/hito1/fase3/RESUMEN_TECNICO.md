# Fase 3 — Flujos de autenticación de extremo a extremo

## Objetivo

Entregar una experiencia funcional y segura para que un docente se registre, confirme su correo, inicie/cierre sesión y recupere su contraseña. Los flujos se construyen sobre las garantías de identidad, perfiles y ambientes de la Fase 2; no duplican la gestión de credenciales que ya proporciona Supabase Auth.

## Incluye

- Pantallas web responsive y accesibles para registro, login, confirmación, recuperación y actualización de contraseña, con estados de carga, éxito y error.
- Validación compartida y defensiva de nombre completo, correo y contraseña. La API vuelve a validar todo lo recibido.
- Registro que solicita al proveedor crear la cuenta y genera un perfil inicial `docente` por el mecanismo seguro de Fase 2.
- Confirmación de correo mediante enlaces/redirects explícitamente permitidos. Se manejan enlaces inválidos, expirados o ya utilizados sin filtrar información sensible.
- Login, renovación/control de sesión y logout seguro. Las rutas privadas responden de manera consistente cuando la sesión es inválida o expira.
- Solicitud de recuperación, redirección autorizada y cambio de contraseña. La solicitud no revela si el correo está registrado.
- Configuración de plantillas y remitente a través de Supabase Auth, Mailpit para desarrollo local y Resend SMTP para futuros ambientes remotos; se documentan dependencias de SMTP/DNS sin exponer secretos.
- Observabilidad segura: identificación de errores de flujo, sin registrar contraseñas, tokens, enlaces de recuperación ni claves.

## No incluye

- Login social, MFA, SSO, perfiles avanzados, CRUD de usuarios ni personalización completa de marca.
- Roles administrables desde la UI, autorización del panel ni módulos de Hitos 2 a 5.

## Casos de prueba mínimos

| Flujo | Casos que deben pasar |
| --- | --- |
| Registro | datos válidos; email con formato inválido; contraseña débil; intento duplicado sin enumeración; perfil inicial correcto |
| Confirmación | enlace válido; enlace vencido; reintento; redirect permitido y no permitido |
| Sesión | login válido; credenciales inválidas; sesión expirada; logout e intento posterior de ruta privada |
| Recuperación | solicitud existente/no existente con respuesta equivalente; enlace válido/vencido; contraseña actualizada; login con nueva contraseña |
| Errores | proveedor temporalmente no disponible; datos de red incompletos; mensajes comprensibles sin datos sensibles |

## Criterios de salida

- CA-01, CA-02 y CA-03 pasan de forma automatizada en entorno aislado y están listos para repetirse en staging.
- La funcionalidad usa las configuraciones separadas de desarrollo/staging y no incluye secretos en el cliente o repositorio.
- Los correos de confirmación y recuperación se entregan y dirigen únicamente a URLs autorizadas en el ambiente habilitado.
- Las pruebas cubren éxitos, denegaciones, expiración y errores de proveedor relevantes.
- La revisión independiente no deja hallazgos `BLOCKER` o `HIGH` en el alcance.

## Dependencias externas

- Configuración efectiva de correo, remitente y DNS aprobados por AVEND.
- Logo, colores y referencias de marca para reemplazar el estilo funcional neutral cuando se reciban; su ausencia no justifica omitir accesibilidad ni seguridad.

## Ejecución local y evidencia

Estado al 2026-08-09: `BLOCKED` solo para aceptación de correo/staging. El proyecto de desarrollo ya es accesible y tiene la migración aplicada. Mailpit quedó configurado de forma local y Resend documentado como SMTP remoto futuro, pero Docker Desktop no está iniciado y no existe todavía un dominio/API key/URL de staging aprobados para ejecutar CA-01, CA-02 y CA-03.

### Artefactos implementados

- Autenticación SSR de Next.js mediante `@supabase/ssr`, cookies y una clave pública de Supabase. La clave `service_role` no se expone al navegador.
- Pantallas accesibles y responsivas para crear cuenta, iniciar sesión, confirmar correo, recuperar y actualizar contraseña.
- Server Actions que validan nombre, correo y contraseñas; callbacks PKCE con retornos internos validados; cierre de sesión local protegido contra solicitudes de origen no confiable.
- Suite Vitest para web y puerta de cobertura integrada en `npm run test:coverage` junto con las pruebas de API.
- ADR-0004 y `.env.example` del frontend con nombres de variables, sin valores ni secretos.

### Verificación realizada

- Lint, typecheck, pruebas unitarias, cobertura, API E2E, build, auditoría de dependencias de producción y `git diff --check`: PASS.
- API: 27 pruebas, 100% líneas/funciones/sentencias y 93.18% ramas.
- Web: 21 pruebas; 100% líneas/funciones/sentencias y 96.36% ramas para el alcance cubierto.
- Prueba visual local: inicio y formulario de registro cargan sin overlay/error de navegador; campos, enlaces y validación de datos inválidos fueron comprobados sin crear usuarios reales.
- Revisión independiente: Claude Code no reportó hallazgos `BLOCKER`, `HIGH` ni `MEDIUM`. Se endureció la observación preventiva sobre el callback para permitir únicamente los dos destinos de flujo esperados; su re-revisión tampoco encontró hallazgos de esas severidades.

### Pendiente externo

- Iniciar Docker Desktop y ejecutar Mailpit/Supabase local para repetir confirmación y recuperación sin correo real.
- Configurar Resend SMTP y URLs exactas solo en un proyecto staging confirmado, con dominio verificado y secretos gestionados fuera de Git.
- Repetir CA-01, CA-02 y CA-03 con cuentas de prueba, correo real y staging aislado.
