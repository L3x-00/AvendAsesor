# Estado Actual — AVEND ASESOR

> Documento vivo.
>
> Debe actualizarse cuando cambie el estado real del proyecto.
>
> No utilizarlo como historial infinito.

---

## Fecha de referencia

24 de agosto de 2026.

## Estado verificado vigente

- Hitos 1 y 2: esquema, backend y frontend publicados previamente; la
  aceptación contractual por correo real continúa separada.
- Hitos 3 y 4: las 23 migraciones acumulativas ya están aplicadas en Supabase
  producción desde un checkout limpio y el historial coincide en 29 versiones.
- Aplicación: el lote visual/UI responsive y las pantallas operativas están
  verificados localmente. La fase actual prepara su release API/Web y las
  cuentas QA de datos ficticios.
- Límites intencionales: no se habilitan worker RAG, proveedor IA, corpus,
  HMAC de memoria FAQ ni correo transaccional durante estas pruebas visuales.
- Recuperación: el plan Free no aporta PITR; antes de una futura migración se
  repite el respaldo lógico privado y la validación en staging.

---

## Estado general

**Proyecto:** AVEND ASESOR

**Estado comercial:** Cerrado.

**Estado contractual:** Cerrado / inicio de ejecución.

**Estado técnico:** Esquema Hitos 1–4 en producción; despliegue de aplicación y
QA autenticada en curso.

---

## Fase actual

Hito 4 / Fase 2 de release: integración y despliegue de API/Web.

---

## Repositorio

Repositorio GitHub:

`L3x-00/AvendAsesor`

---

## Estructura inicial creada

```text
AvendAsesor/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   └── shared/
├── docs/
│   ├── architecture/
│   ├── requirements/
│   └── manuals/
├── infrastructure/
│   ├── render/
│   ├── vercel/
│   └── supabase/
├── scripts/
│   └── database/
├── .github/
│   └── workflows/
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
Frontend

Inicializado con:

Next.js;
TypeScript;
Tailwind CSS;
ESLint.

Estado:

BASE CREADA

Backend

Inicializado con:

NestJS;
TypeScript.

Estado:

BASE CREADA

Monorepo

Configurado mediante:

npm Workspaces

Estado:

ACTIVO

Git

Repositorio inicializado.

Remote configurado.

Primer commit de estructura realizado o previsto según estado local.

Sistema multiagente

El proyecto incorpora un entorno de IA asistida.

Arquitectura prevista:

AGENTS.md

.ai-shared/
├── context/
├── memory/
├── coordination/
└── scripts/

.agents/
└── skills/

.claude/
.codex/
.kimi-code/
Agentes

Herramientas previstas:

Codex;
Claude Code;
Kimi Code.

Roles dinámicos.

Skills previstas
architecture-evolution
cross-review
dangerous-actions
git-autonomy
handoff
memory-sync
task-execution
tooling-autonomy
Arquitectura base

Estado:

DEFINIDA CON POSIBILIDAD DE AJUSTE

Modelo:

Next.js frontend;
NestJS backend;
Supabase;
PostgreSQL;
pgvector;
Mailpit (desarrollo) / Resend SMTP (remoto);
Render;
Vercel;
GitHub.
Decisiones todavía pendientes
ORM

Evaluar:

Prisma;
Drizzle;
Supabase SDK.
Modelo OpenAI

Definir en Hito RAG según:

precio;
calidad;
contexto;
latencia.
Embeddings

Definir modelo antes de indexación productiva.

OCR

Validar si Tesseract cubre la documentación real.

Infraestructura final

Confirmar planes gratuitos o pagos según consumo.

Próximas tareas
Completar contexto multiagente.
Configurar AGENTS.md.
Completar Skills.
Configurar memoria compartida.
Crear ambientes Supabase.
Crear staging.
Implementar autenticación.
Implementar roles.
Implementar layout administrativo.
Configurar CI básico.
Riesgos actuales
Documentación aún no probada

Los formatos reales pueden afectar OCR y RAG.

Límites gratuitos

Planes free pueden ser suficientes inicialmente, pero deben monitorearse.

Integración Auth

Debe evitarse duplicar responsabilidades entre Supabase Auth y backend.

Desarrollo multiagente

Los agentes deben revisar tareas activas antes de modificar código compartido.
Estado resumido
PROJECT STRUCTURE     DONE
MONOREPO              DONE
FRONTEND BASE         DONE
BACKEND BASE          DONE
GIT                   DONE / VERIFY REMOTE STATE
ARCHITECTURE          BASE DEFINED
AUTH                   NEXT
RBAC                   NEXT
SUPABASE               PENDING
STAGING                PENDING
RAG                    FUTURE HITO
PRODUCTION             FUTURE HITO
