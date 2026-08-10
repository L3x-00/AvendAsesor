# Mailpit para desarrollo local

Mailpit recibe los correos de Supabase Auth en desarrollo y los muestra solo en una bandeja local. No entrega mensajes a Internet, no usa credenciales reales y no debe incorporarse a staging ni producción.

## Inicio local

Con Docker Desktop en ejecución, desde la raíz del repositorio:

```powershell
docker compose -f infrastructure/mailpit/compose.yaml up -d
supabase start
```

- Bandeja local: `http://127.0.0.1:8025`
- SMTP local: `127.0.0.1:1025`
- La configuración `supabase/config.toml` conecta GoTrue a Mailpit mediante `host.docker.internal`, que corresponde a Docker Desktop en Windows.
- Mailpit acepta las credenciales de prueba `mailpit` / `mailpit` sin TLS solamente dentro de este contenedor ligado a loopback. No son secretos y no existen fuera del entorno local.

La configuración de Auth exige confirmación de correo, limita el reenvío de correo a un minuto y permite 20 mensajes por hora durante la prueba local. Solo se deben usar cuentas y datos de prueba.

## Comprobación prevista

1. Iniciar Mailpit y Supabase local.
2. Registrar una cuenta de prueba desde el web local.
3. Abrir el enlace de confirmación recibido en Mailpit y comprobar inicio de sesión.
4. Solicitar recuperación, abrir el nuevo enlace y comprobar el cambio de contraseña.
5. Al terminar, detener la bandeja con `docker compose -f infrastructure/mailpit/compose.yaml down`.

No se debe usar `--remove-orphans` ni conectar Mailpit a una red pública para estas pruebas.
