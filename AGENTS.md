# AGENTS.md — nest-api (server-api-sys)

Repo Git de este subproyecto. Commits/deploy desde aquí.

@CONTEXTO-SESION.md

## Deploy srv001

```bash
cd ~/server-api-sys && git pull && npm run build && pm2 restart sysip-nest-api
```

Swagger QA (interno): `http://192.168.8.120:3002/docs`  
Swagger HTTPS: `https://cierrelmds.exelixitech.com/api-docs-nest-api/docs` (prefijo `/api-docs-nest-api/`)

## Skill

@../.agents/skills/nestjs-sysip-backend/SKILL.md
