/** Tags Swagger — nombres orientados a integradores (La Mundial). */
export const SWAGGER_TAGS = {
  INMA: '1. Catálogo vehicular',
  VALREP: '2. Cotización y catálogos',
  EMISSION: '3. Emisión automóvil',
  COLLECTION: '4. Cobranza',
  DOCUMENTS: '5. Documentos',
  PERSONAS: '6. Emisión personas',
  CLIENT: '7. Consulta de clientes',
} as const;

export const SWAGGER_TAG_ORDER: string[] = Object.values(SWAGGER_TAGS);

export const SWAGGER_TAG_DESCRIPTIONS: Record<string, string> = {
  [SWAGGER_TAGS.INMA]: 'Año, marca, modelo, versión y categoría de uso del vehículo.',
  [SWAGGER_TAGS.VALREP]: 'Estados, ciudades, planes, frecuencias y cálculo de prima.',
  [SWAGGER_TAGS.EMISSION]: 'Validación de placa/serial y emisión de póliza automóvil.',
  [SWAGGER_TAGS.COLLECTION]: 'Activación de cobro e ingreso de caja del recibo emitido.',
  [SWAGGER_TAGS.DOCUMENTS]: 'Generación de documentos PDF post-emisión.',
  [SWAGGER_TAGS.PERSONAS]: 'Productos, planes, cotización, validación y emisión de personas.',
  [SWAGGER_TAGS.CLIENT]: 'Consulta de cliente, pólizas del asegurado y coberturas.',
};
