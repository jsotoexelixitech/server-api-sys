/**
 * Stored procedures Sis2000 usados por nest-api (emisión local directa).
 */

// ── RCV automóvil ───────────────────────────────────────────────────────────

export const SP_PRE_EMISION_AUTO_RCV = 'sp_pre_emision_automovil_rcv_nexus';

/** Invocado al final del pre-SP (no desde nest-api directamente). */
export const SP_EMISION_AUTO_RCV = 'sp_emision_automovil_rcv_nexus';

// ── Personas / funerario / viajero ──────────────────────────────────────────

export const SP_PRE_EMISION_PERSONAS = 'sp_pre_emision_personas_general_nexus';

/** Invocado al final del pre-SP personas (no desde nest-api directamente). */
export const SP_EMISION_PERSONAS = 'sp_emision_personas_general_nexus';

/** Prorrata viajero por días (fdesde/fhasta o ndias × tarifa diaria). */
export const SP_CALCULO_VIAJERO_PRORRATA = 'spCalculoViajeroProrrata';

// ── Auxiliares RCV (nest-api → Sis2000) ─────────────────────────────────────

export const SP_GET_MACLIENT_API = 'spGetMaclientApi';
export const SP_GET_COVERAGE_CLIENT = 'spGetCoverageClient';
export const SP_SYNC_POL_VEH_COUNTER = 'spSyncPolVehCounter';
export const SP_LOOKUP_EMISSION_RCV_BY_PLACA = 'spLookupEmissionRcvByPlaca';
export const SP_SEARCH_VEHICLE_RCV = 'spSearchVehicleRcv';
export const SP_APPLY_BENEFICIARIO_PREFERENCIAL_RCV = 'spApplyBeneficiarioPreferencialRcv';

// ── Condominio ──────────────────────────────────────────────────────────────
export const SP_BUSCA_PLANES_CONDOMINIO = 'sp_busca_planes_condominio_nexus';
export const SP_CALCULO_COTIZACION_CONDOMINIO = 'sp_calculo_cotizacion_condominio_nexus';
export const SP_PRE_EMISION_CONDOMINIO = 'sp_pre_emision_condominio_nexus';
