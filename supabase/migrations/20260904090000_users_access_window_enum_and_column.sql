-- Fase 1 "Usuarios y accesos": preparar la gestión editable de vigencias.
--
-- Este archivo SOLO añade el valor de enum y la columna, aislados de las
-- funciones que los referencian (archivo siguiente). Se separan a propósito
-- porque un valor de enum recién añadido no puede usarse en DML dentro de la
-- misma transacción; mantener la definición de RPCs en una migración posterior
-- garantiza convergencia entre instalación nueva, staging y producción.
--
-- Reusa la línea base de vencimiento de ADR-0018 (`profiles.access_expires_at`
-- y su umbral fijo de 7 días). Aquí solo se agrega el "Inicio" informativo.

-- Nueva acción de auditoría para cambios de ventana de acceso (vigencia).
alter type public.operational_audit_action
  add value if not exists 'access_window_changed';

-- "Inicio" de la ventana de acceso. Informativo: la denegación de acceso se
-- rige por `account_status` y `access_expires_at` (ADR-0018), no por esta fecha.
-- NULL preserva el comportamiento actual de todos los perfiles existentes.
alter table public.profiles
  add column if not exists access_start_at timestamptz;

comment on column public.profiles.access_start_at is
  'Inicio informativo de la ventana de acceso; NULL = sin inicio definido. La denegación efectiva de acceso depende de account_status y access_expires_at.';
