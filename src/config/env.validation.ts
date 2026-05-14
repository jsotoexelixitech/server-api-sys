import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  SWAGGER_PATH: Joi.string().default('docs'),
  CORS_ORIGIN: Joi.string().default('*'),

  SERVER_BD: Joi.string().required(),
  NAME_BD: Joi.string().required(),
  USER_BD: Joi.string().required(),
  PASSWORD_BD: Joi.string().required(),

  MSSQL_REQUEST_TIMEOUT: Joi.number().default(300000),
  MSSQL_ENCRYPT: Joi.boolean().default(false),
  MSSQL_TRUST_SERVER_CERTIFICATE: Joi.boolean().default(true),
  MSSQL_ENABLE_ARITH_ABORT: Joi.boolean().default(true),
});
