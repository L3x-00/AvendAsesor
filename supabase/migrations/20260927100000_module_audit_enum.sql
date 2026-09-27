-- Hito 4 · Auditoría de módulos (1/2): nuevas acciones de auditoría.
--
-- Solo agrega los valores del enum. Van en un archivo propio porque un valor
-- de enum recién agregado no puede usarse en la misma transacción
-- (SQLSTATE 55P04); el trigger que los usa está en la migración siguiente.

alter type public.operational_audit_action add value if not exists 'module_created';
alter type public.operational_audit_action add value if not exists 'module_updated';
alter type public.operational_audit_action add value if not exists 'module_status_changed';
alter type public.operational_audit_action add value if not exists 'module_deleted';
