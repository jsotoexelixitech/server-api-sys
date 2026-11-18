// Controllers y services de la fase 2 «editar todo» (frecuencias, quién vende, producto, plan sin JSON y edades),
// agrupados para que configurador.module.ts solo los esparza.

import { ConfiguradorEdadesController } from './configurador-edades.controller';
import { ConfiguradorEdadesService } from './configurador-edades.service';
import { ConfiguradorFrecuenciasController } from './configurador-frecuencias.controller';
import { ConfiguradorFrecuenciasService } from './configurador-frecuencias.service';
import { ConfiguradorPlanEdicionController } from './configurador-plan-edicion.controller';
import { ConfiguradorPlanEdicionService } from './configurador-plan-edicion.service';
import { ConfiguradorProductosEscrituraController } from './configurador-productos-escritura.controller';
import { ConfiguradorProductosEscrituraService } from './configurador-productos-escritura.service';
import { ConfiguradorQuienVendeController } from './configurador-quien-vende.controller';
import { ConfiguradorQuienVendeService } from './configurador-quien-vende.service';

export const CONTROLLERS_FASE2_EDICION = [
  ConfiguradorFrecuenciasController,
  ConfiguradorQuienVendeController,
  ConfiguradorProductosEscrituraController,
  ConfiguradorPlanEdicionController,
  ConfiguradorEdadesController,
];

export const PROVIDERS_FASE2_EDICION = [
  ConfiguradorFrecuenciasService,
  ConfiguradorQuienVendeService,
  ConfiguradorProductosEscrituraService,
  ConfiguradorPlanEdicionService,
  ConfiguradorEdadesService,
];
