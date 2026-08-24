# Alcance Funcional — AVEND ASESOR

## 1. Autenticación

Incluido:

- registro;
- validación de correo;
- inicio de sesión;
- cierre de sesión;
- recuperación de contraseña;
- gestión básica de cuenta;
- control de sesión.

---

## 2. Roles

Roles iniciales:

### SUPERADMIN

Control general de la plataforma.

### ADMIN

Acceso administrativo según permisos.

### DOCENTE

Acceso funcional destinado al usuario final.

---

## 3. Panel administrativo

El panel debe permitir progresivamente:

### Dashboard

Mostrar indicadores como:

- usuarios;
- usuarios activos;
- consultas;
- consultas no resueltas;
- módulos;
- documentos;
- consumo estimado de IA;
- alertas básicas.

### Usuarios

Permitir:

- visualizar;
- buscar;
- editar;
- activar;
- suspender;
- asignar roles;
- consultar estado;
- consultar último acceso.

### Roles y permisos

Aplicar permisos diferenciados.

El administrador no tendrá automáticamente las mismas capacidades que el superadministrador.

### Módulos

Permitir:

- crear;
- editar;
- ordenar;
- activar;
- desactivar;
- eliminar lógicamente;
- asociar documentación.

### Documentos

Permitir:

- cargar;
- visualizar;
- reemplazar;
- descargar;
- ordenar;
- versionar;
- activar;
- desactivar;
- reprocesar;
- eliminar lógicamente.

### Procesamiento

Mostrar estados como:

- pendiente;
- procesando;
- indexado;
- observado;
- fallido.

### Consultas no resueltas

Permitir:

- revisar;
- clasificar;
- marcar como revisada;
- relacionar posteriormente nueva documentación.

### Trazabilidad

Registrar acciones administrativas relevantes.

---

## 4. Chat general

El chat deberá permitir:

- escribir preguntas;
- recibir respuestas;
- visualizar fuentes;
- continuar contexto;
- utilizar un módulo opcional;
- recibir solicitudes de aclaración.

---

## 5. Selector de módulo

El usuario podrá elegir un módulo.

Cuando exista un módulo seleccionado:

- se priorizará su documentación;
- se aplicarán filtros al retrieval;
- se reducirá el espacio de búsqueda.

---

## 6. Identificación automática

Cuando no exista módulo seleccionado:

1. analizar consulta;
2. identificar posible proceso;
3. evaluar nivel de confianza;
4. continuar si existe suficiente certeza;
5. solicitar aclaración si existe ambigüedad.

---

## 7. RAG

La solución deberá incluir:

- ingestión;
- extracción;
- OCR cuando corresponda;
- normalización;
- fragmentación;
- embeddings;
- almacenamiento vectorial;
- búsqueda;
- filtros;
- recuperación;
- generación;
- citación.

---

## 8. Fuentes

Las respuestas deberán incluir referencias disponibles.

Ejemplos:

- documento;
- módulo;
- fecha;
- versión;
- página;
- sección;
- artículo;
- numeral.

---

## 9. Respuesta sin sustento

Cuando la recuperación no encuentre evidencia suficiente:

- no generar una respuesta presentada como segura;
- comunicar ausencia de información suficiente;
- registrar consulta;
- almacenar contexto útil para revisión.

---

## 10. Historial

Incluido:

- lista de conversaciones;
- apertura;
- continuidad;
- eliminación propia;
- almacenamiento de mensajes;
- relación con módulo cuando corresponda.

---

## 11. Generación documental

El alcance inicial contempla una plantilla.

Incluye:

- formulario;
- generación;
- previsualización;
- edición cuando corresponda;
- exportación DOCX;
- exportación PDF.

La definición exacta de la primera plantilla será coordinada con el cliente.

---

## 12. Formatos documentales

Soporte inicial previsto:

- PDF;
- DOCX;
- TXT;
- imágenes legibles.

OCR básico cuando corresponda.

Casos complejos pueden requerir evaluación adicional:

- manuscritos;
- PDFs protegidos;
- documentos dañados;
- tablas complejas;
- hojas de cálculo complejas;
- páginas web dinámicas;
- diagramas;
- archivos audiovisuales.

---

## 13. Responsive

La aplicación deberá funcionar correctamente en:

- escritorio;
- tableta;
- teléfono.

---

## 14. Infraestructura

El proyecto contempla:

- desarrollo;
- staging;
- producción;
- CI/CD;
- almacenamiento privado;
- base de datos;
- correo transaccional;
- backend;
- frontend;
- observabilidad básica.

---

## 15. Servicios externos

Los servicios pueden incluir:

- Supabase;
- Render;
- Vercel;
- Mailpit para desarrollo y Resend SMTP para ambientes remotos autorizados;
- OpenAI;
- GitHub;
- Sentry;
- Cloudflare cuando sea necesario.

La arquitectura deberá evitar acoplamiento innecesario.

---

## 16. Fuera del alcance actual

No asumir automáticamente como incluidos:

- aplicaciones móviles nativas;
- integración WhatsApp;
- integración con sistemas externos no definidos;
- pagos;
- marketplace;
- multiidioma;
- firma digital;
- OCR avanzado;
- reconocimiento manuscrito;
- BI avanzado;
- modelos de IA entrenados específicamente;
- fine-tuning;
- sistemas de videollamada;
- integraciones institucionales no definidas.

Cualquier funcionalidad no establecida debe ser clasificada antes de desarrollarse.
