# Arquitectura de Software — AVEND ASESOR

## 1. Estado de la decisión

**Estado:** Arquitectura base recomendada y adoptada para inicio del proyecto.

**Estilo:** Monolito modular con frontend y backend separados.

Esta arquitectura podrá evolucionar si aparecen requerimientos técnicos que justifiquen un cambio.

Las modificaciones estructurales relevantes deberán registrarse mediante ADR.

---

## 2. Principio arquitectónico

AVEND ASESOR no requiere inicialmente una arquitectura de microservicios.

Introducir microservicios desde el inicio aumentaría:

- complejidad;
- infraestructura;
- observabilidad;
- despliegues;
- coordinación;
- costos.

Se utilizará inicialmente un backend modular.

Cada dominio tendrá responsabilidades claras y podrá extraerse posteriormente si existe necesidad real.

---

## 3. Vista general

```text
                        USUARIO
                           │
                           ▼
                    ┌─────────────┐
                    │   NEXT.JS   │
                    │  FRONTEND   │
                    └──────┬──────┘
                           │
                        HTTPS
                           │
                           ▼
                    ┌─────────────┐
                    │   NESTJS    │
                    │   BACKEND   │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     SUPABASE          SERVICIOS         WORKERS
     POSTGRES            IA/RAG
          │
          ├── Auth
          ├── Storage
          ├── PostgreSQL
          └── pgvector
4. Frontend

Tecnología principal:

Next.js;
React;
TypeScript.

Áreas principales:

/
├── Landing
├── Auth
├── App Docente
│   ├── Chat
│   ├── Historial
│   ├── Generador
│   └── Cuenta
└── Admin
    ├── Dashboard
    ├── Usuarios
    ├── Roles
    ├── Módulos
    ├── Documentos
    ├── RAG
    ├── Consultas no resueltas
    ├── Auditoría
    └── Configuración
5. Backend

Framework:

NestJS

Organización conceptual:

src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── roles/
│   ├── modules/
│   ├── documents/
│   ├── ingestion/
│   ├── rag/
│   ├── conversations/
│   ├── unanswered/
│   ├── templates/
│   ├── analytics/
│   ├── audit/
│   └── health/
│
├── common/
│   ├── guards/
│   ├── decorators/
│   ├── filters/
│   ├── interceptors/
│   ├── pipes/
│   └── utils/
│
├── config/
└── main.ts
6. Capas internas
Controller

Responsable de:

recibir solicitudes;
validar estructura;
aplicar guards;
retornar respuesta HTTP.
Service

Contiene lógica de aplicación.

Repository/Data Access

Gestiona persistencia.

Integrations

Conecta:

Supabase;
OpenAI;
Mailpit (desarrollo) / Resend SMTP (remoto);
Storage;
servicios externos.
Workers

Procesan trabajos que no deben bloquear una petición HTTP.

7. Dominios principales
Auth

Registro, login, sesiones y recuperación.

Users

Perfiles, estados y administración.

Roles

RBAC y permisos.

Modules

Procesos temáticos.

Documents

Archivos y versiones.

Ingestion

Extracción y procesamiento.

RAG

Retrieval y generación.

Conversations

Historial de chat.

Unanswered

Consultas sin evidencia.

Templates

Generación de documentos.

Analytics

Métricas básicas.

Audit

Trazabilidad administrativa.

8. Arquitectura documental
UPLOAD
  ↓
VALIDACIÓN
  ↓
STORAGE PRIVADO
  ↓
DOCUMENT VERSION
  ↓
EXTRACCIÓN
  ↓
OCR SI ES NECESARIO
  ↓
NORMALIZACIÓN
  ↓
CHUNKING
  ↓
EMBEDDINGS
  ↓
POSTGRES + PGVECTOR
  ↓
INDEXADO

El proceso debe poder:

fallar de manera controlada;
reintentarse;
registrar estado;
registrar errores.
9. Arquitectura RAG
PREGUNTA
   ↓
VALIDACIÓN DE USUARIO
   ↓
MÓDULO / DETECCIÓN DE TEMA
   ↓
EMBEDDING
   ↓
RETRIEVAL
   ├── vectorial
   └── textual
   ↓
FILTROS
   ↓
RERANK / SCORE
   ↓
UMBRAL DE EVIDENCIA
   ↓
CONTEXTO
   ↓
LLM
   ↓
RESPUESTA
   ↓
FUENTES
   ↓
HISTORIAL
10. Persistencia

Motor:

PostgreSQL

Plataforma administrada:

Supabase

Vector Search:

pgvector

Ventaja:

El sistema mantiene datos relacionales y vectores dentro del mismo ecosistema.

El mapa de tablas, flujos, RLS, índices, hardening y operación se mantiene en
[`MAPA_BASE_DE_DATOS_Y_HARDENING.md`](MAPA_BASE_DE_DATOS_Y_HARDENING.md).

11. Storage

Los archivos deberán almacenarse en buckets privados.

No deberán exponerse mediante URLs públicas permanentes.

El acceso deberá realizarse mediante:

políticas;
backend;
signed URLs cuando sean necesarias.
12. Comunicación frontend-backend

La comunicación principal será:

REST API

Para respuestas generativas se podrá utilizar:

Server-Sent Events;
streaming HTTP;
otra alternativa compatible.

La opción se validará durante implementación.

13. Seguridad

La arquitectura debe incluir:

Supabase Auth;
RBAC;
RLS cuando corresponda;
Guards NestJS;
validación de inputs;
HTTPS;
variables de entorno;
CORS controlado;
rate limiting;
logs;
almacenamiento privado;
auditoría.
14. Ambientes
Development

Uso del equipo.

Staging

Validación cliente/equipo.

Production

Usuarios finales.

Las credenciales y bases de datos deberán mantenerse separadas.

15. Estrategia de evolución

No crear microservicios preventivamente.

Extraer un componente únicamente cuando exista evidencia como:

alta carga independiente;
necesidad de escalado separado;
procesamiento intensivo;
aislamiento crítico;
razón operativa real.
16. Registro de decisiones

Cualquier cambio relevante debe analizar:

beneficio;
costo;
riesgo;
impacto;
migración;
compatibilidad.

Y documentarse mediante ADR cuando corresponda.
