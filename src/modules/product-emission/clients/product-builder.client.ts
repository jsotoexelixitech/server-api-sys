import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProductBuilderCoverage {
  id: string;
  name: string;
  description: string | null;
  isBasicMandatory: boolean;
  insuredSumFixed: number | null;
  insuredSumMin: number | null;
  insuredSumMax: number | null;
  tariffPremium: number | null;
}

export interface ProductBuilderPlan {
  name: string;
  description: string | null;
  badge: string | null;
  priceFactor: number;
  isRecommended: boolean;
  coverageIds: string[];
  coverageLabels: string[];
  sortOrder: number;
}

export interface ProductBuilderFormField {
  id: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: unknown;
  sortOrder: number;
  stepKey: string;
}

export interface ProductBuilderLegalDocument {
  documentType: string;
  title: string;
  content: string;
}

export interface ProductBuilderProduct {
  id: string;
  commercialName: string;
  internalCode: string;
  branch: string;
  currency: string;
  status: string;
  coverages: ProductBuilderCoverage[];
  productPlans: ProductBuilderPlan[];
  legalDocuments: ProductBuilderLegalDocument[];
}

/**
 * Cliente HTTP hacia proyecto-product-builder (server-api).
 * Solo LECTURA del catálogo (ramo/producto/planes/coberturas/legal).
 * Este módulo NO escribe nada en la BD de product-builder.
 */
@Injectable()
export class ProductBuilderClient {
  private readonly logger = new Logger(ProductBuilderClient.name);
  private readonly baseUrl: string;
  private readonly email?: string;
  private readonly password?: string;
  private cachedToken: string | null = null;

  constructor(private readonly config: ConfigService) {
    // proyecto-product-builder expone su API bajo el prefijo global "/api".
    this.baseUrl = (
      this.config.get<string>('PRODUCT_BUILDER_API_URL') ??
      'http://localhost:3001'
    ).replace(/\/$/, '');
    this.email = this.config.get<string>('PRODUCT_BUILDER_API_EMAIL')?.trim() || undefined;
    this.password = this.config.get<string>('PRODUCT_BUILDER_API_PASSWORD')?.trim() || undefined;
  }

  private async login(): Promise<string> {
    if (!this.email || !this.password) {
      throw new ServiceUnavailableException(
        'proyecto-product-builder exige autenticación (Bearer). Configure PRODUCT_BUILDER_API_EMAIL / PRODUCT_BUILDER_API_PASSWORD (cuenta de servicio) en el .env de nest-api.',
      );
    }
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `No se pudo autenticar contra proyecto-product-builder (${response.status}): ${body}`,
      );
    }
    const data = await response.json();
    this.cachedToken = data.accessToken;
    return this.cachedToken as string;
  }

  private async request(path: string): Promise<Response> {
    const url = `${this.baseUrl}/api${path}`;
    const doFetch = async () => {
      const token = this.cachedToken ?? (await this.login());
      return fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    };

    let response: Response;
    try {
      response = await doFetch();
      if (response.status === 401) {
        // Token expirado/cacheado inválido: reintenta una vez con login fresco.
        this.cachedToken = null;
        response = await doFetch();
      }
    } catch (error: any) {
      this.logger.error(
        `No se pudo contactar proyecto-product-builder en ${url}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo contactar el catálogo de proyecto-product-builder. Verifique PRODUCT_BUILDER_API_URL y que el servicio esté corriendo.',
      );
    }
    return response;
  }

  async getProduct(productId: string): Promise<ProductBuilderProduct> {
    const response = await this.request(`/products/${productId}`);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `proyecto-product-builder respondió ${response.status} para el producto ${productId}: ${body}`,
      );
    }

    return response.json() as Promise<ProductBuilderProduct>;
  }
}
