---
name: "🐛 Bug Report"
about: Reporta un comportamiento inesperado en la API
title: "[BUG] "
labels: bug, needs-triage
assignees: ''
---

## Descripción del bug

<!-- Describe claramente qué está fallando -->

## Pasos para reproducir

1. Llamar a `POST /api/v1/...` con este body:
```json

```
2. ...

## Comportamiento esperado

<!-- Qué debería devolver la API -->

## Comportamiento actual

<!-- Qué está devolviendo en cambio -->

```json
{
  "status": false,
  "statusCode": ...,
  "message": "...",
  ...
}
```

## Entorno

- **Node.js:** `node -v`
- **npm:** `npm -v`
- **SO:** Windows / Linux
- **NODE_ENV:** development / production

## Logs relevantes (si aplica)

```
[Nest] ... ERROR ...
```

## Notas adicionales

<!-- Cualquier contexto adicional, capturas de pantalla, etc. -->
