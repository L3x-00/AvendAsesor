# Contexto General del Proyecto — AVEND ASESOR

> Documento de contexto estable del proyecto.
>
> Este archivo debe ser utilizado por desarrolladores humanos y asistentes de IA para comprender qué es AVEND ASESOR, qué problema resuelve y cuáles son las reglas generales que condicionan su desarrollo.

---

## 1. Identificación del producto

**Nombre del producto:** AVEND ASESOR

**Naturaleza:** Plataforma web SaaS de orientación documental asistida por Inteligencia Artificial.

**Cliente / Titular:** AVEND.

**Proveedor técnico:** TEAM LESS DEV.

**Liderazgo técnico:** Alexander Huanaco Quispe.

**Público objetivo inicial:** Docentes.

**Idioma inicial:** Español.

**Tipo de plataforma inicial:** Aplicación web responsive.

---

## 2. Visión general

AVEND ASESOR será una plataforma SaaS orientada inicialmente a docentes que necesitan consultar información relacionada con procesos educativos, administrativos, normativos y documentales.

El problema principal que busca resolver es la dispersión de información.

Actualmente, una persona puede necesitar consultar diferentes documentos, normas, procedimientos, resoluciones, directivas o archivos para encontrar una respuesta determinada.

AVEND ASESOR centralizará esta documentación y permitirá consultarla utilizando lenguaje natural.

El sistema utilizará Inteligencia Artificial acompañada de una arquitectura RAG —Retrieval-Augmented Generation— para localizar información relevante dentro de la documentación disponible y construir respuestas sustentadas en fuentes verificables.

---

## 3. Principio fundamental del producto

La Inteligencia Artificial no debe actuar como una fuente autónoma de conocimiento.

La fuente principal de verdad del sistema será:

1. La documentación cargada y activa.
2. Los módulos o procesos configurados.
3. Los permisos del usuario.
4. Los metadatos asociados a cada documento.
5. Las reglas establecidas para el sistema RAG.

El modelo de IA deberá utilizar el contexto documental recuperado para redactar sus respuestas.

Cuando no exista evidencia suficiente, el sistema deberá indicarlo claramente en lugar de inventar información.

---

## 4. Objetivo de negocio

El producto busca facilitar el acceso a información administrativa y educativa mediante una experiencia sencilla de conversación.

El usuario no debería necesitar:

- conocer exactamente qué documento revisar;
- buscar manualmente entre numerosos archivos;
- conocer previamente el nombre de una norma;
- navegar constantemente entre diferentes secciones.

La plataforma deberá ayudar a localizar y presentar la información relevante de forma comprensible.

---

## 5. Usuarios del sistema

El sistema contempla inicialmente tres tipos principales de usuario.

### 5.1 Superadministrador

Tiene control general sobre la plataforma.

Puede administrar:

- usuarios;
- roles;
- permisos;
- módulos;
- procesos;
- documentación;
- configuración general permitida;
- consultas no resueltas;
- métricas;
- trazabilidad;
- parámetros funcionales disponibles desde el panel.

---

### 5.2 Administrador

Tiene acceso administrativo limitado según los permisos asignados.

No debe acceder automáticamente a todas las funciones del superadministrador.

Los permisos del administrador deberán estar controlados mediante RBAC y, cuando corresponda, políticas de seguridad adicionales.

---

### 5.3 Usuario Docente

Es el usuario final principal.

Podrá:

- registrarse;
- validar su correo;
- iniciar sesión;
- recuperar su contraseña;
- realizar consultas;
- seleccionar módulos;
- revisar fuentes;
- consultar conversaciones;
- generar el documento incluido en el alcance;
- administrar aspectos básicos de su cuenta.

---

## 6. Características centrales del sistema completo

AVEND ASESOR contempla:

- autenticación de usuarios;
- gestión de roles y permisos;
- panel de superadministración;
- módulos o procesos administrables;
- gestión documental;
- versionado documental;
- procesamiento e indexación;
- sistema RAG;
- chat general;
- identificación automática del tema;
- manejo de preguntas ambiguas;
- citación de fuentes;
- control de respuestas sin sustento;
- historial de conversaciones;
- registro de consultas no resueltas;
- métricas administrativas;
- trazabilidad;
- generación básica de documentos;
- infraestructura separada por ambientes;
- documentación técnica;
- respaldo y continuidad.

---

## 7. Principios de desarrollo

El desarrollo debe seguir los siguientes principios:

### Seguridad por diseño

La seguridad debe incorporarse desde el inicio.

No deberá añadirse únicamente como una capa posterior.

### Modularidad

Las funcionalidades deberán organizarse en módulos claramente delimitados.

### Escalabilidad progresiva

El sistema debe funcionar inicialmente con costos controlados, pero permitir crecimiento sin requerir una reescritura completa.

### Mantenibilidad

El código deberá ser comprensible, tipado, documentado cuando sea necesario y organizado por responsabilidades.

### Observabilidad

Los errores relevantes deberán poder rastrearse mediante logs y herramientas de monitoreo.

### Trazabilidad

Los cambios administrativos importantes deberán poder identificarse posteriormente.

### Separación de ambientes

Desarrollo, staging y producción deberán mantenerse separados.

### Revisión humana

El uso de asistentes de IA durante el desarrollo no elimina la responsabilidad técnica del equipo.

---

## 8. Uso de Inteligencia Artificial durante el desarrollo

El proyecto será desarrollado con apoyo intensivo de asistentes de programación y agentes de IA.

Entre las herramientas disponibles pueden encontrarse:

- Codex;
- Claude Code;
- Kimi Code;
- Gemini;
- agentes especializados;
- subagentes;
- MCP;
- herramientas CLI;
- herramientas de análisis y testing.

Estos agentes pueden ayudar en:

- arquitectura;
- planificación;
- programación;
- debugging;
- pruebas;
- refactorización;
- seguridad;
- DevOps;
- infraestructura;
- revisión;
- documentación.

Sin embargo:

- el código generado debe ser revisado;
- las decisiones técnicas relevantes deben justificarse;
- las implementaciones deben verificarse;
- las acciones destructivas requieren autorización humana;
- no debe asumirse que una implementación es correcta solo porque compila.

---

## 9. Modelo operativo del equipo asistido por IA

El modelo general de trabajo es:

Product Owner / Humano
        ↓
Orquestador
        ↓
Especialistas
        ↓
Auditor
        ↓
Verificación
        ↓
Integración

Los roles pueden ser dinámicos.

Un mismo agente puede actuar como:

- arquitecto;
- backend developer;
- frontend developer;
- reviewer;
- auditor;
- DevOps engineer;
- security engineer;
- tester;
- integrador.

El rol no debe confundirse con los permisos.

---

## 10. Fuente de verdad para agentes

Antes de implementar una funcionalidad, cualquier agente deberá revisar cuando corresponda:

- `AGENTS.md`
- `.ai-shared/context/`
- `.ai-shared/memory/`
- `.ai-shared/coordination/`
- `requirements/`
- `architecture/`
- `project_management/`
- ADR relevantes
- estado actual de Git
- código existente

La documentación estable debe tener prioridad sobre suposiciones.

---

## 11. Regla sobre requerimientos

Un agente nunca debe inventar un requerimiento.

Debe distinguir explícitamente entre:

**CONFIRMADO**
Requisito existente y aprobado.

**RECOMENDACIÓN TÉCNICA**
Decisión propuesta para mejorar la implementación.

**SUPOSICIÓN**
Información inferida temporalmente y que puede requerir validación.

**FUERA DE ALCANCE**
Funcionalidad no incluida actualmente.

---

## 12. Estado general

AVEND ASESOR se encuentra en fase inicial de desarrollo.

La negociación comercial y contractual ya fue cerrada.

La prioridad actual es:

- arquitectura;
- preparación técnica;
- estructura base;
- Hito 0;
- Hito 1;
- posterior evolución por hitos.

El proyecto ya dispone de una estructura inicial de monorepositorio con frontend, backend, documentación, infraestructura y paquetes compartidos.