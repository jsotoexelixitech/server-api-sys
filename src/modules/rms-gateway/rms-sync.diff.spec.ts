import {
  decisionPorRol,
  diffPersonas,
  emptyFoto,
  fotoDesdeRms,
  fotoDesdeSis,
  norm,
  type FotoPersonas,
} from './rms-sync.diff';

const sis: FotoPersonas = {
  tomador: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran QA-SYNC' },
  asegurado: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran QA-SYNC' },
  beneficiario: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran QA-SYNC' },
};

describe('rms-sync.diff', () => {
  it('OK cuando Sis2000 y RMS coinciden', () => {
    const diffs = diffPersonas(sis, sis);
    expect(diffs.every((d) => d.estado === 'OK')).toBe(true);
    expect(decisionPorRol(diffs, 'tomador')).toBe('NADA');
  });

  it('FALTA_EN_RMS si RMS no tiene el nombre', () => {
    const rms: FotoPersonas = {
      tomador: emptyFoto(),
      asegurado: emptyFoto(),
      beneficiario: emptyFoto(),
    };
    const diffs = diffPersonas(sis, rms);
    expect(diffs.find((d) => d.campo === 'xcliente' && d.rol === 'tomador')?.estado).toBe(
      'FALTA_EN_RMS',
    );
    expect(decisionPorRol(diffs, 'tomador')).toBe('SIS_TO_RMS');
  });

  it('CONFLICTO si ambos cambiaron vs snapshot', () => {
    const snap: FotoPersonas = {
      tomador: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran' },
      asegurado: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran' },
      beneficiario: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran' },
    };
    const rms: FotoPersonas = {
      tomador: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran RMS' },
      asegurado: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran RMS' },
      beneficiario: { cci_rif: '28511812', icedula: 'V', xcliente: 'Jorge Duran RMS' },
    };
    const diffs = diffPersonas(sis, rms, snap);
    expect(diffs.find((d) => d.campo === 'xcliente')?.estado).toBe('CONFLICTO');
    expect(decisionPorRol(diffs, 'tomador')).toBe('CONFLICTO');
  });

  it('fotoDesdeRms usa razonsocial', () => {
    const rms = fotoDesdeRms(
      [
        {
          cedrif: '28511812',
          nacionalidad: 'V',
          razonsocial: 'JORGE DURAN QA-SYNC',
          nombreCompleto: 'JORGE DURAN QA-SYNC',
        },
      ],
      sis,
    );
    expect(norm(rms.tomador.xcliente)).toBe('JORGE DURAN QA-SYNC');
  });

  it('fotoDesdeSis lee ctenedor/maclient', () => {
    const foto = fotoDesdeSis({
      cci_rif_tomador: 28511812,
      icedula_tomador: 'V',
      xtomador: 'Jorge Duran',
      cci_rif_aseg: 28511812,
      icedula_aseg: 'V',
      xasegurado: 'Jorge Duran',
      cci_rif_ben: 28511812,
      icedula_ben: 'V',
      xbeneficiario: 'Jorge Duran',
    });
    expect(foto.tomador.cci_rif).toBe('28511812');
  });
});
