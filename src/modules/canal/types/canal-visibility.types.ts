export type TipoEmisionCanal =
  | 'emit'
  | 'emit_pay'
  | 'emit_libre_pago'
  | 'emit_convenio'
  | 'emit_garage_plus';

export type TipoPagoCanal =
  | 'sypago'
  | 'meritop'
  | 'bancamiga'
  | 'ubii'
  | 'libre_pago';

export type MetodoPagoExelixi =
  | 'mobile'
  | 'otp'
  | 'domiciliacion'
  | 'mobile_bancamiga'
  | 'ubii';

export interface CanalVisibilityUi {
  mostrarPasoPago: boolean;
  requierePagoVerificado: boolean;
  metodosPago: MetodoPagoExelixi[];
  planesPermitidos: string[];
}

export interface CanalVisibilityResult {
  ccanalalt: number;
  cscanalalt?: number | null;
  cproducto?: string;
  cramo?: number;
  tipoEmision: TipoEmisionCanal | null;
  tipoPago: TipoPagoCanal[];
  planes: Array<{
    cplan: string;
    cramo: number;
    xplan?: string;
    cproducto?: string;
  }>;
  ui: CanalVisibilityUi;
}
