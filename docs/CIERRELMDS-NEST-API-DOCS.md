# nest-api — Prefijo HTTPS cierrelmds (`/api-docs-nest-api/`)

Publicación en **https://cierrelmds.exelixitech.com** con el mismo patrón que `/nexus-api/` y `/pagos-api/`.

## URLs

| Recurso | URL HTTPS |
| ------- | --------- |
| Swagger | https://cierrelmds.exelixitech.com/api-docs-nest-api/docs |
| API (Try it out) | https://cierrelmds.exelixitech.com/api-docs-nest-api/api/v1/... |
| Red interna srv001 | http://192.168.8.120:3002/docs |

**Nota:** la raíz `/api-docs-nest-api/` sin `/docs` no es una página; usar siempre `.../docs`.

## Variables (.env / PM2)

```env
PUBLIC_API_PREFIX=/api-docs-nest-api
PUBLIC_API_ORIGIN=https://cierrelmds.exelixitech.com
```

`ecosystem.config.js` ya las define en `env_production`. Tras cambiarlas:

```bash
pm2 restart sysip-nest-api --update-env
```

## Apache (VirtualHost cierrelmds SSL) — **infra / sysadmin**

Si `https://cierrelmds.exelixitech.com/api-docs-nest-api/docs` devuelve **404 Apache** (no JSON), falta el proxy.  
Nest en srv001 responde en `http://127.0.0.1:3002/docs`; Apache debe reenviar el prefijo.

Strip del prefijo hacia PM2 `:3002` (igual que nexus-api):

```apache
ProxyPass        /api-docs-nest-api/   http://127.0.0.1:3002/
ProxyPassReverse /api-docs-nest-api/   http://127.0.0.1:3002/
```

Recargar Apache:

```bash
sudo apache2ctl configtest && sudo systemctl reload apache2
```

## Verificación

```bash
curl -sI https://cierrelmds.exelixitech.com/api-docs-nest-api/docs | head -3
curl -s  https://cierrelmds.exelixitech.com/api-docs-nest-api/api/v1/valrep/states | head -c 200
```

## Notas

- Las llamadas **internas** (emision-api → `NEST_API_URL=http://127.0.0.1:3002`) siguen sin prefijo.
- El dropdown **Servers** en Swagger usa `https://cierrelmds.exelixitech.com/api-docs-nest-api` cuando `PUBLIC_API_PREFIX` está configurado.
