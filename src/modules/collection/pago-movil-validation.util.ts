import { CollectionPaymentDto } from './dto/collection-payment.dto';

export const PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE =
  'El pago ya fue validado previamente.';

/** Datos mínimos para detectar un pago móvil ya registrado en pago_movil. */
export function hasPagoMovilDuplicateLookupFields(
  body: Pick<
    CollectionPaymentDto,
    'xtelefono' | 'mpago' | 'cbanco_ref' | 'cci_rif' | 'xreferencia'
  >,
): boolean {
  const tel = body.xtelefono?.trim();
  const bankRef = body.cbanco_ref?.trim();
  const dni = body.cci_rif?.trim();
  const referencia = body.xreferencia?.trim();
  const monto = Number(body.mpago);
  return Boolean(tel && bankRef && dni && referencia && Number.isFinite(monto) && monto > 0);
}
