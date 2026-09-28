-- Nueva acción de auditoría para el restablecimiento de contraseña enviado
-- desde el panel. El valor de enum va aislado de las funciones que lo usan:
-- un valor recién añadido no puede utilizarse dentro de la misma transacción.
alter type public.operational_audit_action
  add value if not exists 'user_password_reset';
