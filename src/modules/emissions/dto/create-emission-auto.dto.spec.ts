import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmissionAutoDto } from './create-emission-auto.dto';
import { esTipoCedulaJuridica } from '../constants/persona-juridica.constants';

async function errorsFor(body: Record<string, unknown>, property: string) {
  const dto = plainToInstance(CreateEmissionAutoDto, body);
  const errors = await validate(dto);
  return errors.filter((e) => e.property === property);
}

describe('fnac_tomador según tipo de tomador', () => {
  it('es obligatorio para persona natural', async () => {
    expect(await errorsFor({ tipo_cedula_tomador: 'V' }, 'fnac_tomador')).toHaveLength(1);
  });

  it.each(['J', 'G', 'C', 'j'])('es opcional si el tomador es jurídico (%s)', async (tipo) => {
    expect(await errorsFor({ tipo_cedula_tomador: tipo }, 'fnac_tomador')).toHaveLength(0);
    expect(await errorsFor({ tipo_cedula_tomador: tipo, fnac_tomador: '' }, 'fnac_tomador')).toHaveLength(0);
    expect(await errorsFor({ tipo_cedula_tomador: tipo, fnac_tomador: null }, 'fnac_tomador')).toHaveLength(0);
  });

  it('si el jurídico la envía, debe ser una fecha válida', async () => {
    expect(await errorsFor({ tipo_cedula_tomador: 'J', fnac_tomador: 'no-es-fecha' }, 'fnac_tomador')).toHaveLength(1);
    expect(await errorsFor({ tipo_cedula_tomador: 'J', fnac_tomador: '1990-01-01' }, 'fnac_tomador')).toHaveLength(0);
  });

  it('conductor y beneficiario son opcionales', async () => {
    expect(await errorsFor({ tipo_cedula_tomador: 'J' }, 'conductor')).toHaveLength(0);
    expect(await errorsFor({ tipo_cedula_tomador: 'J' }, 'beneficiario')).toHaveLength(0);
  });
});

describe('esTipoCedulaJuridica', () => {
  it('reconoce J, G y C; no V, E ni P', () => {
    for (const t of ['J', 'G', 'C', 'j-123']) expect(esTipoCedulaJuridica(t)).toBe(true);
    for (const t of ['V', 'E', 'P', '', null, undefined]) expect(esTipoCedulaJuridica(t)).toBe(false);
  });
});
