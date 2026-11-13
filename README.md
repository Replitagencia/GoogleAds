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

Las conexiones de Google se configuran por cliente y sus credenciales permanecen cifradas en el servidor. El URI `https://ads.registroevento.cl/api/google/callback` debe estar registrado en Google Cloud. Configurar el cliente OAuth mediante secretos; no copiar archivos JSON a GitHub.

La prueba de Google sigue siendo independiente de la autenticación SaaS. Si el consentimiento OAuth continúa en modo de prueba, revisar sus límites antes de incorporar más cuentas reales. El alcance concedido por Google es amplio; esta aplicación solo implementa consultas de campañas.

## Seguimiento de la agencia

El portal ofrece un reporte en PDF, generado en el navegador con los últimos siete días completos de la cuenta y los siete días anteriores. La fecha de consulta, la moneda y la zona horaria proceden del informe de Google Ads. Las búsquedas reflejan solo los términos identificados y disponibles, y una ausencia en la muestra anterior no se interpreta como cero. No se generan conclusiones causales ni gestiones ficticias. La descarga CSV continúa disponible por separado.

Para Eticsa, el portal del cliente y el PDF consolidan exclusivamente las campañas «Campaña de Busqueda» (23169711798) y «Pmax Eticsa» (23461440880), para ambos períodos. La sección de presupuesto mensual está identificada como un dato de toda la cuenta. La administración de la agencia sigue mostrando la cuenta completa. Si la cuenta conectada cambia o alguna de las campañas no se puede verificar, el reporte muestra un error en lugar de sustituirlas por otras.

El checklist admite etapa, estado, responsable, fecha comprometida y una referencia textual a la evidencia. «Esperando al cliente» identifica dependencias externas. Las gestiones internas solo son visibles para la agencia; las actividades compartidas se identifican por separado en el historial, que muestra hasta 100 registros recientes por cliente.

El panel utiliza resultados guardados de Google Ads. «Actualizar resultados» consulta la cuenta y renueva esos datos; no hay actualización programada ni envío automático de alertas. Las alertas de campañas pausadas o no aptas, consumo de al menos el 80 % del presupuesto mensual registrado y variación de conversiones de al menos el 20 % se calculan solo con datos recientes. Los períodos excluyen el día parcial actual. Sin un presupuesto registrado no se genera alerta de presupuesto; si la consulta de estados falla se indica que no están disponibles.

## Configuración de seguridad

- `SITE_URL` es el origen exacto de producción, sin barra final; todas las escrituras propias verifican Origin.
- `CLIENT_SITE_URL` es el origen del portal de clientes. Las invitaciones y recuperaciones usan el dominio correspondiente. Para pruebas locales de un solo portal, dejarlo sin configurar. Google OAuth permanece en `SITE_URL`.
- El proxy debe **reemplazar** `X-Real-IP`. La aplicación y PostgreSQL no se exponen directamente a Internet.
- `BETTER_AUTH_SECRET` y `TOKEN_ENCRYPTION_KEY` son distintos. Conservar la clave de cifrado de Google; cambiarla sin migración hace ilegibles los tokens almacenados.
- Todas las cookies de producción se emiten con HTTPS; la librería gestiona las sesiones y la limitación de intentos en PostgreSQL.
- Configurar copias de seguridad y verificar una restauración antes de entregar accesos de producción.
- La base local contiene datos ficticios. No migrar esos usuarios, tokens ni reportes a producción.
