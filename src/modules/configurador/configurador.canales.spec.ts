import { sentenciasCanalesPlan } from './configurador.service';

describe('sentenciasCanalesPlan', () => {
  it('una sentencia por canal, solo INSERT si la fila no está, nunca DELETE ni UPDATE', () => {
    const s = sentenciasCanalesPlan(2);
    expect(s).toHaveLength(2);
    for (const [i, x] of s.entries()) {
      expect(x).toContain('IF NOT EXISTS');
      expect(x).toContain(`@it${i}`);
      expect(x).toContain("centidad = 'C' AND itipouso = 'A'");
      expect(x).toMatch(/INSERT INTO mausuplan/);
      expect(x).not.toMatch(/\bDELETE\b|\bUPDATE\b/i);
    }
  });

  it('sin canales no genera sentencias', () => {
    expect(sentenciasCanalesPlan(0)).toEqual([]);
  });
});
