# Datos demo

El comando predeterminado de seed de AVEND ASESOR está diseñado exclusivamente para la instancia local de Supabase. Obtiene sus credenciales mediante `supabase status`, valida el contenedor Docker del proyecto actual y rechaza cualquier URL que no sea `localhost` o `127.0.0.1`; no toma credenciales de los archivos `.env.local` de las aplicaciones. No se conecta a Supabase remoto ni puede seleccionar producción por accidente.

## Uso

Con el stack local levantado:

```powershell
npm run demo:seed
```

El proceso puede ejecutarse nuevamente sin duplicar identidades, módulos, documentos, versiones, conversaciones ni casos para la misma revisión del seed. Usa identificadores estables y sólo actualiza módulos, documentos e identidades que ya llevan el marcador de demo. Si un código de submódulo o un correo existente pertenece a contenido no demostrativo incompatible, el proceso se detiene en vez de modificarlo. Las filas de demostración llevan `metadata.demoSeed = "avend-demo-2026"` y las identidades usan el dominio `@demo.avend.local`. No cambie `DEMO_CONSULTATION_REVISION` para resembrar una misma base: esa revisión identifica registros históricos inmutables.

Para validar la consistencia sin sembrar ni alterar contenido durable:

```powershell
npm run demo:verify
```

La verificación consulta datos, prueba las reglas de acceso dentro de una transacción revertida y comprueba el aislamiento de los documentos demo frente al RAG. La comprobación real de inicio de sesión de la docente activa se ejecuta durante `demo:seed`, no durante `demo:verify`, para conservar esta última como validación de lectura.

El seed distribuye las consultas, incidencias, reportes, sugerencias y adjuntos entre hoy, los días previos de la semana y semanas/meses anteriores. Nunca crea fechas futuras. Si se ejecuta el primer día del calendario semanal, la métrica de **Hoy** y **Esta semana** coincide por definición del rango; el script acepta únicamente esa excepción.

Las credenciales locales de los perfiles demo usan la contraseña `AvendDemo2026!`. La superadministradora es `rosa.valdivia@demo.avend.local`.

## Carga demostrativa en producción protegida

Existe un ejecutor independiente únicamente para el proyecto de producción autorizado. No reutiliza el comando local, exige la referencia exacta del proyecto, confirmación explícita y un respaldo lógico reciente con manifiesto verificable. Nunca use este flujo para una base de un cliente sin autorización expresa de su responsable.

Primero genere un respaldo privado:

```powershell
npm run demo:backup:production -- --project-ref blxrdotroysitfyehmqw --confirm-production-backup
```

El comando muestra la ruta de un manifiesto local. Sin exponer claves ni contraseñas, úsela para ejecutar la carga:

```powershell
npm run demo:seed:production -- --project-ref blxrdotroysitfyehmqw --confirm-production-demo-seed --backup-manifest "<ruta-absoluta-al-manifiesto>"
```

Compruebe el resultado sin alterar datos:

```powershell
npm run demo:verify:production -- --project-ref blxrdotroysitfyehmqw
```

El ejecutor productivo sólo crea o actualiza identidades, módulos, documentos, archivos, conversaciones y casos que ya llevan el marcador `demoSeed = "avend-demo-2026"`. Usa módulos con códigos `DEMO_` para no reactivar ni modificar jerarquías preexistentes, genera contraseñas aleatorias que no se imprimen y conserva los datos sin marcador intactos. Sus PDFs y adjuntos se guardan bajo rutas `demo/` y son contenido ficticio no normativo.

Antes de una carga productiva deben estar aplicadas las migraciones `20260908151631_excluir_documentos_demo_del_rag.sql` y `20260908204204_preservar_marcador_demo_rag.sql`. Los documentos con el marcador demo permanecen visibles para la demostración administrativa, pero no pueden recuperarse como evidencia por el chat de docentes, ni siquiera en búsquedas históricas o archivadas. El segundo cambio conserva el marcador cuando se edita la metadata completa y también bloquea una cita directa que intente saltarse el buscador.

## Restablecimiento de un entorno descartable

`supabase db reset --local` elimina todos los datos de la instancia local. Úsalo solamente cuando sea un entorno de desarrollo descartable y no haya trabajo de otra persona que preservar. Después del reset, ejecuta de nuevo `npm run demo:seed`. Nunca ejecute `db reset` contra producción: para ese entorno se conserva el respaldo lógico previo y cualquier reversión requiere un plan de recuperación aprobado.

El script no incluye un borrado selectivo: las versiones documentales son inmutables por diseño y el restablecimiento seguro de una demo completa debe realizarse con un reset de la base local desechable.

## Alcance de los datos

El seed crea:

- 56 docentes peruanos ficticios: 40 con acceso activo (8 próximos a vencer dentro de 7 días), 8 vencidos y 8 suspendidos; además de una superadministradora, tres administradores y dos gestores representados como administradores con etiquetas de función.
- Los siete módulos principales, todos los submódulos requeridos de Evaluación docente y submódulos complementarios de las demás áreas.
- 96 documentos: 70 vigentes, 16 reemplazados y 10 archivados; 75 listos e indexados, 15 pendientes y 6 con fallo técnico. Incluye los 17 tipos documentales, las 13 entidades, referencias de reemplazo, motivos de archivo, asociaciones múltiples y un historial inicial de al menos 115 versiones.
- 44 consultas de docentes y 54 casos trazables: 44 alertas automáticas, 5 reportes y 5 sugerencias con 10 adjuntos privados. Las cuatro etapas de caso, los seis tipos de incidencia y los rankings por módulo tienen distribución deliberadamente desigual.

Los documentos con fallo técnico almacenan un archivo deliberadamente ilegible y quedan con versión fallida; los PDF de los demás registros son archivos de demostración válidos. Los vectores de los fragmentos son sintéticos, deterministas y no nulos: sirven para verificar almacenamiento, asociaciones y estados técnicos, pero los documentos marcados como demo se excluyen intencionalmente de toda recuperación RAG. No sustituyen una evaluación semántica con embeddings de un proveedor real.

El modelo actual de permisos sólo dispone de acceso global a Módulos/Documentos para administradores. Las etiquetas de “administrador de módulos”, “administradora documental” y gestores hacen visible el escenario demo, pero no simulan permisos por módulo que el modelo aún no define.

Los fragmentos indexados y todos los archivos son contenido ficticio para mostrar biblioteca y métricas de demostración. No constituyen corpus normativo real ni pueden usarse como fuentes o para validar respuestas jurídicas o educativas.
