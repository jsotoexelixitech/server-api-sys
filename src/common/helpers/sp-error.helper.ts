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

/** Mensajes legibles para respuestas de speeValidateAutomovilGeneral (Sis2000). */
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

  return {
    code: 'VALIDATE_EMISSION_ERROR',
    message: normalized || 'No se pudo validar el vehículo para emisión.',
  };
}
