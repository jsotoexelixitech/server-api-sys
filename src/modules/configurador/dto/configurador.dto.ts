import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ProductoresQueryDto {
  @ApiPropertyOptional({ example: '80080', description: 'Filtro por nombre o código de productor' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

export class CanalesQueryDto {
  @ApiPropertyOptional({ example: 'FARMATODO', description: 'Filtro por nombre o código de canal alterno (ccanalalt)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

export class RamoQueryDto {
  @ApiProperty({ example: 28 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cramo: number;
}

export class TarifasQueryDto extends RamoQueryDto {
  @ApiProperty({ example: '70', description: 'Código de cobertura (macoberturas.ccobertura).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;
}

// ── Productos (maproductos, vía sp_CrearProducto) ───────────────────────────

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Alta de producto en Sis2000 con sp_CrearProducto (SP de La Mundial). Solo crea: no hay edición desde aquí. */
export class CrearProductoDto {
  @ApiProperty({ example: 'PRB01', description: 'Código nuevo de producto (máx. 40, sin espacios).' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^\S+$/, { message: 'cproducto no puede tener espacios.' })
  cproducto: string;

  @ApiProperty({ example: 28, description: 'Ramo (maramos.cramo); debe existir.' })
  @IsInt()
  @Min(1)
  @Max(32767)
  cramo: number;

  @ApiProperty({ example: 'PRODUCTO DE PRUEBA', description: 'Nombre del producto (máx. 60).' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  xdescripcion_l: string;

  @ApiPropertyOptional({ example: 'PROD PRUEBA', description: 'Nombre corto (máx. 15). Por defecto, el inicio del nombre.' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(15)
  xdescripcion_c?: string;

  @ApiPropertyOptional({ example: 'PRB', description: 'Abreviatura (máx. 5).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(5)
  xabreviatura?: string;

  @ApiPropertyOptional({ default: true, description: 'Lo venden productores.' })
  @IsOptional()
  @IsBoolean()
  iproductor?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Lo venden canales.' })
  @IsOptional()
  @IsBoolean()
  icanal?: boolean;

  @ApiPropertyOptional({ description: 'Descripción comercial (máx. 150).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  xdescripcion_prod?: string;

  @ApiPropertyOptional({ description: 'Tipo de ramo (ctiporamo de sp_CrearProducto).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  ctiporamo?: number;
}

// ── Coberturas (macoberturas) ────────────────────────────────────────────────

export class CrearCoberturaDto {
  @ApiProperty({ example: 28 })
  @IsInt()
  @Min(1)
  cramo: number;

  @ApiProperty({ example: '980', description: 'Código nuevo en el ramo (máx. 4).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccobertura: string;

  @ApiProperty({ example: 'RESPONSABILIDAD CIVIL CONTRACTUAL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  xdescripcion_l: string;

  @ApiPropertyOptional({ example: 'RC CONTRAC' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  xdescripcion_c?: string;

  @ApiPropertyOptional({ example: 'RCC' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  xabreviatura?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  bobligatoria?: boolean;

  @ApiPropertyOptional({ example: '$', default: '$' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  cmoneda?: string;

  @ApiPropertyOptional({ example: 'S', default: 'S', description: 'S = la cobertura suma a la suma asegurada.' })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  isuma?: string;

  @ApiPropertyOptional({ example: 'S', default: 'S' })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  isumarecibo?: string;

  @ApiPropertyOptional({ example: 6005, description: 'Contrato de reaseguro.' })
  @IsOptional()
  @IsInt()
  ccontrea?: number;

  @ApiPropertyOptional({ example: 102, description: 'Ramo de reaseguro (también usado como cramopcnd si no se envía).' })
  @IsOptional()
  @IsInt()
  cramorea?: number;

  @ApiPropertyOptional({ example: 102 })
  @IsOptional()
  @IsInt()
  cramopcnd?: number;

  @ApiPropertyOptional({ example: 32, description: 'Ramo interno.' })
  @IsOptional()
  @IsInt()
  cramoint?: number;

  @ApiPropertyOptional({ example: 223, description: 'Cobertura interna.' })
  @IsOptional()
  @IsInt()
  ccoberturaint?: number;
}

export class EditarCoberturaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) xdescripcion_l?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(15) xdescripcion_c?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5) xabreviatura?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bobligatoria?: boolean;
  @ApiPropertyOptional({ enum: ['V', 'I'], description: 'I = inactivar (no se borra).' })
  @IsOptional()
  @IsIn(['V', 'I'])
  iestado?: 'V' | 'I';

  @ApiPropertyOptional({ example: 6016, description: 'Contrato de reaseguro.' }) @IsOptional() @IsInt() ccontrea?: number;
  @ApiPropertyOptional({ example: 108, description: 'Ramo de reaseguro.' }) @IsOptional() @IsInt() cramorea?: number;
  @ApiPropertyOptional({ example: 125 }) @IsOptional() @IsInt() cramopcnd?: number;
}

// ── Tarifas (matarifa / matarifa_d) ─────────────────────────────────────────

export class DetalleTarifaDto {
  @ApiProperty({ example: '2026-01-01' })
  @Matches(FECHA)
  fdesde: string;

  @ApiPropertyOptional({ example: '2040-12-31' })
  @IsOptional()
  @Matches(FECHA)
  fhasta?: string;

  @ApiPropertyOptional({ example: 0.5, description: 'Tasa en % (0,5 = 0,5 %).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  pprima?: number;

  @ApiPropertyOptional({ example: 0, description: 'Prima fija (si no hay tasa).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mprima?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  msumamin?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  msumamax?: number;
}

export class CrearTarifaDto {
  @ApiProperty({ example: 28 }) @IsInt() @Min(1) cramo: number;
  @ApiProperty({ example: '980' }) @IsString() @IsNotEmpty() @MaxLength(4) ccober: string;
  @ApiProperty({ example: '1' }) @IsString() @IsNotEmpty() @MaxLength(4) ctarifa: string;

  @ApiProperty({ example: 'RC CONTRAC', description: 'Descripción corta (máx. 15).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  xtarifam: string;

  @ApiPropertyOptional({ example: 'RESPONSABILIDAD CIVIL CONTRACTUAL' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  xtarifa?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5) xabrev?: string;

  @ApiPropertyOptional({ default: false, description: 'Se guarda como matarifa.bobligatoria = T.' })
  @IsOptional()
  @IsBoolean()
  bobligatoria?: boolean;

  @ApiPropertyOptional({ type: [DetalleTarifaDto], description: 'Tasas con vigencia (matarifa_d).' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleTarifaDto)
  detalles?: DetalleTarifaDto[];
}

export class CrearDetalleTarifaDto extends DetalleTarifaDto {
  @ApiProperty({ example: 28 }) @IsInt() @Min(1) cramo: number;
  @ApiProperty({ example: '980' }) @IsString() @IsNotEmpty() @MaxLength(4) ccober: string;
  @ApiProperty({ example: '1' }) @IsString() @IsNotEmpty() @MaxLength(4) ctarifa: string;
}

export class EditarTarifaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(15) xtarifam?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) xtarifa?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bobligatoria?: boolean;
  @ApiPropertyOptional({ enum: ['V', 'I'] }) @IsOptional() @IsIn(['V', 'I']) iestado?: 'V' | 'I';
}

// ── Tablas de tasas por edad (mapltabedad / mapltabedad_d) ──────────────────

export class TramoEdadDto {
  @ApiProperty({ example: 18 }) @IsInt() @Min(0) nedad_min: number;
  @ApiProperty({ example: 40 }) @IsInt() @Min(0) nedad_max: number;

  @ApiProperty({ example: 0.449, description: 'Tasa en % (0,449 % = 4,49 ‰).' })
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  pprima: number;

  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) mprima?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) msuma?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) msumamax?: number;
}

export class TramosEdadDto {
  @ApiProperty({ type: [TramoEdadDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TramoEdadDto)
  tramos: TramoEdadDto[];
}

export class CrearTablaEdadDto extends TramosEdadDto {
  @ApiProperty({ example: 'TEMP1', description: 'Código (máx. 10). Es el ctablatar que usan los planes de personas.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  ctablaedad: string;

  @ApiProperty({ example: 'Muerte' }) @IsString() @IsNotEmpty() @MaxLength(60) xtablaedad: string;

  @ApiPropertyOptional({ example: 'TS', default: 'TS' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  iaplica_tabedad?: string;
}

// ── Planes (spMantPlanes) ────────────────────────────────────────────────────

export class ParentescoPlanDto {
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) cparen: number;
  @ApiProperty({ example: 'A', description: 'M, F o A (ambos).' }) @IsIn(['M', 'F', 'A']) csexo: string;
  @ApiProperty({ example: 'TEMP1', description: 'Tabla de tasas por edad (mapltabedad.ctablaedad).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  ctablatar: string;
  @ApiProperty({ example: 18 }) @IsInt() @Min(0) nedad_min: number;
  @ApiProperty({ example: 70 }) @IsInt() @Min(0) nedad_max: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) msuma?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) msumamax?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() @Min(0) mprima?: number;
}

export class CoberturaPlanDto {
  @ApiProperty({ example: '980' }) @IsString() @IsNotEmpty() @MaxLength(4) ccobertura: string;
  @ApiProperty({ example: '1' }) @IsString() @IsNotEmpty() @MaxLength(4) ctarifa: string;

  @ApiPropertyOptional({ example: 1000, description: 'Cosas: suma mínima.' }) @IsOptional() @IsNumber() @Min(0) msumamin?: number;
  @ApiPropertyOptional({ example: 50000, description: 'Cosas: suma asegurada del plan.' }) @IsOptional() @IsNumber() @Min(0) msumamax?: number;
  @ApiPropertyOptional({ example: 50, description: 'Cosas: prima fija.' }) @IsOptional() @IsNumber() @Min(0) mprima?: number;

  @ApiPropertyOptional({
    example: 0.5,
    description: 'Cosas: tasa en % sobre msumamax (maplantar.pprima). spMantPlanes no la recibe: se graba después.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  pprima?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Cosas: la suma asegurada se calcula al emitir (unidades × valor por unidad). Permite msumamax 0 y sin mprima/pprima. ' +
      'No se envía a spMantPlanes.',
  })
  @IsOptional()
  @IsBoolean()
  suma_calculada?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Personas: cobertura obligatoria.' }) @IsOptional() @IsBoolean() bobligatoria?: boolean;

  @ApiPropertyOptional({ type: [ParentescoPlanDto], description: 'Personas: parentescos con edades y tabla de tasas.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParentescoPlanDto)
  parentescos?: ParentescoPlanDto[];
}

export class FrecuenciaPlanDto {
  @ApiProperty({ example: 'A' }) @IsString() @IsNotEmpty() @MaxLength(6) ifrecuencia: string;
  @ApiProperty({ example: 'Anual' }) @IsString() @IsNotEmpty() @MaxLength(150) xfrecuencia: string;
  @ApiPropertyOptional({ example: 365 }) @IsOptional() @IsInt() @Min(1) ndias?: number;
}

export class PlanDto {
  @ApiProperty({ enum: ['cosas', 'personas'] }) @IsIn(['cosas', 'personas']) type: 'cosas' | 'personas';
  @ApiProperty({ example: 28 }) @IsInt() @Min(1) cramo: number;
  @ApiProperty({ example: 'PBT1' }) @IsString() @IsNotEmpty() @MaxLength(6) cplan: string;
  @ApiProperty({ example: 'PLAN PRUEBA' }) @IsString() @IsNotEmpty() @MaxLength(60) xplan: string;
  @ApiProperty({ example: '89', description: 'Producto (maproducto.cproducto).' }) @IsString() @IsNotEmpty() @MaxLength(6) cproducto: string;
  @ApiProperty({ example: '2026-01-01' }) @Matches(FECHA) fdesde: string;
  @ApiProperty({ example: '2099-12-31' }) @Matches(FECHA) fhasta: string;
  @ApiPropertyOptional({ example: '$', default: '$' }) @IsOptional() @IsString() @MaxLength(3) cmoneda?: string;
  @ApiPropertyOptional({ example: 'A', default: 'A', description: 'Tipo de renovación.' }) @IsOptional() @IsString() @MaxLength(1) itiporen?: string;
  @ApiPropertyOptional({ example: 'N', default: 'N' }) @IsOptional() @IsString() @MaxLength(1) idevolucion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) xobservacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() ctipo?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() ctenedor?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() cbeneficiario?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bnacional?: boolean;

  @ApiPropertyOptional({ default: false, description: 'true = todos los productores pueden venderlo.' })
  @IsOptional()
  @IsBoolean()
  all_productor?: boolean;

  @ApiPropertyOptional({ example: [80080], description: 'Productores que pueden venderlo (si no es all_productor).' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  productores?: number[];

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() all_canal?: boolean;
  @ApiPropertyOptional({ example: [], description: 'Canales alternos (ccanalalt).' }) @IsOptional() @IsArray() @IsInt({ each: true }) canales?: number[];

  @ApiProperty({ type: [CoberturaPlanDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CoberturaPlanDto)
  coberturas: CoberturaPlanDto[];

  @ApiProperty({ type: [FrecuenciaPlanDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FrecuenciaPlanDto)
  frecuencias: FrecuenciaPlanDto[];
}

// ── Canales alternos del plan (mausuplan centidad C) ─────────────────────────

/** Canales que se agregan al plan. Solo alta: los que ya están se dejan igual y nunca se borra ninguno. */
export class CanalesPlanDto {
  @ApiPropertyOptional({ default: false, description: 'true = todos los canales (fila con citem NULL).' })
  @IsOptional()
  @IsBoolean()
  all_canal?: boolean;

  @ApiPropertyOptional({ example: [8], description: 'Canales alternos (macanalalt.ccanalalt) a agregar.' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  canales?: number[];
}

// ── Proveedores del plan (maplprov_per) ──────────────────────────────────────

export class ProveedoresQueryDto {
  @ApiPropertyOptional({ example: 'VENEMERGENCIA', description: 'Filtro por nombre, RIF (cid) o cci_rif del proveedor' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

/** Clave de una fila de maplprov_per dentro del plan: proveedor, clave y vigencia desde. */
export class ClaveProveedorPlanDto {
  @ApiProperty({ example: 311624457, description: 'Proveedor (maclient.cci_rif).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cci_rif: number;

  @ApiProperty({ example: 1, description: 'Clave del proveedor (maclient_prov.cclave_num).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cclave_num: number;

  @ApiProperty({ example: '2026-01-01', description: 'Vigencia desde (parte de la clave de la fila).' })
  @Matches(FECHA)
  fdesde: string;
}

export class ProveedorPlanDto extends ClaveProveedorPlanDto {
  @ApiPropertyOptional({ example: '2040-12-31', description: 'Vigencia hasta. Vacía = sin fin.' })
  @IsOptional()
  @Matches(FECHA)
  fhasta?: string;

  @ApiPropertyOptional({ example: 1, description: 'Tipo de servicio (itiposerv).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  itiposerv?: number;

  @ApiPropertyOptional({ example: 0, description: 'Costo en la moneda local (mcosto).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mcosto?: number;

  @ApiPropertyOptional({ example: 11.05, description: 'Costo en divisa (mcostoext); al emitir se convierte con la tasa de la póliza.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mcostoext?: number;

  @ApiPropertyOptional({ example: '$', default: '$' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  cmoneda?: string;
}

/** Editar una fila existente: solo cambian vigencia hasta, tipo de servicio, costos y moneda. */
export class EditarProveedorPlanDto extends ClaveProveedorPlanDto {
  @ApiPropertyOptional({ example: '2040-12-31' }) @IsOptional() @Matches(FECHA) fhasta?: string;
  @ApiPropertyOptional({ default: false, description: 'true = vigencia sin fin (fhasta NULL); p. ej. al restaurar una baja.' })
  @IsOptional()
  @IsBoolean()
  sin_fin?: boolean;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) itiposerv?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) mcosto?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) mcostoext?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4) cmoneda?: string;
}

/** Baja = cerrar la vigencia (fhasta); la fila no se borra. */
export class BajaProveedorPlanDto extends ClaveProveedorPlanDto {
  @ApiPropertyOptional({ example: '2026-11-09', description: 'Último día vigente. Por defecto, hoy.' })
  @IsOptional()
  @Matches(FECHA)
  fhasta_baja?: string;
}
