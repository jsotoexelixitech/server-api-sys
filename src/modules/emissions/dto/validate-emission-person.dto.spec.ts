import { ValidationPipe } from '@nestjs/common';
import { ValidateEmissionPersonDto } from './validate-emission-person.dto';

/** Misma configuración que main.ts: whitelist quita lo que no está en el DTO. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: false,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

describe('ValidateEmissionPersonDto', () => {
  it('conserva nombre y apellido para reconocer a la misma persona con pasaporte', async () => {
    const out = (await pipe.transform(
      {
        cramo: 7, plan: 'EM2026', rif_titular: 1534532, fnac_titular: '1966-05-14',
        tipo_cedula_titular: 'P', cid_titular: 'P-EB1534532',
        nombre_titular: 'XUEBO', apellido_titular: 'WANG',
        nombre_tomador: 'ORINOCO MINERIA, C.A.', apellido_tomador: '',
        campo_extra: 'se descarta',
      },
      { type: 'body', metatype: ValidateEmissionPersonDto },
    )) as Record<string, unknown>;
    expect(out).toMatchObject({ nombre_titular: 'XUEBO', apellido_titular: 'WANG', nombre_tomador: 'ORINOCO MINERIA, C.A.' });
    expect(out).not.toHaveProperty('campo_extra');
  });
});
