export function isMissingStoredProcedureError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('could not find stored procedure')
    || (lower.includes('no se encontr') && lower.includes('procedimiento'))
    || lower.includes('invalid object name')
  );
}

const USER_ERROR_FALLBACK =
  'No pudimos completar la operación. Inténtalo de nuevo o contacta a soporte.';

const USER_ERROR_RULES: Array<{ test: RegExp; message: string }> = [
  {
    test: /truncated|xavecalle|string or binary|would be truncated/i,
    message:
      'La dirección del inmueble es demasiado larga. Usa calle, urbanización y ciudad e inténtalo de nuevo.',
  },
  {
    test: /sp_create_maclient|maclient_dir|maclient/i,
    message:
      'No pudimos registrar los datos del cliente. Revisa RIF, nombre y dirección e inténtalo de nuevo.',
  },
  {
    test: /sp_emision|emisi[oó]n ramo/i,
    message: 'No se pudo emitir la póliza en este momento. Inténtalo de nuevo o contacta a soporte.',
  },
  {
    test: /could not find stored procedure|invalid object name|no se encontr.*procedimiento/i,
    message: 'El servicio de emisión no está disponible. Inténtalo más tarde o contacta a soporte.',
  },
  {
    test: /overflow|arithmetic overflow|conversion failed|cannot insert/i,
    message: 'Algunos datos no tienen el formato esperado. Revísalos e inténtalo de nuevo.',
  },
];

/** Mensaje corto para el cliente. El detalle técnico debe quedar solo en logs. */
export function toUserFacingError(raw: string, fallback = USER_ERROR_FALLBACK): string {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  for (const rule of USER_ERROR_RULES) {
    if (rule.test.test(text)) return rule.message;
  }
  if (
    /sp_|dbo\.|sis2000|truncated|cpoliza=|cproces=|nvarchar|l[ií]nea\s+\d+|xavecalle|maclient/i.test(
      text,
    ) ||
    text.length > 180
  ) {
    return fallback;
  }
  return text;
}

export function parseSPError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  const match = msg.match(/Message:\s*(.*?)(?:\r?\n|$)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  return msg
    .replace(/^RequestError: /i, '')
    .replace(/^Error: \d+, State: \d+, Class: \d+, /i, '')
    .trim();
}

export type ValidateAutoErrorCode =
  | 'PLATE_ALREADY_INSURED'
  | 'SERIAL_ALREADY_INSURED'
  | 'VEHICLE_ALREADY_INSURED'
  | 'VALIDATE_EMISSION_ERROR';

export interface FormattedValidateAutoError {
  message: string;
  code: ValidateAutoErrorCode;
}

/** Mensajes legibles para respuestas de spee_validate_automovil_general_nexus (Sis2000). */
export function formatValidateAutoError(rawMessage: string): FormattedValidateAutoError {
  const normalized = rawMessage.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();

  if (
    lower.includes('serial carrocer') ||
    lower.includes('serial de carrocer') ||
    lower.includes('xsercar')
  ) {
    return {
      code: 'SERIAL_ALREADY_INSURED',
      message: 'Ya existe una póliza vigente registrada con el mismo serial de carrocería.',
    };
  }

  if (lower.includes('placa')) {
    return {
      code: 'PLATE_ALREADY_INSURED',
      message: 'Ya existe una póliza vigente registrada con la misma placa.',
    };
  }

  if (
    lower.includes('vigente') ||
    lower.includes('existencia de una póliza') ||
    lower.includes('existencia de una poliza') ||
    lower.includes('poliza rel') ||
    lower.includes('póliza rel')
  ) {
    return {
      code: 'VEHICLE_ALREADY_INSURED',
      message: 'Este vehículo ya cuenta con una póliza vigente y no puede asegurarse nuevamente.',
    };
  }

  if (isMissingStoredProcedureError(normalized)) {
    return {
      code: 'VALIDATE_EMISSION_ERROR',
      message:
        'Falta desplegar spee_validate_automovil_general_nexus en Sis2000. ' +
        'Referencia: docs/sql/spee_validate_automovil_general_nexus.sql',
    };
  }

  return {
    code: 'VALIDATE_EMISSION_ERROR',
    message: normalized || 'No se pudo validar el vehículo para emisión.',
  };
}
