# AGENTS.md — nest-api (server-api-sys)

Repo Git de este subproyecto. Commits/deploy desde aquí.

@CONTEXTO-SESION.md

## Deploy srv001

```bash
cd ~/server-api-sys && git pull && npm run build && pm2 restart sysip-nest-api
```

Swagger QA (interno): `http://192.168.8.120:3002/docs`  
Swagger HTTPS: `https://cierrelmds.exelixitech.com/nest-api-docs/docs` (prefijo `/nest-api-docs/`)

## Skills (nest-api)

`backend-api-sys/.agents/skills/nestjs-sysip-backend/SKILL.md`

Todos los skills del workspace: `@../.agents/skills/README.md` y `@../../HISTORIAL-CHATS.md`
