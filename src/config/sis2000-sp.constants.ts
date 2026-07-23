/**
 * Nombres de SP Sis2000 usados por nest-api (emisión local).
 * Mismo contrato de parámetros que el SP legacy salvo indicación contraria en BD.
 */

// ── RCV automóvil ───────────────────────────────────────────────────────────

export const SP_PRE_EMISION_AUTOMOVIL_RCV_NEXUS = 'sp_pre_emision_automovil_rcv_nexus';

/** Invocado al final del pre-SP Nexus (no desde nest-api directamente). */
export const SP_EMISION_AUTOMOVIL_RCV_NEXUS = 'sp_emision_automovil_rcv_nexus';

/** @deprecated Solo referencia documental / rollback QA */
export const SP_PRE_EMISION_AUTOMOVIL_RCV_LEGACY = 'sp_pre_emision_Automovil_RCV2';

// ── Personas / funerario ────────────────────────────────────────────────────

export const SP_PRE_EMISION_PERSONAS_GENERAL_NEXUS = 'sp_pre_emision_personas_general_nexus';

/** Invocado al final del pre-SP Nexus personas (no desde nest-api directamente). */
export const SP_EMISION_PERSONAS_GENERAL_NEXUS = 'sp_emision_personas_general_nexus';

/** @deprecated Solo referencia documental / rollback QA */
export const SP_PRE_EMISION_PERSONAS_GENERAL_LEGACY = 'sp_pre_emision_Personas_General';
