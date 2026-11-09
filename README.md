# AgenciaLabs · SaaS de Google Ads

Portal independiente de ChatGPT, con Next.js 16, Better Auth y PostgreSQL. La agencia administra en `ads.registroevento.cl`; los clientes ingresan en `cliente.registroevento.cl` y consultan únicamente sus empresas asignadas. Cada dominio admite su rol, usa cookies limitadas a su host y valida el origen de las operaciones. El administrador crea espacios de clientes, conecta Google Ads e invita a usuarios.

## Funciones

- Ingreso con correo y contraseña, sesiones revocables y recuperación por correo SMTP.
- Registro público deshabilitado. Invitaciones de un solo uso, almacenadas como hash, con vencimiento de 48 horas; el cliente define su contraseña.
- Administrador inicial creado mediante una invitación privada desde la consola del servidor. No existe un usuario o contraseña predeterminados.
- Panel de clientes, invitaciones, suspensión/reactivación de empresas y usuarios.
- Alta de empresa y primer acceso en una operación. Para empresas existentes, crear accesos adicionales desde su tarjeta. Las activaciones pendientes se distinguen de las cuentas activas; cada persona elige su contraseña mediante el enlace privado de 48 horas.
- Permisos verificados en el servidor en cada API y página. El rol administrativo se guarda aparte de los campos editables de Better Auth. Los encabezados de ChatGPT no otorgan acceso.
- Conexiones OAuth de Google por cliente, con estado de un solo uso vinculado al administrador y al cliente. Tokens cifrados con AES-GCM.
- Dashboard, comparaciones, campañas, conversiones, dispositivos, ubicaciones, palabras clave, búsquedas, anuncios y CSV.
- Solicitudes en prueba: cada cliente crea solicitudes y conversa con la agencia dentro del portal. La agencia puede asignar un responsable y cambiar el estado; aún no se envían avisos ni se conectan correos o WhatsApp.
- Presupuesto y gestiones editables solo por la agencia. Los clientes tienen acceso de lectura.
- Los clientes sin cuenta conectada ven un estado pendiente, nunca métricas inventadas.
- No incluye facturación automática ni suscripciones de pago.

## Desarrollo

Requisitos: Node.js 22 y PostgreSQL 16.

```sh
npm ci
cp .env.example .env.local
# Configurar DATABASE_URL, SITE_URL=http://127.0.0.1:3400 y claves aleatorias.
node --env-file=.env.local --import tsx scripts/migrate.ts
node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts tu-correo@ejemplo.cl /ruta/privada/invitacion.txt
npm run dev -- --port 3400
```

Abrir personalmente el enlace privado para definir la contraseña del administrador. No subir ese archivo al repositorio. Al crear una invitación desde el panel, compartir el enlace con el destinatario; la aplicación informa expresamente que no se envió correo. La recuperación sí requiere configurar SMTP y un remitente autorizado.

```sh
npm run typecheck
npm run build
node --import tsx --test tests/reporting.test.mjs
```

La prueba integral **vacía la base de prueba** y solo admite una URL local y una base cuyo nombre contiene `agencialabs_test`. Requiere la aplicación en `http://127.0.0.1:3400`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1026` y `MAIL_FROM=qa@example.test`. El servidor SMTP local de la prueba captura el correo, sin enviarlo a Internet.

```sh
node --env-file=.env.local --import tsx --test tests/access.integration.test.ts tests/reporting.test.mjs
```

## Publicación y transición

Ver [deploy/README.md](deploy/README.md). Esta rama sustituye el alojamiento de Sites por un servidor Node.js. No debe publicarse con el proyecto antiguo de Sites; su manifiesto y autenticación se retiraron de esta rama.

La conexión de Eticsa que existe en la publicación anterior no se ha copiado: está cifrada en otra base de datos. En el servidor nuevo se debe volver a autorizar Google como administrador y validar su ID de cliente de Google Ads. El URI `https://ads.registroevento.cl/api/google/callback` ya está registrado en Google Cloud. Configurar el mismo cliente OAuth en el nuevo servidor mediante secretos; no copiar archivos JSON a GitHub.

La prueba de Google sigue siendo independiente de la autenticación SaaS. Si el consentimiento OAuth continúa en modo de prueba, revisar sus límites antes de incorporar más cuentas reales. El alcance concedido por Google es amplio; esta aplicación solo implementa consultas de campañas.

## Configuración de seguridad

- `SITE_URL` es el origen exacto de producción, sin barra final; todas las escrituras propias verifican Origin.
- `CLIENT_SITE_URL` es el origen del portal de clientes. Las invitaciones y recuperaciones usan el dominio correspondiente. Para pruebas locales de un solo portal, dejarlo sin configurar. Google OAuth permanece en `SITE_URL`.
- El proxy debe **reemplazar** `X-Real-IP`. La aplicación y PostgreSQL no se exponen directamente a Internet.
- `BETTER_AUTH_SECRET` y `TOKEN_ENCRYPTION_KEY` son distintos. Conservar la clave de cifrado de Google; cambiarla sin migración hace ilegibles los tokens almacenados.
- Todas las cookies de producción se emiten con HTTPS; la librería gestiona las sesiones y la limitación de intentos en PostgreSQL.
- Configurar copias de seguridad y verificar una restauración antes de entregar accesos de producción.
- La base local contiene datos ficticios. No migrar esos usuarios, tokens ni reportes a producción.
