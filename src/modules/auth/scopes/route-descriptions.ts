/** Etiqueta legible por endpoint (admin / guía de scopes). */
const ROUTE_LABELS: Record<string, string> = {
  // catalog:read — INMA
  'GET /api/v1/inma/anios': 'Años disponibles del catálogo vehicular',
  'POST /api/v1/inma/marcas': 'Marcas por tipo de vehículo',
  'POST /api/v1/inma/marca/:param': 'Marcas filtradas por ctipo',
  'POST /api/v1/inma/modelo': 'Modelos de una marca',
  'POST /api/v1/inma/version': 'Versiones / variantes del modelo',
  'POST /api/v1/inma/categorias-uso': 'Categorías de uso del vehículo',
  // catalog:read — valrep
  'GET /api/v1/valrep/states': 'Estados (geo)',
  'GET /api/v1/valrep/cities': 'Ciudades por estado',
  'POST /api/v1/valrep/getLists': 'Listas auxiliares del tarificador',
  'POST /api/v1/valrep/productos': 'Productos RCV disponibles',
  'POST /api/v1/valrep/matipoemision': 'Tipo de emisión por canal/productor',
  'POST /api/v1/valrep/matipopago-entidades': 'Métodos de pago por canal/productor',
  'POST /api/v1/valrep/planes/producto': 'Planes de un producto',
  'GET /api/v1/canal/visibility': 'Visibilidad de canal (planes, emisión y pago)',
  'POST /api/v1/valrep/planes/detalle': 'Detalle de plan tarifario',
  'POST /api/v1/valrep/planes/v2': 'Planes (formato v2)',
  'POST /api/v1/valrep/planesPer': 'Planes personas (legacy)',
  'POST /api/v1/valrep/frecuencia': 'Frecuencias de pago',
  'POST /api/v1/valrep/cotizacion': 'Cotización RCV',
  'POST /api/v1/valrep/calculate-plan-coberturas': 'Primas por cobertura (sp_calculo_auto_nexus)',
  'POST /api/v1/valrep/macategtr': 'Categorías tarifarias (legacy)',
  'GET /api/v1/valrep/matipos': 'Tipos de vehículo (legacy)',
  // collection:write
  'POST /api/v1/external/collection/activate': 'Activar recibo / póliza en cobranza',
  'POST /api/v1/external/collection/collect': 'Registrar cobro de recibo',
  'POST /api/v1/external/collection/notific': 'Notificar recibo pendiente',
  'POST /api/v1/external/collection/search': 'Buscar recibos / estado de cobranza',
  // client:read
  'GET /api/v1/client/search/:param': 'Buscar cliente por RIF/cédula',
  'GET /api/v1/client/search/policies/:param': 'Pólizas del asegurado',
  'POST /api/v1/client/search/coverages': 'Coberturas de pólizas del cliente',
  // documents:write
  'POST /api/v1/documents/conductor-habitual': 'Generar PDF conductor habitual',
  'GET /api/v1/documents/pdf/:param': 'Descargar PDF generado',
  // emissions:auto
  'POST /api/v1/emissions/automobile_new/propietary': 'Emisión RCV — datos propietario',
  'POST /api/v1/emissions/automobile/vehicle': 'Validar vehículo (catálogo)',
  'POST /api/v1/emissions/automobile/serial': 'Validar serial / placa',
  'POST /api/v1/external/validateEmissionAuto': 'Pre-validación emisión auto',
  'POST /api/v1/external/createEmissionAuto': 'Emitir póliza RCV',
  'GET /api/v1/arys/coberturas/:param/:param': 'Primas Arys (Coberturas) para membresía RCV',
  'POST /api/v1/arys/membership/register': 'Registrar membresía Arys post-emisión RCV',
  // emissions:condominio
  'GET /api/v1/condominio/productos': 'Productos de condominio',
  'GET /api/v1/condominio/frecuencias': 'Frecuencias de pago condominio',
  'GET /api/v1/condominio/dispositivos': 'Dispositivos de seguridad',
  'GET /api/v1/condominio/sustancias': 'Sustancias / riesgos',
  'POST /api/v1/condominio/planes': 'Planes tarifarios condominio',
  'POST /api/v1/condominio/cotizacion': 'Cotizar condominio',
  'POST /api/v1/condominio/emision': 'Emitir póliza de condominio',
  // product-emission:write
  'POST /api/v1/product-emission/quote': 'Cotizar producto genérico (product-builder)',
  'POST /api/v1/product-emission/validate': 'Validar datos antes de emitir',
  'POST /api/v1/product-emission/emit': 'Emitir póliza genérica + PDF',
  'GET /api/v1/product-emission/policies/:param': 'Consultar póliza emitida',
  // emissions:person
  'POST /api/v1/personas/planes': 'Planes disponibles (personas/viajero)',
  'POST /api/v1/personas/cotizacion': 'Cotización personas / viajero',
  'POST /api/v1/personas/validacion': 'Validación pre-emisión personas',
  'POST /api/v1/personas/poliza-vigente': 'Consultar póliza funeraria vigente por cédula',
  'POST /api/v1/personas/emision': 'Emitir póliza personas / viajero',
  'POST /api/v1/emision-personas/getCotizacionPer': 'Cotización personas (core · sección 6)',
  'POST /api/v1/emision-personas/validateEmissionPerson': 'Pre-validación emisión personas (core)',
  'POST /api/v1/emision-personas/createEmissionPerson': 'Emitir póliza personas (core)',
  'POST /api/v1/external/getCotizacionPer': 'Cotización personas (partner / legacy external)',
  'POST /api/v1/external/validateEmissionPerson': 'Pre-validación emisión personas (partner)',
  'POST /api/v1/external/createEmissionPerson': 'Emitir póliza personas (partner)',
  // endosos:write
  'POST /api/endosos/polizas': 'Crear / registrar endoso de póliza',
  'GET /api/endosos/polizas/cedula/:param': 'Pólizas por cédula del tomador',
  'GET /api/endosos/polizas/:param': 'Detalle de póliza para endoso',
  'POST /api/endosos/recibos/anular': 'Anular recibo',
  'POST /api/endosos/recibos': 'Generar recibo de endoso',
  'POST /api/endosos/poliza/anular': 'Anular póliza',
  'POST /api/endosos/poliza/reactivar': 'Reactivar póliza anulada',
  'POST /api/endosos/poliza/datos': 'Actualizar datos de póliza',
  'POST /api/endosos/vehiculo/datos': 'Actualizar datos del vehículo',
  'POST /api/endosos/pagos/asiento': 'Registrar asiento de pago',
  'GET /api/endosos/planes': 'Listar planes endosables',
  'GET /api/endosos/planes/:param/coberturas': 'Coberturas del plan',
  'POST /api/endosos/planes/calcular': 'Calcular prima del endoso',
  // partner
  'GET /api/v1/partner/starter/health': 'Health check módulo partner',
  'GET /api/v1/partner/starter/ping': 'Ping módulo partner',
  // renovations
  'POST /api/v1/renovations/v2/create': 'Renovar póliza (integrador v2)',
  // report:write (partner ESanchez)
  'POST /api/v1/report/ReRecibosV2': 'Reporte de recibos V2',
  'POST /api/v1/report/movimientosComisiones': 'Movimientos de comisiones',
  'POST /api/v1/report/movimientosComisiones/definition': 'Definición del reporte de comisiones',
};

function normalizeRouteKey(routeId: string): string {
  return String(routeId ?? '')
    .trim()
    .replace(/\/{2,}/g, '/')
    .replace(/\{[^}]+\}/gi, ':param')
    .replace(/:[^/\s]+/g, ':param');
}

function humanizeSegment(segment: string): string {
  const map: Record<string, string> = {
    anios: 'años',
    cotizacion: 'cotización',
    emision: 'emisión',
    validacion: 'validación',
    productos: 'productos',
    planes: 'planes',
    frecuencias: 'frecuencias',
    dispositivos: 'dispositivos',
    sustancias: 'sustancias',
    activate: 'activar',
    collect: 'cobrar',
    notific: 'notificar',
    search: 'consultar',
    emit: 'emitir',
    quote: 'cotizar',
    validate: 'validar',
    health: 'health check',
    ping: 'ping',
    create: 'crear',
    anular: 'anular',
    reactivar: 'reactivar',
  };
  return map[segment] ?? segment.replace(/-/g, ' ');
}

/** Descripción corta y distinta por ruta; fallback heurístico si no hay mapa explícito. */
export function describeRouteLine(routeId: string): string {
  const key = normalizeRouteKey(routeId);
  const explicit = ROUTE_LABELS[key];
  if (explicit) return explicit;

  const space = key.indexOf(' ');
  if (space <= 0) return key;
  const method = key.slice(0, space);
  const path = key.slice(space + 1);
  const segments = path.split('/').filter(Boolean);
  const resource = segments[segments.length - 1] ?? 'recurso';
  const module = segments[2] ?? segments[1] ?? 'api';
  const action =
    method === 'GET'
      ? 'Consultar'
      : method === 'POST'
        ? 'Ejecutar'
        : method === 'PUT' || method === 'PATCH'
          ? 'Actualizar'
          : method === 'DELETE'
            ? 'Eliminar'
            : method;
  return `${action} ${humanizeSegment(resource)} (${module})`;
}
