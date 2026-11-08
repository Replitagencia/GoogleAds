# AgenciaLabs · Portal de Google Ads

Prueba privada para consultar una cuenta de Google Ads directamente. React 19, Vinext, Cloudflare Workers y D1.

## Incluido

- Resumen, campañas, detalles, filtros de 7/30 días y exportación CSV.
- Demostración identificada mientras no exista una conexión real.
- OAuth de Google con estado de un solo uso, vinculado al usuario y con vencimiento.
- Tokens de renovación cifrados con AES-GCM en D1; secretos únicamente en el servidor.
- Consultas de Google Ads API v26, validación de cuenta directa y actualización cada 5 minutos con la página abierta.
- Datos segregados por la identidad autenticada en Sites. El sitio permanece privado.

## Pendiente para la prueba real

1. Crear proyecto de Google Cloud y habilitar Google Ads API con el acceso aplicable.
2. Configurar consentimiento OAuth y usuario de prueba; crear cliente web.
3. Registrar `https://portal-campanas-dante.dsalascl.chatgpt.site/api/google/callback` como URI autorizada.
4. Configurar secretos `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (32 bytes aleatorios en base64) y `SITE_URL` en Sites. Si el modelo de acceso de Google lo exige, añadir `GOOGLE_ADS_DEVELOPER_TOKEN`.
5. Publicar para aplicar la configuración, autorizar Google y validar el ID de la cuenta directa.

No guardar secretos ni datos de clientes en GitHub. La integración aún necesita validación con una cuenta real. La consulta utiliza el ámbito OAuth de Google Ads; la aplicación solo implementa lecturas, aunque el permiso de Google es más amplio. El consentimiento de prueba puede requerir volver a autorizar periódicamente según las reglas de Google.

## Siguiente etapa

El acceso independiente de clientes mediante correo y contraseña, administración de clientes, asignación de cuentas y recuperación de contraseñas todavía no están implementados. Esta prueba usa la autenticación privada de Sites. No publicar para clientes hasta implementar y validar esas funciones.

## Desarrollo

```sh
npm run install:ci
npm run dev
npx tsc --noEmit
npm run db:generate # solo al cambiar esquema
npm run build
```

Las migraciones se guardan en `drizzle/`. En desarrollo, aplicar las migraciones pendientes al D1 local antes de probar una conexión. Las credenciales de Google se configuran en `.dev.vars` local, ignorado por Git. En producción se configuran mediante variables de entorno de Sites, nunca en el manifiesto.

## Documentación

- https://developers.google.com/google-ads/api/docs/get-started/make-first-call
- https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/google-ads/api/docs/release-notes

## Dashboard ampliado

- Comparación de 7/30 días completos con el período inmediatamente anterior, usando la zona horaria de la cuenta; CPC y CTR calculados a partir de totales, sin promediar porcentajes.
- Inversión del mes hasta ayer y proyección lineal con días completos. El presupuesto acordado se guarda por usuario/cuenta/mes en D1; nunca modifica Google Ads y no se arrastra automáticamente al mes siguiente.
- Conversiones principales/secundarias y todas las conversiones por acción, con mensajes que distinguen configuración ausente, cero actividad y errores de consulta. No diagnostica etiquetas del sitio ni identifica contactos únicos.
- Dispositivos, regiones de presencia, hasta 50 palabras clave y búsquedas por clics, y hasta 20 anuncios de búsqueda adaptables por conversiones/clics. Los informes parciales muestran sus límites y no se presentan como el total de la cuenta.
- Registro manual de gestiones, próximos pasos y comentarios en D1, asociado al usuario autenticado y a su cuenta seleccionada.
- Las consultas se conservan en caché privada por usuario/cuenta/período durante 5 minutos para limitar consumo de la API. Los fallos de desgloses no impiden consultar el reporte principal.

Verificación de cálculos: `node --experimental-strip-types --test tests/reporting.test.mjs`.
