# Documentación Esperada — AVEND ASESOR

## 1. Objetivo

La documentación debe permitir que un desarrollador técnicamente competente pueda comprender, ejecutar, mantener y continuar AVEND ASESOR sin depender permanentemente del equipo original.

La documentación deberá reflejar el sistema real.

No documentar funcionalidades inexistentes.

---

# 2. Documento de Arquitectura

Debe contener:

- visión general;
- frontend;
- backend;
- base de datos;
- RAG;
- servicios externos;
- diagramas;
- flujos;
- seguridad;
- despliegue;
- decisiones principales.

Ruta sugerida:

```text
docs/architecture/
3. ADR

Ruta:

.ai-shared/memory/decisions/

Ejemplos:

ADR-0001-monorepo.md
ADR-0002-auth-supabase.md
ADR-0003-vector-store-pgvector.md
ADR-0004-ai-provider.md
4. Guía de instalación local

Debe explicar:

requisitos;
Node;
npm;
clonado;
instalación;
.env;
Supabase;
migrations;
ejecución frontend;
ejecución backend;
tests.
5. Variables de entorno

Mantener:

.env.example

Nunca incluir secretos reales.

Ejemplos esperados:

DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Las credenciales SMTP de Resend se gestionan en Supabase/secret manager; no se exponen al runtime web.
OPENAI_API_KEY=
FRONTEND_URL=
API_URL=

Los nombres definitivos dependerán de implementación.

6. Documentación API

Generada mediante:

OpenAPI / Swagger

Debe describir:

endpoint;
método;
autenticación;
request;
response;
errores.
7. Esquema de base de datos

Debe contener:

tablas;
columnas;
relaciones;
enums;
índices;
RLS;
funciones relevantes;
migrations;
vector indexes.
8. Manual de despliegue

Debe documentar:

Frontend
Vercel;
variables;
dominio;
deployment.
Backend
Render;
variables;
health checks;
deployment.
Supabase
proyectos;
migrations;
backups;
storage;
Auth;
pgvector.
9. Manual de Superadministrador

Debe explicar:

acceso;
usuarios;
roles;
módulos;
documentos;
procesamiento;
reprocesamiento;
consultas sin respuesta;
métricas;
auditoría;
configuración.
10. Manual de Administrador

Debe explicar únicamente las funciones que correspondan a su rol.

11. Manual del Docente

Debe explicar:

registro;
validación;
login;
módulos;
consultas;
fuentes;
historial;
generación documental;
cuenta.
12. Guía RAG

Debe explicar al administrador:

qué documentos funcionan mejor;
formatos;
calidad;
OCR;
estructura;
versiones;
actualización;
reprocesamiento;
fuentes;
preguntas sin evidencia.
13. Seguridad

Debe documentarse:

autenticación;
permisos;
RLS;
secretos;
backups;
auditoría;
logs;
incidentes.

No incluir secretos reales.

14. Backups

Documentar:

qué se respalda;
frecuencia;
responsables;
procedimiento;
restauración.
15. Servicios externos

Mantener inventario:

SERVICE
PURPOSE
OWNER
PLAN
COST
LIMITS
ENVIRONMENT

Ejemplos:

Supabase;
Render;
Vercel;
Mailpit (desarrollo) / Resend SMTP (remoto);
OpenAI;
GitHub;
dominio.
16. Manual de continuidad

Debe permitir a otro equipo:

obtener código;
instalar;
configurar;
levantar localmente;
realizar cambios;
ejecutar tests;
desplegar;
diagnosticar errores.
17. Documentación de testing

Debe incluir:

estrategia;
unit;
integration;
E2E;
pruebas RAG;
smoke;
aceptación.
18. CHANGELOG

Mantener cambios relevantes por versión cuando la aplicación entre en etapas de release.

19. README principal

El repositorio deberá mantener un README actualizado con:

descripción;
arquitectura resumida;
estructura;
requisitos;
comandos;
desarrollo;
enlaces internos.
20. Documentación multiagente

El repositorio también mantendrá documentación específica para asistentes de IA.

Incluye:

AGENTS.md
CLAUDE.md

.ai-shared/context/
.ai-shared/memory/
.ai-shared/coordination/

.agents/skills/
.claude/
.codex/
.kimi-code/

Esta documentación no reemplaza la documentación técnica convencional.

Su función es mantener continuidad entre agentes.

21. Regla de actualización

La documentación debe actualizarse junto con el código cuando un cambio afecte:

arquitectura;
stack;
comandos;
configuración;
API;
base de datos;
infraestructura;
comportamiento relevante.

No esperar al final del proyecto para reconstruir toda la documentación desde memoria.

22. Documentación final mínima

Antes de la entrega final deben existir como mínimo:

README
ARCHITECTURE
INSTALLATION
DEPLOYMENT
DATABASE
API
ADMIN MANUAL
USER MANUAL
RAG GUIDE
SECURITY
BACKUPS
SERVICES INVENTORY
ENV EXAMPLE
TRANSFER GUIDE

La documentación deberá corresponder a la versión realmente desplegada.
