import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmissionAutoDto } from '../../emissions/dto/create-emission-auto.dto';
import { CrearReciboEndosoDto } from '../../endosos/dto/crear-recibo.dto';
import { CalculatePlanCoberturasDto } from '../dto/calculate-plan-coberturas.dto';
import { GetCotizacionAutoDto } from '../dto/get-cotizacion-auto.dto';
import { AUTO_IFRECUENCIA_CUOTAS } from './auto-ifrecuencia.constants';

const erroresDe = async <T extends object>(dto: new () => T, body: object, campo: string) =>
  (await validate(plainToInstance(dto, body))).filter((e) => e.property === campo);

describe('frecuencia K (4 cuotas mensuales postpago)', () => {
  it('genera 4 recibos', () => {
    expect(AUTO_IFRECUENCIA_CUOTAS.K).toBe(4);
  });

  it('se acepta en cotización, cálculo y emisión', async () => {
    expect(await erroresDe(GetCotizacionAutoDto, { ifrecuencia: 'K' }, 'ifrecuencia')).toHaveLength(0);
    expect(await erroresDe(CalculatePlanCoberturasDto, { ifrecuencia: 'K' }, 'ifrecuencia')).toHaveLength(0);
    expect(await erroresDe(CreateEmissionAutoDto, { frecuencia: 'K' }, 'frecuencia')).toHaveLength(0);
  });

  it('no se acepta en endosos: sp_crear_recibo_endoso_nexus no la maneja', async () => {
    expect(await erroresDe(CrearReciboEndosoDto, { ifrecuencia: 'K' }, 'ifrecuencia')).toHaveLength(1);
  });
});
