# Publicación en nexo-registroevento

Destino autorizado: servidor `nexo-registroevento`. DigitalOcean mostró 38,6 % de uso de memoria y 0,271 % de CPU en la revisión inicial. La comprobación de disco, procesos, puertos, proxy y memoria disponible por SSH sigue pendiente. Los archivos de despliegue están preparados, **no se han aplicado al servidor**.

## Antes de instalar

Revisar memoria libre, carga, disco, contenedores, puertos, proxy y copias de Nexo. El servidor tiene 1 GB contratado según DigitalOcean; no asumir que tiene capacidad libre. El compose propone límites de 320 MB para la app y 192 MB para PostgreSQL. Ajustarlos a mediciones, sin quitar memoria a Nexo. Compilar fuera del servidor para evitar un pico de uso.

No cambiar servicios, redes, volúmenes ni virtual hosts de Nexo. Usar `/opt/agencialabs`, proyecto Compose `agencialabs`, base y volumen propios, y puerto local 3400 si está libre.

## Preparación

Construir las imágenes para la arquitectura del servidor (x86_64):

```sh
docker build --platform linux/amd64 --target runtime -t agencialabs:VERSION .
docker build --platform linux/amd64 --target tools -t agencialabs-tools:VERSION .
```

Transferir las imágenes por el mecanismo de despliegue acordado, junto con `deploy/compose.yml`. Preparar `/opt/agencialabs/.env.production` con permisos 600 y `/opt/agencialabs/private` con 700. Configurar variables de `.env.example`, sin claves de prueba. Elegir `POSTGRES_PASSWORD` aleatoria hexadecimal para usarla sin escapes en la URL.

```sh
cd /opt/agencialabs
export AGENCIALABS_IMAGE=agencialabs:VERSION
export AGENCIALABS_TOOLS_IMAGE=agencialabs-tools:VERSION
docker compose --env-file .env.production -f deploy/compose.yml up -d db
docker compose --env-file .env.production -f deploy/compose.yml run --rm migrate
docker compose --env-file .env.production -f deploy/compose.yml run --rm migrate npm run admin:invite -- CORREO_ADMIN /app/private/administrador.txt
docker compose --env-file .env.production -f deploy/compose.yml up -d app
curl -f http://127.0.0.1:3400/api/health
```

El destinatario del enlace inicial debe ser confirmado antes de emitirlo. El enlace permite crear el primer administrador una sola vez y vence en 48 horas. El administrador define personalmente su contraseña.

## Proxy, HTTPS y dominio

Integrar `ads.registroevento.cl` como virtual host **adicional** en el proxy que ya use Nexo. Las configuraciones de Nginx y Caddy incluidas son alternativas de referencia, no instrucciones para instalar ambos. En Nginx, emitir primero un certificado válido con el mecanismo existente; validar configuración antes de recargar.

Reemplazar el CNAME `ads → custom-domains.chatgpt.site` por A `ads → IP_DEL_SERVIDOR` solo cuando el backend y el proxy estén verificados. No cambiar los registros de Nexo ni el dominio principal. Mantener la publicación anterior para poder revertir DNS.

Después del cambio:

1. Comprobar HTTPS sin excepciones de certificado y `/api/health`.
2. Abrir la invitación inicial y crear la contraseña de administración.
3. Crear Eticsa, autorizar Google y validar la cuenta correspondiente.
4. Verificar un reporte real y la recuperación de contraseña con SMTP autorizado.
5. Crear la invitación del cliente correcto, que no tiene por qué ser el correo usado para administrar Google Ads.
6. Comprobar que sesiones anónimas y otro cliente no pueden consultar Eticsa.

## Copias y reversión

Hacer copias PostgreSQL en almacenamiento fuera del servidor, incluyendo usuarios, membresías, conexiones, presupuestos y gestiones. Conservar de forma separada la clave de cifrado. Ejemplo de exportación (contiene datos privados; proteger el archivo):

```sh
docker compose --env-file .env.production -f deploy/compose.yml exec -T db pg_dump -U agencialabs -d agencialabs -Fc > /ruta/privada/agencialabs.dump
```

Verificar la restauración en otra base. Para revertir la aplicación, usar la etiqueta anterior de su imagen sin borrar el volumen. Para revertir el traslado completo, restaurar el CNAME anterior y mantener intacto el volumen nuevo. Nunca ejecutar `docker compose down -v` sobre producción.
