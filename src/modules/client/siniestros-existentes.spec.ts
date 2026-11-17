import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchSiniestrosExistentesDto } from './dto/search-siniestros-existentes.dto';
import { buildSiniestrosExistentesQuery, mapearSiniestrosExistentes } from './siniestros-existentes';

describe('buildSiniestrosExistentesQuery', () => {
  it('parametriza póliza, placa y fecha; nunca concatena valores en el SQL', () => {
    const { sql, params } = buildSiniestrosExistentesQuery({ cnpoliza: ' 18-1-1000031086 ', placa: 'at9a03m', focurrencia: '2026-08-10' });
    expect(params).toEqual([
      { name: 'cnpoliza', type: 'varchar', length: 30, value: '18-1-1000031086' },
      { name: 'placa', type: 'varchar', length: 20, value: 'AT9A03M' },
      { name: 'focurrencia', type: 'varchar', length: 10, value: '2026-08-10' },
    ]);
    expect(sql).toContain('RTRIM(s.cnpoliza) = @cnpoliza');
    expect(sql).toContain('RTRIM(vh.xplaca) = @placa');
    expect(sql).toContain('CONVERT(date, @focurrencia, 23)');
    expect(sql).not.toContain('AT9A03M');
    expect(sql).not.toContain('1000031086');
  });

  it('devuelve csinies como texto (numeric(19) pierde precisión en JS)', () => {
    expect(buildSiniestrosExistentesQuery({ placa: 'X1' }).sql).toContain('CAST(s.csinies AS varchar(20))');
  });

  it('por defecto filtra los abiertos (solo P); con soloAbiertos=false trae todos', () => {
    expect(buildSiniestrosExistentesQuery({ placa: 'X1' }).sql).toContain("s.istatsin IN ('P')");
    expect(buildSiniestrosExistentesQuery({ placa: 'X1', soloAbiertos: false }).sql).not.toContain('s.istatsin IN');
  });

  it('solo ramos de Automóvil y RCV, y exige póliza o placa', () => {
    expect(buildSiniestrosExistentesQuery({ cnpoliza: '18-1-1' }).sql).toContain('s.cramo IN (18, 26)');
    expect(() => buildSiniestrosExistentesQuery({ focurrencia: '2026-08-10' })).toThrow(RangeError);
  });
});

describe('mapearSiniestrosExistentes', () => {
  it('recorta textos, traduce el estatus y marca los abiertos', () => {
    const [p, z, x] = mapearSiniestrosExistentes([
      { csinies: '1800000000000002301', cnsinies: '18-0000000002160 ', cnpoliza: '18-1-1000031086 ', placa: 'AT9A03M ', cramo: 18, ccausa: 18126, xcausa: 'CHOQUE ', focurrencia: '2026-08-10', fnotificacion: '2026-08-11', istatsin: 'P' },
      { csinies: '1', cnsinies: '18-1', cnpoliza: '18-1-1', placa: null, cramo: 18, ccausa: null, xcausa: null, focurrencia: null, fnotificacion: null, istatsin: 'Z' },
      { csinies: '2', cnsinies: '18-2', cnpoliza: '18-1-1', placa: '', cramo: 26, ccausa: 1, xcausa: '', focurrencia: '2026-01-01', fnotificacion: '2026-01-01', istatsin: 'Q' },
    ]);
    expect(p).toMatchObject({ cnsinies: '18-0000000002160', placa: 'AT9A03M', xcausa: 'CHOQUE', estatus: 'Pendiente', abierto: true });
    expect(z).toMatchObject({ placa: null, ccausa: null, estatus: 'Rechazado', abierto: false });
    expect(x).toMatchObject({ placa: null, xcausa: null, estatus: 'Desconocido', abierto: false });
  });
});

describe('SearchSiniestrosExistentesDto', () => {
  const val = (o: object) => validate(plainToInstance(SearchSiniestrosExistentesDto, o));

  it('acepta póliza, placa en minúsculas, fecha y soloAbiertos como texto', async () => {
    const dto = plainToInstance(SearchSiniestrosExistentesDto, { cnpoliza: '18-1-1000031086', placa: 'at9a03m', focurrencia: '2026-08-10', soloAbiertos: 'false' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.placa).toBe('AT9A03M');
    expect(dto.soloAbiertos).toBe(false);
  });

  it('rechaza fechas mal formadas, caracteres raros y soloAbiertos inválido', async () => {
    expect(await val({ placa: 'AB1', focurrencia: '10/08/2026' })).not.toHaveLength(0);
    expect(await val({ placa: "AB1'; DROP" })).not.toHaveLength(0);
    expect(await val({ cnpoliza: '18 1' })).not.toHaveLength(0);
    expect(await val({ placa: 'AB1', soloAbiertos: 'quizas' })).not.toHaveLength(0);
  });
});
