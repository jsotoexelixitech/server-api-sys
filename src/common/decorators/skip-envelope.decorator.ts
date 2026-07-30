import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** Respuesta sin envoltorio `{ status, data }` (p. ej. OAuth /auth/token). */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
