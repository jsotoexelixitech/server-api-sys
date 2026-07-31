/** Tags Swagger — nombres orientados a integradores (La Mundial). */
export const SWAGGER_TAGS = {
  INMA: '1. Catálogo vehicular',
  VALREP: '2. Cotización y catálogos',
  EMISSION: '3. Emisión automóvil',
  COLLECTION: '4. Cobranza',
  DOCUMENTS: '5. Documentos',
  PERSONAS: '6. Emisión personas',
  CLIENT: '7. Consulta de clientes',
  PARTNER: '8. Integraciones partner',
  CONDOMINIO: '9. Emisión condominio',
} as const;

export const SWAGGER_TAG_ORDER: string[] = Object.values(SWAGGER_TAGS);

/** Sorter serializable en swagger-ui-init.js (sin imports de Node en el navegador). */
export function createBrowserTagsSorter(): (a: string, b: string) => number {
  return new Function(
    'a',
    'b',
    `var order=${JSON.stringify(SWAGGER_TAG_ORDER)};var ai=order.indexOf(a);var bi=order.indexOf(b);return(ai===-1?999:ai)-(bi===-1?999:bi);`,
  ) as (a: string, b: string) => number;
}

export const SWAGGER_TAG_DESCRIPTIONS: Record<string, string> = {
  [SWAGGER_TAGS.INMA]: 'Año, marca, modelo, versión y categoría de uso del vehículo.',
  [SWAGGER_TAGS.VALREP]: 'Estados, ciudades, planes, frecuencias y cálculo de prima.',
  [SWAGGER_TAGS.EMISSION]: 'Validación de placa/serial y emisión de póliza automóvil.',
  [SWAGGER_TAGS.COLLECTION]: 'Activación de cobro e ingreso de caja del recibo emitido.',
  [SWAGGER_TAGS.DOCUMENTS]: 'Generación de documentos PDF post-emisión.',
  [SWAGGER_TAGS.PERSONAS]: 'Productos, planes, cotización, validación y emisión de personas.',
  [SWAGGER_TAGS.CLIENT]: 'Consulta de cliente, pólizas del asegurado y coberturas.',
  [SWAGGER_TAGS.PARTNER]:
    'Endpoints de integradores externos (paquetes npm registrados en PARTNER_PACKAGES).',
  [SWAGGER_TAGS.CONDOMINIO]: 'Planes, cotización y emisión de póliza de condominio.',
};
