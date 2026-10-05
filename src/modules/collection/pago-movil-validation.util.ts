import { CollectionPaymentDto } from './dto/collection-payment.dto';

export const PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE =
  'El pago ya fue validado previamente.';

/** Datos mínimos para detectar un pago móvil ya registrado en pago_movil. */
export function hasPagoMovilDuplicateLookupFields(
  body: Pick<CollectionPaymentDto, 'xtelefono' | 'cbanco_ref' | 'xreferencia'>,
): boolean {
  const tel = body.xtelefono?.trim();
  const bankRef = body.cbanco_ref?.trim();
  const referencia = body.xreferencia?.trim();
  return Boolean(tel && bankRef && referencia);
}
