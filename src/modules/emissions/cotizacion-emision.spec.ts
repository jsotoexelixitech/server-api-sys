import { BadRequestException } from '@nestjs/common';
import {
  cotizacionErrorFromMessage,
  parseCcertiCotizacion,
  parseCprocesCotizacion,
  parseMprimaEsperada,
} from './cotizacion-emision';

describe('emisión desde cotización de SysIP', () => {
  describe('parseCprocesCotizacion', () => {
    it('sin cproces devuelve null (flujo de siempre)', () => {
      expect(parseCprocesCotizacion({})).toBeNull();
      expect(parseCprocesCotizacion({ cproces: '  ' })).toBeNull();
      expect(parseCprocesCotizacion({ cproces: null })).toBeNull();
    });

    it('acepta cproces o cproces_cotizacion, como texto o número', () => {
      expect(parseCprocesCotizacion({ cproces: '2026000236751' })).toBe(2026000236751);
      expect(parseCprocesCotizacion({ cproces_cotizacion: 2026000236751 })).toBe(2026000236751);
    });

    it('rechaza valores que no son un cproces', () => {
      for (const cproces of ['abc', '-5', '0', '12345678901234', '2026.5']) {
        expect(() => parseCprocesCotizacion({ cproces })).toThrow(BadRequestException);
      }
    });
  });

  describe('parseCcertiCotizacion', () => {
    const cproces = 2026000236751;

    it('sin ccerti devuelve null: el SP emite la única opción', () => {
      expect(parseCcertiCotizacion({}, cproces)).toBeNull();
      expect(parseCcertiCotizacion({ ccerti: ' ' }, cproces)).toBeNull();
      expect(parseCcertiCotizacion({}, null)).toBeNull();
    });

    it('acepta ccerti o ccerti_cotizacion, como texto o número', () => {
      expect(parseCcertiCotizacion({ ccerti: '2' }, cproces)).toBe(2);
      expect(parseCcertiCotizacion({ ccerti_cotizacion: 3 }, cproces)).toBe(3);
    });

    it('rechaza valores inválidos', () => {
      for (const ccerti of ['abc', '-1', '1.5', '1234567890']) {
        expect(() => parseCcertiCotizacion({ ccerti }, cproces)).toThrow(BadRequestException);
      }
    });

    it('rechaza ccerti sin cotización', () => {
      expect(() => parseCcertiCotizacion({ ccerti: 2 }, null)).toThrow(BadRequestException);
    });

    it('rechaza ccerti 0', () => {
      expect(() => parseCcertiCotizacion({ ccerti_cotizacion: 0 }, cproces)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('parseMprimaEsperada', () => {
    const cproces = 2026000236751;

    it('sin mprima_esperada devuelve null', () => {
      expect(parseMprimaEsperada({}, cproces)).toBeNull();
      expect(parseMprimaEsperada({ mprima_esperada: null }, cproces)).toBeNull();
      expect(parseMprimaEsperada({}, null)).toBeNull();
    });

    it('acepta número o texto con hasta 2 decimales', () => {
      expect(parseMprimaEsperada({ mprima_esperada: 152.4 }, cproces)).toBe(152.4);
      expect(parseMprimaEsperada({ mprima_esperada: '1980.00' }, cproces)).toBe(1980);
      expect(parseMprimaEsperada({ mprima_esperada: 36 }, cproces)).toBe(36);
    });

    it('rechaza montos inválidos', () => {
      for (const mprima_esperada of ['abc', '0', '-5', '10.123', '1,5', 0]) {
        expect(() => parseMprimaEsperada({ mprima_esperada }, cproces)).toThrow(BadRequestException);
      }
    });

    it('rechaza mprima_esperada sin cotización', () => {
      expect(() => parseMprimaEsperada({ mprima_esperada: 100 }, null)).toThrow(BadRequestException);
    });
  });

  describe('cotizacionErrorFromMessage', () => {
    // El CATCH de sp_pre_emision relanza con THROW 99001 y el mensaje original.
    it('COTIZACION_NO_EXISTE → 400 con code', () => {
      const err = cotizacionErrorFromMessage(
        'COTIZACION_NO_EXISTE: no existe una cotización de automóvil con el número 123.',
      );
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err?.getResponse()).toEqual({
        success: false,
        code: 'COTIZACION_NO_EXISTE',
        message: 'no existe una cotización de automóvil con el número 123.',
      });
    });

    it('COTIZACION_EMITIDA → 400', () => {
      const err = cotizacionErrorFromMessage(
        'COTIZACION_EMITIDA: la cotización 123 ya fue emitida (póliza 18-1-100074181).',
      );
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err?.getResponse() as { message: string }).message).toContain('18-1-100074181');
    });

    it('COTIZACION_NO_COINCIDE → 400, aunque venga con prefijo del driver', () => {
      const err = cotizacionErrorFromMessage(
        'Error SP: COTIZACION_NO_COINCIDE: el plan enviado (Auto) no es el de la cotización (AutoIV).',
      );
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err?.getResponse() as { code: string }).code).toBe('COTIZACION_NO_COINCIDE');
    });

    it('otros errores del SP no se traducen', () => {
      expect(cotizacionErrorFromMessage('Se ha detectado una póliza vigente con la misma placa')).toBeNull();
    });
  });
});
