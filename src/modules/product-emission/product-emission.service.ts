import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ProductEmissionPrismaService } from './prisma/product-emission-prisma.service';
import {
  ProductBuilderClient,
  ProductBuilderPlan,
  ProductBuilderProduct,
} from './clients/product-builder.client';
import { EmitGenericPolicyDto } from './dto/emit-generic-policy.dto';
import { QuoteGenericPolicyDto } from './dto/quote-generic-policy.dto';
import { branchToRamoPolizaLabel } from './product-branch-labels.util';
import {
  PolicyDocumentData,
  PolicyDocumentService,
} from './policy-document.service';

interface ResolvedQuote {
  product: ProductBuilderProduct;
  plan: ProductBuilderPlan;
  ramoPoliza: string;
  primaTotal: number;
  coberturas: {
    id: string;
    name: string;
    sumaAsegurada: number | null;
    prima: number | null;
  }[];
}

@Injectable()
export class ProductEmissionService {
  private readonly logger = new Logger(ProductEmissionService.name);
  private readonly docsDir: string;

  constructor(
    private readonly prisma: ProductEmissionPrismaService,
    private readonly config: ConfigService,
    private readonly catalog: ProductBuilderClient,
    private readonly documentBuilder: PolicyDocumentService,
  ) {
    this.docsDir = path.join(
      process.cwd(),
      this.config.get<string>('PRODUCT_EMISSION_DOCS_DIR') ??
        'temp-product-emission-docs',
    );
    if (!fs.existsSync(this.docsDir)) {
      fs.mkdirSync(this.docsDir, { recursive: true });
    }
  }

  private resolvePlan(
    product: ProductBuilderProduct,
    planName?: string,
  ): ProductBuilderPlan {
    if (!product.productPlans?.length) {
      throw new BadRequestException(
        `El producto "${product.commercialName}" no tiene planes comerciales configurados en product-builder.`,
      );
    }
    if (planName) {
      const found = product.productPlans.find(
        (p) => p.name.toLowerCase() === planName.toLowerCase(),
      );
      if (!found) {
        throw new BadRequestException(
          `El plan "${planName}" no existe para este producto. Planes disponibles: ${product.productPlans
            .map((p) => p.name)
            .join(', ')}`,
        );
      }
      return found;
    }
    return (
      product.productPlans.find((p) => p.isRecommended) ??
      product.productPlans[0]
    );
  }

  private async resolveQuote(
    productId: string,
    planName?: string,
  ): Promise<ResolvedQuote> {
    const product = await this.catalog.getProduct(productId);
    const plan = this.resolvePlan(product, planName);

    const coberturas = plan.coverageIds.map((coverageId, idx) => {
      const coverage = product.coverages.find((c) => c.id === coverageId);
      return {
        id: coverageId,
        name: coverage?.name ?? plan.coverageLabels[idx] ?? 'Cobertura',
        sumaAsegurada:
          coverage?.insuredSumFixed ?? coverage?.insuredSumMax ?? null,
        prima: coverage?.tariffPremium ?? null,
      };
    });

    // priceFactor en product-builder = suma de primas del plan (ver ProductsService.replacePlans).
    const primaTotal = Number(plan.priceFactor);

    return {
      product,
      plan,
      ramoPoliza: branchToRamoPolizaLabel(product.branch),
      primaTotal,
      coberturas,
    };
  }

  /** Cotización previa: catálogo resuelto + prima, sin persistir nada. */
  async quote(dto: QuoteGenericPolicyDto) {
    const resolved = await this.resolveQuote(dto.productId, dto.planName);
    return {
      productId: resolved.product.id,
      productName: resolved.product.commercialName,
      productBranch: resolved.product.branch,
      ramoPoliza: resolved.ramoPoliza,
      moneda: resolved.product.currency,
      planName: resolved.plan.name,
      planesDisponibles: resolved.product.productPlans.map((p) => p.name),
      primaTotal: resolved.primaTotal,
      coberturas: resolved.coberturas,
    };
  }

  /** Validaciones mínimas para poder emitir (no reemplaza el guardrail SUDEASEG de product-builder). */
  async validate(dto: QuoteGenericPolicyDto) {
    const violations: { code: string; message: string }[] = [];
    let resolved: ResolvedQuote | null = null;
    try {
      resolved = await this.resolveQuote(dto.productId, dto.planName);
    } catch (error: any) {
      violations.push({ code: 'CATALOG_ERROR', message: error.message });
      return { valid: false, violations };
    }

    if (!resolved.coberturas.length) {
      violations.push({
        code: 'NO_COVERAGES',
        message: 'El plan seleccionado no tiene coberturas asociadas.',
      });
    }
    if (!resolved.primaTotal || resolved.primaTotal <= 0) {
      violations.push({
        code: 'INVALID_PREMIUM',
        message: 'La prima calculada del plan es inválida (<= 0).',
      });
    }
    if (resolved.product.status === 'DRAFT') {
      violations.push({
        code: 'PRODUCT_DRAFT_WARNING',
        message:
          'El producto está en estado DRAFT en product-builder (permitido en pruebas, no recomendado en producción).',
      });
    }

    return {
      valid: violations.every((v) => v.code === 'PRODUCT_DRAFT_WARNING'),
      violations,
    };
  }

  /** Emite la póliza: genera el documento, la guarda en BD (schema product_emission) y devuelve la URL. */
  async emit(dto: EmitGenericPolicyDto, publicBaseUrl: string) {
    const resolved = await this.resolveQuote(dto.productId, dto.planName);

    const fechaEmision = dto.fechaEmision
      ? new Date(dto.fechaEmision)
      : new Date();
    const vigenciaDias = dto.vigenciaDias ?? 365;
    const vigenciaDesde = fechaEmision;
    const vigenciaHasta = new Date(fechaEmision);
    vigenciaHasta.setDate(vigenciaHasta.getDate() + vigenciaDias);

    const numeroPoliza = await this.nextPolicyNumber(resolved.product.branch);

    const legalDoc = resolved.product.legalDocuments?.find(
      (d) => d.documentType === 'CUADRO_RECIBO',
    ) ??
      resolved.product.legalDocuments?.find((d) => d.documentType === 'POLIZA');

    const documentData: PolicyDocumentData = {
      ramoPoliza: resolved.ramoPoliza,
      productName: resolved.product.commercialName,
      numeroPoliza,
      planName: resolved.plan.name,
      moneda: resolved.product.currency,
      primaTotal: resolved.primaTotal,
      fechaEmision,
      vigenciaDesde,
      vigenciaHasta,
      tomador: dto.tomador,
      asegurado: dto.asegurado,
      beneficiarios: dto.beneficiarios ?? [],
      riskData: dto.riskData ?? {},
      coberturas: resolved.coberturas.map((c) => ({
        name: c.name,
        sumaAsegurada: c.sumaAsegurada,
        prima: c.prima,
      })),
      legalNoticeTitle: legalDoc?.title,
      legalNoticeText: legalDoc?.content,
    };

    const { pdfBuffer } = await this.documentBuilder.buildPdf(
      documentData,
      resolved.product.branch,
    );
    const filename = `poliza_${numeroPoliza.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    fs.writeFileSync(path.join(this.docsDir, filename), pdfBuffer);

    const documentUrl = `${publicBaseUrl}/api/v1/product-emission/documents/${filename}`;

    if (!this.prisma.isEnabled()) {
      this.logger.warn(
        'NEST_PG_DATABASE_URL no configurado: la póliza NO se persistió en BD (solo se generó el documento).',
      );
      return {
        persisted: false,
        numeroPoliza,
        ramoPoliza: resolved.ramoPoliza,
        productName: resolved.product.commercialName,
        planName: resolved.plan.name,
        primaTotal: resolved.primaTotal,
        moneda: resolved.product.currency,
        fechaEmision,
        vigenciaDesde,
        vigenciaHasta,
        documentUrl,
      };
    }

    const policy = await this.prisma.genericPolicy.create({
      data: {
        numeroPoliza,
        productId: resolved.product.id,
        productBranch: resolved.product.branch,
        ramoPoliza: resolved.ramoPoliza,
        productName: resolved.product.commercialName,
        planName: resolved.plan.name,
        moneda: resolved.product.currency,
        primaTotal: resolved.primaTotal,
        fechaEmision,
        vigenciaDesde,
        vigenciaHasta,
        tomador: dto.tomador as any,
        asegurado: dto.asegurado as any,
        beneficiarios: (dto.beneficiarios ?? []) as any,
        riskData: (dto.riskData ?? {}) as any,
        coberturas: resolved.coberturas as any,
        documentFilename: filename,
        documentUrl,
      },
    });

    return { persisted: true, ...policy, documentUrl };
  }

  async findByNumero(numeroPoliza: string) {
    if (!this.prisma.isEnabled()) {
      throw new BadRequestException(
        'NEST_PG_DATABASE_URL no configurado: no hay pólizas persistidas para consultar.',
      );
    }
    const policy = await this.prisma.genericPolicy.findUnique({
      where: { numeroPoliza },
    });
    if (!policy) {
      throw new NotFoundException(`Póliza ${numeroPoliza} no encontrada.`);
    }
    return policy;
  }

  getDocsDir(): string {
    return this.docsDir;
  }

  private async nextPolicyNumber(productBranch: string): Promise<string> {
    const prefix = productBranch.slice(0, 3).toUpperCase();
    const year = new Date().getFullYear();

    if (!this.prisma.isEnabled()) {
      return `${prefix}-${year}-${Date.now()}`;
    }

    const counter = await this.prisma.genericPolicyCounter.upsert({
      where: { productBranch },
      create: { productBranch, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    return `${prefix}-${year}-${String(counter.lastNumber).padStart(8, '0')}`;
  }
}
