import { Injectable } from '@nestjs/common';
import { mundialAdapter } from './mundial.adapter';
import { genericAdapter } from './generic.adapter';
import type { InsurerAdapter } from './insurer-adapter.types';

@Injectable()
export class InsurerAdapterFactory {
  private readonly adapters = new Map<string, InsurerAdapter>([
    [mundialAdapter.ADAPTER_CODIGO, mundialAdapter],
    [genericAdapter.ADAPTER_CODIGO, genericAdapter],
    ['MUNDIAL_MSSQL', mundialAdapter],
  ]);

  getAdapter(adapterCodigo?: string | null, tipoDb?: string | null): InsurerAdapter {
    const code = String(adapterCodigo || '')
      .trim()
      .toUpperCase();
    let adapter = (code && this.adapters.get(code)) || genericAdapter;
    if (code && !this.adapters.has(code)) {
      adapter = genericAdapter;
    }

    if (
      tipoDb &&
      typeof adapter.supportsTipoDb === 'function' &&
      !adapter.supportsTipoDb(tipoDb)
    ) {
      throw new Error(
        `Adapter ${adapterCodigo || genericAdapter.ADAPTER_CODIGO} no soporta motor ${tipoDb}. Motores: ${adapter.SUPPORTED_DB_TYPES.join(', ')}`,
      );
    }

    return adapter;
  }

  registerAdapter(adapter: InsurerAdapter): void {
    this.adapters.set(adapter.ADAPTER_CODIGO, adapter);
  }
}
