import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/** Esquema estándar de error de la API */
const errorSchema = (statusCode: number, msg: string) => ({
  schema: {
    example: {
      status:    false,
      statusCode,
      message:   msg,
      path:      '/api/v1/...',
      timestamp: '2026-05-14T15:00:00.000Z',
    },
  },
});

/** 400 – Validación de campos (mensaje = array de errores) */
export const Api400 = () =>
  ApiResponse({
    status: 400,
    description: 'Parámetros inválidos o faltantes.',
    schema: {
      example: {
        status:    false,
        statusCode: 400,
        message:   ['campo must not be empty', 'fano must not be less than 1950'],
        path:      '/api/v1/...',
        timestamp: '2026-05-14T15:00:00.000Z',
      },
    },
  });

/** 401 – No autorizado (apikey inválida) */
export const Api401 = () =>
  ApiResponse({
    status: 401,
    description: 'apikey inválida o no autorizada.',
    ...errorSchema(401, 'Token no encontrado.'),
  });

/** 404 – Recurso no encontrado */
export const Api404 = () =>
  ApiResponse({
    status: 404,
    description: 'El recurso solicitado no existe.',
    ...errorSchema(404, 'Recurso no encontrado.'),
  });

/** 500 – Error interno del servidor */
export const Api500 = () =>
  ApiResponse({
    status: 500,
    description: 'Error interno del servidor (ver logs).',
    ...errorSchema(500, 'Ha ocurrido un error inesperado en el servidor.'),
  });

/** Aplica 400 + 500 (el par más común) */
export const ApiCommonErrors = () =>
  applyDecorators(Api400(), Api500());

/** Aplica 400 + 404 + 500 */
export const ApiCrudErrors = () =>
  applyDecorators(Api400(), Api404(), Api500());
