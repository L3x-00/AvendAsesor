# Estado Actual — AVEND ASESOR

> Documento vivo.
>
> Debe actualizarse cuando cambie el estado real del proyecto.
>
> No utilizarlo como historial infinito.

---

## Fecha de referencia

28 de agosto de 2026.

## Estado verificado vigente

- Primera etapa CU-01…CU-15: código integrado en `main`, con los cierres API
  (`5872065`) y Web (`ba4e881`) publicados mediante PR #8 y PR #9.
- Producción: Vercel `dpl_FkCcjj3EdSDDq4uB49peEA1AZzkM` está `Ready`; web,
  API readiness, chat autenticado responsive e historial QA de lectura pasan.
- Supabase: historial local/remoto 31/31. Las dos migraciones de contexto seguro
  y vínculos de respuesta requeridas por la primera etapa están aplicadas.
- Calidad: API 261 pruebas + 26 E2E; web 173; pgTAP 292; builds, cobertura,
  trazado CU-14 y auditoría Claude Code Opus 4.8 en verde sin BLOCKER/HIGH/MEDIUM.
- Límites intencionales: producción no tiene corpus normativo, fuentes, chunks
  ni vectores reales. PI-01…PI-06 y la aceptación del cliente siguen pendientes.
- Recuperación: el plan Free no aporta PITR; antes de una futura migración se
  repite el respaldo lógico privado y la validación en staging.

---

## Estado general

**Proyecto:** AVEND ASESOR

**Estado comercial:** Cerrado.

**Estado contractual:** Cerrado / inicio de ejecución.

**Estado técnico:** Primera etapa implementada, integrada y desplegada;
validación funcional con corpus real y aprobación del cliente pendientes.

---

## Fase actual

Cierre técnico de la primera etapa y preparación del corpus autorizado para
PI-01…PI-06.

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
