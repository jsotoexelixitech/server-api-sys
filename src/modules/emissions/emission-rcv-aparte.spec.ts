import { splitEmissionRows } from './emission-rcv-aparte';

const plan = { cnpoliza: '18-1-0130481059', cnrecibo: '18-100284519' };
const rcv = { cnpoliza: '26-1-0130481060', cnrecibo: '26-100284524' };

describe('splitEmissionRows', () => {
  it('plan sin RCV aparte: una sola póliza', () => {
    expect(splitEmissionRows({ recordsets: [[plan]] })).toEqual({ principal: plan, rcvAparte: null });
  });

  it('plan con RCV aparte: la principal es la del plan, no la última fila', () => {
    expect(splitEmissionRows({ recordsets: [[plan], [rcv]] })).toEqual({ principal: plan, rcvAparte: rcv });
  });

  it('ignora recordsets sin cnpoliza', () => {
    expect(splitEmissionRows({ recordsets: [[], [{ cnpoliza: '  ' }], [plan], [{ ok: 1 }]] })).toEqual({
      principal: plan,
      rcvAparte: null,
    });
  });

  it('varias filas de la misma póliza no son un RCV aparte y gana la última', () => {
    const repetida = { ...plan, qcuotas: 4 };
    expect(splitEmissionRows({ recordsets: [[plan], [repetida]] })).toEqual({
      principal: repetida,
      rcvAparte: null,
    });
  });

  it('sin recordsets usa recordset, y sin filas devuelve principal vacía', () => {
    expect(splitEmissionRows({ recordset: [plan] }).principal).toEqual(plan);
    expect(splitEmissionRows({})).toEqual({ principal: {}, rcvAparte: null });
  });
});
