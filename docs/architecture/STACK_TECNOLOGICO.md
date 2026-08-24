# Stack Tecnológico — AVEND ASESOR

## 1. Principios para seleccionar tecnología

Las decisiones deberán priorizar:

1. mantenibilidad;
2. seguridad;
3. compatibilidad;
4. escalabilidad;
5. documentación;
6. ecosistema;
7. costo;
8. velocidad de desarrollo;
9. soporte con asistentes de IA;
10. facilidad de migración.

Una tecnología no debe utilizarse únicamente porque sea nueva.

---

# 2. Frontend

## Next.js

Framework principal.

Uso:

- landing;
- autenticación;
- aplicación docente;
- panel administrativo;
- navegación;
- renderizado;
- integración API.

## React

Sistema de componentes.

## TypeScript

Obligatorio como lenguaje principal.

Beneficios:

- tipos;
- mantenibilidad;
- mejores refactors;
- integración excelente con Codex y Claude Code;
- reducción de errores.

## Tailwind CSS

Sistema de estilos.

## shadcn/ui

Componentes base personalizables.

No debe utilizarse como una dependencia cerrada de UI.

## TanStack Query

Gestión de:

- requests;
- cache;
- loading;
- retries;
- invalidación.

## React Hook Form

Formularios.

## Zod

Validación de schemas.

---

# 3. Backend

## NestJS

Framework principal.

Razones:

- arquitectura modular;
- DI;
- guards;
- interceptors;
- pipes;
- testing;
- integración empresarial;
- TypeScript nativo.

---

# 4. Base de datos

## PostgreSQL

Base de datos principal.

## Supabase

Servicio administrado para:

- PostgreSQL;
- Auth;
- Storage;
- pgvector;
- tooling.

## pgvector

Embeddings y similarity search.

---

# 5. ORM / acceso a datos

Decisión a validar mediante ADR:

- Prisma;
- Drizzle;
- Supabase SDK;
- combinación controlada.

Antes de cerrar la decisión deben comprobarse:

- pgvector;
- migrations;
- RLS;
- tipos;
- performance;
- compatibilidad con Supabase.

No introducir dos ORM sin justificación.

---

# 6. Autenticación

## Supabase Auth

Responsable de:

- registro;
- email;
- credenciales;
- tokens;
- sesiones;
- password reset.

La autorización de negocio continuará siendo responsabilidad de AVEND ASESOR.

---

# 7. Storage

## Supabase Storage

Buckets privados para:

- PDF;
- DOCX;
- imágenes;
- documentos generados cuando corresponda.

---

# 8. IA

Proveedor inicialmente recomendado:

## OpenAI API

Debe encapsularse mediante una capa de proveedor.

Ejemplo conceptual:

```text
AIProvider
├── generate()
├── embed()
└── stream()

Esto permitirá reemplazar o añadir:

Gemini;
Claude;
otros proveedores.

No acoplar la lógica RAG directamente a un modelo concreto.

9. Embeddings

El modelo de embeddings deberá decidirse en el Hito RAG considerando:

precio;
precisión;
dimensión;
idioma español;
velocidad.

La elección debe documentarse mediante ADR si afecta estructura persistente.

10. Correo
Mailpit (desarrollo) + Resend SMTP (remoto)

Uso:

confirmación;
recuperación;
correos transaccionales.

La capa de correo debe estar abstraída.

11. OCR

Primera alternativa:

Tesseract

Adecuado para casos simples.

Si la calidad requerida supera su capacidad se evaluarán:

Google Cloud Vision;
Azure Document Intelligence;
AWS Textract;
otros.

No introducir un servicio de pago hasta demostrar necesidad.

12. Hosting
Frontend

Preferencia:

Vercel

Alternativa:

Render

Backend

Preferencia:

Render

Workers

Preferencia inicial:

Render

La infraestructura podrá evolucionar según consumo.

13. CI/CD
GitHub Actions

Validaciones mínimas recomendadas:

install;
lint;
typecheck;
tests;
build.

Posteriormente:

security checks;
E2E;
deployments.
14. Repositorio
GitHub

Uso:

código;
ramas;
PR;
issues;
releases;
CI/CD;
gestión.
15. Gestión del proyecto
GitHub Projects

Tablero principal recomendado.

16. Observabilidad
Logs estructurados

Backend deberá generar logs estructurados.

Sentry

Recomendado para:

frontend;
backend;
errores;
stack traces.

La activación final dependerá de costos y necesidades.

17. Testing

Frontend:

Vitest/Jest según compatibilidad;
React Testing Library;
Playwright.

Backend:

Jest;
Supertest.

E2E:

Playwright.
18. API Docs
Swagger / OpenAPI

NestJS deberá exponer documentación API en ambientes autorizados.

19. Tooling de desarrollo

Se permite utilizar:

ESLint;
Prettier;
Husky;
lint-staged;
Docker;
CLIs;
MCP;
scripts.

Solo cuando aporten valor real.

20. Asistentes de IA

Herramientas activas o previstas:

Codex;
Claude Code;
Kimi Code;
Gemini;
agentes especializados.

Los agentes pueden sugerir cambios de stack.

Pero cualquier cambio significativo deberá:

comparar alternativas;
justificar beneficios;
analizar impacto;
evitar migraciones innecesarias;
registrar ADR cuando corresponda.
