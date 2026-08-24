# Objetivos del Proyecto — AVEND ASESOR

## 1. Objetivo general

Diseñar, desarrollar y desplegar una plataforma web SaaS que permita a docentes consultar información educativa y administrativa mediante Inteligencia Artificial, utilizando como fuente principal la documentación incorporada a AVEND ASESOR.

La plataforma deberá ofrecer respuestas comprensibles, contextualizadas y vinculadas a fuentes verificables.

---

## 2. Objetivos funcionales

### 2.1 Gestión de usuarios

Permitir que los usuarios puedan:

- registrarse;
- verificar su correo electrónico;
- iniciar sesión;
- cerrar sesión;
- recuperar su contraseña;
- mantener una cuenta identificable dentro del sistema.

---

### 2.2 Control de acceso

Implementar una separación clara entre:

- Superadministrador;
- Administrador;
- Usuario Docente.

Las funcionalidades deberán estar protegidas según rol y permisos.

---

### 2.3 Consulta mediante lenguaje natural

Permitir que el usuario escriba preguntas utilizando lenguaje natural desde un chat central.

La experiencia debe ser sencilla y evitar navegación innecesaria entre múltiples pantallas.

---

### 2.4 Respuestas basadas en documentación

Las respuestas deberán construirse principalmente a partir de documentación activa e indexada dentro de la plataforma.

El sistema no deberá presentar como segura una respuesta sin respaldo suficiente.

---

### 2.5 Fuentes verificables

Cada respuesta deberá mostrar, cuando esté disponible:

- documento;
- módulo;
- versión;
- página;
- sección;
- artículo;
- numeral;
- fecha;
- otra referencia útil.

---

### 2.6 Gestión de módulos

Permitir que el sistema organice documentación según módulos o procesos.

El superadministrador deberá poder crear nuevos módulos sin depender del equipo de desarrollo.

---

### 2.7 Gestión documental

Permitir administrar archivos relacionados con los procesos del sistema.

La solución deberá soportar:

- carga;
- asociación;
- activación;
- desactivación;
- reemplazo;
- versionado;
- reprocesamiento;
- seguimiento del estado de indexación.

---

### 2.8 Identificación automática del tema

Cuando el usuario no seleccione un módulo, el sistema deberá intentar identificar el tema relacionado con su consulta.

Cuando exista ambigüedad suficiente, deberá solicitar una aclaración antes de responder.

---

### 2.9 Control de alucinaciones

Reducir la probabilidad de respuestas sin sustento mediante:

- recuperación documental;
- filtros;
- umbrales;
- prompts controlados;
- citación;
- validación de contexto.

Cuando no exista información suficiente:

> El sistema deberá comunicarlo claramente.

---

### 2.10 Registro de consultas no resueltas

Las preguntas que no puedan responderse adecuadamente deberán almacenarse para análisis posterior.

Esto permitirá detectar:

- documentación faltante;
- módulos incompletos;
- nuevos procesos;
- oportunidades de mejora.

---

### 2.11 Historial

Permitir que el usuario pueda:

- consultar conversaciones recientes;
- abrir conversaciones;
- continuar conversaciones;
- eliminar conversaciones propias.

---

### 2.12 Generación documental

Incluir inicialmente una plantilla de documento.

El usuario podrá:

- seleccionar la plantilla;
- completar información;
- generar contenido;
- revisar el resultado;
- exportarlo a Word y PDF.

---

## 3. Objetivos técnicos

La solución deberá:

- ser modular;
- ser segura;
- ser mantenible;
- utilizar TypeScript donde corresponda;
- mantener frontend y backend claramente organizados;
- disponer de ambientes separados;
- permitir evolución progresiva;
- utilizar infraestructura administrada cuando sea conveniente;
- minimizar costos innecesarios;
- soportar observabilidad;
- mantener trazabilidad;
- disponer de documentación suficiente para continuidad técnica.

---

## 4. Objetivos de arquitectura

La arquitectura deberá permitir que el sistema evolucione sin necesidad de reconstruirlo completamente.

Debe soportar progresivamente:

- mayor cantidad de usuarios;
- más módulos;
- mayor volumen documental;
- más consultas;
- nuevas herramientas de IA;
- nuevos proveedores de infraestructura;
- nuevos procesos internos.

---

## 5. Objetivos de experiencia de usuario

La interfaz deberá ser:

- clara;
- moderna;
- responsive;
- sencilla;
- centrada en la conversación;
- consistente;
- comprensible para usuarios no técnicos.

---

## 6. Objetivo del uso de IA en desarrollo

Los asistentes de IA se utilizarán para aumentar:

- productividad;
- capacidad de análisis;
- cobertura de pruebas;
- velocidad de implementación;
- revisión;
- investigación;
- documentación.

No deben utilizarse para sustituir:

- revisión técnica;
- responsabilidad del equipo;
- validación;
- pruebas;
- decisiones de arquitectura.