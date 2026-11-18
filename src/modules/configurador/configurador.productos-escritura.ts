// Reglas puras de la escritura de productos (maproductos). Sin BD.
//
// sp_CrearProducto (SP de La Mundial, no se modifica) no recibe igestor; xform, cprog y los campos comerciales los
// recibe solo en algunas versiones del SP, así que el alta los graba con un UPDATE posterior en la misma transacción.

/** Tipo de cada campo editable de maproductos y su largo máximo en la tabla. */
export const CAMPOS_PRODUCTO = {
  xdescripcion_l: { tipo: 'texto', max: 60, obligatorio: true },
  xdescripcion_c: { tipo: 'texto', max: 15 },
  xabreviatura: { tipo: 'texto', max: 5 },
  iproductor: { tipo: 'bit' },
  icanal: { tipo: 'bit' },
  igestor: { tipo: 'bit' },
  xform: { tipo: 'texto', max: 50 },
  xdescripcion_prod: { tipo: 'texto', max: 150 },
  mmonto_inicial: { tipo: 'texto', max: 20 },
  norden: { tipo: 'entero' },
  xfraccionamiento: { tipo: 'texto', max: 200 },
  xurl_presentacion: { tipo: 'texto', max: 200 },
} as const;

export type CampoProducto = keyof typeof CAMPOS_PRODUCTO;
export const CAMPOS_EDITABLES_PRODUCTO = Object.keys(CAMPOS_PRODUCTO) as CampoProducto[];

/** Campos que el alta graba con el UPDATE posterior a sp_CrearProducto (además de cprog). */
export const CAMPOS_POST_ALTA: CampoProducto[] = [
  'igestor', 'xform', 'mmonto_inicial', 'norden', 'xfraccionamiento', 'xurl_presentacion',
];

export type ValorProducto = string | number | boolean | null;

/** Pares [campo, valor] presentes en el cuerpo (undefined = no se toca; null = vaciar, salvo los obligatorios). */
export function camposEnviados(dto: Partial<Record<CampoProducto, unknown>>, campos: CampoProducto[] = CAMPOS_EDITABLES_PRODUCTO) {
  const pares: Array<[CampoProducto, ValorProducto]> = [];
  for (const c of campos) {
    const v = dto[c];
    if (v === undefined) continue;
    if (v === null) { pares.push([c, null]); continue; }
    const def = CAMPOS_PRODUCTO[c];
    if (def.tipo === 'texto') pares.push([c, String(v).trim() || null]);
    else if (def.tipo === 'bit') pares.push([c, v === true || v === 1 || v === '1' || v === 'true']);
    else pares.push([c, Number(v)]);
  }
  return pares;
}

/** Errores de los campos enviados (largos, tipos, obligatorios no vacíos). */
export function validarCamposProducto(dto: Partial<Record<CampoProducto, unknown>>, campos: CampoProducto[] = CAMPOS_EDITABLES_PRODUCTO): string[] {
  const errores: string[] = [];
  for (const c of campos) {
    const v = dto[c];
    if (v === undefined) continue;
    const def = CAMPOS_PRODUCTO[c] as { tipo: string; max?: number; obligatorio?: boolean };
    if (v === null || (def.tipo === 'texto' && String(v).trim() === '')) {
      if (def.obligatorio) errores.push(`${c} no puede quedar vacío.`);
      continue;
    }
    if (def.tipo === 'texto') {
      if (typeof v !== 'string') errores.push(`${c} debe ser texto.`);
      else if (def.max && v.trim().length > def.max) errores.push(`${c} admite hasta ${def.max} caracteres.`);
    } else if (def.tipo === 'bit') {
      if (typeof v !== 'boolean') errores.push(`${c} debe ser true o false.`);
    } else if (!Number.isInteger(v)) {
      errores.push(`${c} debe ser un entero.`);
    }
  }
  return errores;
}

/** Edición: al menos un campo editable, cramo válido y campos correctos. */
export function validarEdicionProducto(dto: Partial<Record<CampoProducto, unknown>> & { cramo?: unknown }): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(dto.cramo) || Number(dto.cramo) <= 0) errores.push('cramo es obligatorio (el producto se edita solo en ese ramo).');
  if (!camposEnviados(dto).length) errores.push(`No hay campos para actualizar (${CAMPOS_EDITABLES_PRODUCTO.join(', ')}).`);
  return [...errores, ...validarCamposProducto(dto)];
}

/** Aviso (no error): los planes guardan cproducto en 6 caracteres (spMantPlanes @cproducto VARCHAR(6)). */
export function avisosCodigoProducto(cproducto: string): string[] {
  const c = String(cproducto ?? '').trim();
  return c.length > 6
    ? [`El código ${c} tiene ${c.length} caracteres: los planes solo admiten 6 (spMantPlanes), así que no se podrá usar en planes.`]
    : [];
}
