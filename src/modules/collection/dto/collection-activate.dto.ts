import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { CollectionPaymentDto } from './collection-payment.dto';

const CollectionActivateRequiredDto = PickType(CollectionPaymentDto, [
  'cnrecibo',
  'mpago',
  'xreferencia',
  'fpago',
] as const);

const CollectionActivateOptionalDto = PartialType(
  PickType(CollectionPaymentDto, [
    'cbanco_ref',
    'telefono',
    'cedula',
    'cusuario',
    'cbanco',
    'cbanco_destino',
    'xtelefono',
    'telefono_dest',
    'cci_rif',
    'cbanco_dest_ref',
    'origen_pago',
  ] as const),
);

/**
 * Body documentado para `POST /external/collection/activate`.
 * Misma validación que cobranza; el esquema Swagger prioriza campos de integradores RCV.
 */
export class CollectionActivateDto extends IntersectionType(
  CollectionActivateRequiredDto,
  CollectionActivateOptionalDto,
) {}
