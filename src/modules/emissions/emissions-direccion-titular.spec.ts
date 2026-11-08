import { EmissionsService } from './emissions.service';

/**
 * Sin estado/ciudad del titular el cliente queda sin dirección en Sis2000 y la membresía Arys falla.
 * En prod (nov-2026) el productor 80080 mandaba solo la dirección del tomador y el 348 la calle sin estado.
 */
describe('EmissionsService.completarDireccionTitular', () => {
  const service = Object.create(EmissionsService.prototype) as Record<string, unknown>;
  const run = (b: Record<string, unknown>) =>
    (service.completarDireccionTitular as (b: Record<string, unknown>) => string[]).call(service, b);
  const tomador = { xrif_tomador: '12345678', estado_tomador: 24, ciudad_tomador: 201, direccion_tomador: 'AV BOLIVAR' };

  it('acepta el titular con estado y ciudad propios', () => {
    expect(run({ ...tomador, xrif_titular: '99', estado_titular: 1, ciudad_titular: 128 })).toEqual([]);
  });

  it('titular distinto sin dirección: exige estado y ciudad (no usa la del tomador)', () => {
    const b: Record<string, unknown> = { ...tomador, xrif_titular: '87654321' };
    expect(run(b)).toEqual(['cestado_titular', 'cciudad_titular']);
    expect(b.cestado_titular).toBeUndefined();
  });

  it('código 0 cuenta como vacío (caso del productor 348: calle sin estado)', () => {
    expect(
      run({ ...tomador, xrif_titular: '87654321', estado_titular: 0, ciudad_titular: '0', direccion_titular: 'CALLE 1' }),
    ).toEqual(['cestado_titular', 'cciudad_titular']);
  });

  it('titular = tomador sin dirección: copia estado, ciudad y calle del tomador', () => {
    const b: Record<string, unknown> = { ...tomador, xrif_titular: 'V-12.345.678' };
    expect(run(b)).toEqual([]);
    expect(b).toMatchObject({ cestado_titular: 24, cciudad_titular: 201, xdireccion_titular: 'AV BOLIVAR' });
  });

  it('titular sin cédula propia se trata como el tomador', () => {
    const b: Record<string, unknown> = { ...tomador };
    expect(run(b)).toEqual([]);
    expect(b.estado_titular).toBe(24);
  });

  it('respeta la calle del titular si la trae', () => {
    const b: Record<string, unknown> = { ...tomador, direccion_titular: 'CALLE PROPIA' };
    run(b);
    expect(b.direccion_titular).toBe('CALLE PROPIA');
  });
});
