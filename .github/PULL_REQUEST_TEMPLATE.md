# Descripción

<!-- Qué hace este PR y por qué es necesario. Enlaza el issue si aplica: Closes #N -->

## Tipo de cambio

- [ ] 🐛 Bug fix
- [ ] ✨ Nueva funcionalidad (feat)
- [ ] 🔄 Migración de endpoint desde Express
- [ ] ♻️ Refactorización
- [ ] 📝 Documentación
- [ ] 🔧 Configuración / chore
- [ ] ⚠️ Breaking change

## Cambios realizados

<!-- Lista concisa de los cambios: -->
- 
- 

## Cómo probar

```bash
# Ejemplo de llamada para verificar el cambio
curl -s -X POST http://localhost:3001/api/v1/... \
  -H "Content-Type: application/json" \
  -d '{ ... }' | jq .
```

**Respuesta esperada:**
```json
{
  "status": true,
  "data": { ... }
}
```

## Checklist

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin errores
- [ ] El endpoint aparece correctamente en `/docs`
- [ ] Los errores usan el formato estándar `{ status, statusCode, message, path, timestamp }`
- [ ] DTOs tienen `@ApiProperty` y validadores `class-validator`
- [ ] Sin credenciales ni IPs de producción en el código
- [ ] CHANGELOG.md actualizado (si aplica)
