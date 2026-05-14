# Guía de contribución

¡Gracias por contribuir! Sigue estas pautas para mantener el proyecto ordenado.

---

## Tabla de contenidos

- [Código de conducta](#código-de-conducta)
- [¿Cómo reportar un bug?](#cómo-reportar-un-bug)
- [¿Cómo proponer una mejora?](#cómo-proponer-una-mejora)
- [Flujo de trabajo con Git](#flujo-de-trabajo-con-git)
- [Estilo de código](#estilo-de-código)
- [Convención de commits](#convención-de-commits)
- [Checklist antes de abrir un PR](#checklist-antes-de-abrir-un-pr)

---

## Código de conducta

Sé respetuoso, constructivo y profesional en todos los comentarios e interacciones.

---

## ¿Cómo reportar un bug?

1. Busca si ya existe un issue similar.
2. Abre un nuevo issue usando la plantilla **Bug Report**.
3. Incluye: versión de Node, mensaje de error exacto, pasos para reproducir y respuesta esperada vs obtenida.

---

## ¿Cómo proponer una mejora?

1. Abre un issue usando la plantilla **Feature Request**.
2. Describe el problema que resuelve y el comportamiento deseado.
3. Espera feedback antes de implementar para evitar trabajo duplicado.

---

## Flujo de trabajo con Git

```bash
# 1. Crea una rama desde main con nombre descriptivo
git checkout -b feat/nombre-del-modulo
# o
git checkout -b fix/descripcion-del-bug

# 2. Haz commits pequeños y descriptivos (ver convención abajo)

# 3. Sube la rama y abre un PR hacia main
git push origin feat/nombre-del-modulo
```

**Nunca hagas push directo a `main`.**

---

## Estilo de código

El proyecto usa ESLint + Prettier. Antes de hacer commit:

```bash
npm run lint    # reporta y corrige errores de estilo
npm run format  # formatea con Prettier
```

Reglas clave:
- TypeScript estricto — no uses `any` sin justificación
- Cada endpoint debe tener su DTO con `@ApiProperty` y validadores `class-validator`
- Los servicios nunca exponen mensajes SQL ni stacks al cliente — usa los helpers de `AllExceptionsFilter`
- Cada método de servicio debe tener bloque `try/catch` con `Logger.error()`

---

## Convención de commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<alcance>): <descripción corta en imperativo>

[cuerpo opcional]
[footer opcional: BREAKING CHANGE / cierra #issue]
```

| Tipo | Cuándo usarlo |
|------|---------------|
| `feat` | Nueva funcionalidad / nuevo endpoint |
| `fix` | Corrección de bug |
| `refactor` | Refactorización sin cambio de comportamiento |
| `docs` | Solo documentación |
| `chore` | Cambios de configuración, dependencias, CI |
| `test` | Añadir o corregir tests |
| `perf` | Mejora de rendimiento |

Ejemplos:
```
feat(inma): agregar endpoint POST /inma/marcas filtradas por ctipo
fix(client): validar que cci_rif sea numérico antes de llamar al SP
docs(readme): actualizar tabla de endpoints con módulo changes
chore(deps): actualizar mssql a 10.0.5
```

---

## Checklist antes de abrir un PR

- [ ] El código compila sin errores (`npx tsc --noEmit`)
- [ ] ESLint sin errores (`npm run lint`)
- [ ] El nuevo endpoint tiene DTO con `@ApiProperty` y validadores
- [ ] El Swagger muestra correctamente el endpoint (probar en `/docs`)
- [ ] Los errores devuelven el formato estándar `{ status, statusCode, message, path, timestamp }`
- [ ] No hay credenciales, tokens ni IPs de producción en el código
- [ ] El PR description describe qué, por qué y cómo probar
