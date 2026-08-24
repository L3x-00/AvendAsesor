# Planificación, Hitos y Fases — AVEND ASESOR

## 1. Modelo de ejecución

Duración máxima planificada:

**75 días calendario / 2 meses y medio.**

El proyecto se divide en cinco hitos funcionales más la fase de inicio.

La planificación puede adelantarse internamente.

El hecho de que el equipo avance funciones futuras no modifica automáticamente:

- fecha oficial de entrega;
- validación;
- secuencia de hitos.

---

# HITO 0 — INICIO

## Objetivo

Preparar formal y técnicamente el proyecto.

## Entregables

- estructura del repositorio;
- arquitectura inicial;
- stack;
- tablero;
- accesos;
- plan de trabajo;
- ambientes preliminares.

## Trabajo técnico

- monorepo;
- frontend base;
- backend base;
- packages compartidos;
- docs;
- infrastructure;
- scripts;
- Git;
- GitHub.

---

# HITO 1 — BASE, AUTH Y ROLES

## Objetivo

Crear la primera versión funcional de acceso al sistema.

## Funciones

- registro;
- validación de correo;
- login;
- logout;
- recuperación;
- usuarios;
- roles;
- guards;
- permisos;
- layout administrativo;
- ambientes.

## Validación

- docente puede registrarse;
- correo puede verificarse;
- login funciona;
- recovery funciona;
- docente no entra al panel;
- admin/superadmin tienen acceso correspondiente.

---

# HITO 2 — PANEL Y DOCUMENTOS

## Objetivo

Entregar autonomía administrativa inicial.

## Funciones

### Módulos

- crear;
- editar;
- activar;
- desactivar;
- ordenar.

### Documentos

- subir;
- asociar;
- metadatos;
- reemplazar;
- activar;
- desactivar.

### Panel

- gestión inicial;
- permisos;
- estado.

---

# HITO 3 — RAG Y CHAT

## Objetivo

Implementar el núcleo de inteligencia documental.

## Funciones

- ingestión;
- OCR básico;
- chunking;
- embeddings;
- pgvector;
- retrieval;
- chat;
- fuentes;
- módulo opcional;
- detección de tema;
- ambigüedad;
- control sin evidencia.

---

# HITO 4 — HISTORIAL, SEGURIDAD Y CALIDAD

## Objetivo

Completar funcionalidades operativas y consolidar integración.

## Funciones

- historial;
- consultas no resueltas;
- auditoría;
- métricas;
- seguridad;
- responsive;
- ajustes de permisos;
- pruebas integrales.

---

# HITO 5 — PRODUCCIÓN Y TRANSFERENCIA

## Objetivo

Completar la versión contractual del sistema.

## Entregables

- producción;
- documentación;
- backups;
- manuales;
- transferencia;
- configuración final;
- correcciones;
- inventario de servicios;
- capacitación.

---

# Reglas de avance

Cada tarea relevante debe completar:

```text
UNDERSTAND
INSPECT
PLAN
IMPLEMENT
TEST
REVIEW
FIX
VERIFY
DOCUMENT
Uso de IA

Los agentes pueden:

implementar;
revisar;
probar;
documentar;
refactorizar;
investigar;
gestionar Git.

Toda implementación relevante deberá ser validada antes de marcarse como terminada.

## Trabajo visual y UI/UX

La prioridad visual se gobierna mediante la
[Hoja de ruta visual, interfaz y UI/UX](HOJA_DE_RUTA_VISUAL_UI_UX.md). El
frontend se trabaja exclusivamente mediante autorización explícita del Product
Owner y nunca sustituye controles funcionales o de seguridad del backend.

Criterio de finalización de una tarea

Una tarea estará terminada cuando:

requisito implementado;
integración realizada;
pruebas ejecutadas;
errores críticos corregidos;
revisión realizada;
memoria actualizada cuando corresponda;
documentación actualizada si afecta arquitectura;
pendientes registrados.
