import { Injectable, Logger } from '@nestjs/common';
import { PartyDto } from './dto/party.dto';
import { htmlToPdfBuffer } from './policy-html-pdf.util';
import { renderPolicyHtml } from './policy-html.renderer';
import { PolicyTemplateKey, resolvePolicyTemplateKey } from './policy-template.util';

export interface PolicyDocumentCoverageRow {
  name: string;
  sumaAsegurada: number | null;
  prima: number | null;
}

export interface PolicyDocumentData {
  ramoPoliza: string;
  productName: string;
  productInternalCode?: string;
  policyTemplate?: PolicyTemplateKey;
  numeroPoliza: string;
  planName: string;
  moneda: string;
  primaTotal: number;
  fechaEmision: Date;
  vigenciaDesde: Date;
  vigenciaHasta: Date;
  tomador: PartyDto;
  asegurado: PartyDto;
  beneficiarios: PartyDto[];
  riskData: Record<string, unknown>;
  coberturas: PolicyDocumentCoverageRow[];
  legalNoticeTitle?: string;
  legalNoticeText?: string;
  estatus?: string;
  canalVenta?: string;
  intermediario?: string;
}

export interface PolicyPdfResult {
  pdfBuffer: Buffer;
  templateKey: PolicyTemplateKey;
}

@Injectable()
export class PolicyDocumentService {
  private readonly logger = new Logger(PolicyDocumentService.name);

  /**
   * Genera el cuadro-póliza en PDF renderizando plantillas HTML (port de PHP)
   * con datos de emisión y convirtiendo a PDF con Puppeteer/Chromium.
   */
  async buildPdf(
    data: PolicyDocumentData,
    productBranch: string,
  ): Promise<PolicyPdfResult> {
    const templateKey = resolvePolicyTemplateKey(productBranch, {
      productName: data.productName,
      internalCode: data.productInternalCode,
      templateOverride: data.policyTemplate,
    });
    this.logger.log(
      `Generando cuadro-póliza PDF (html=${templateKey}, póliza=${data.numeroPoliza}, ramo=${data.ramoPoliza})`,
    );
    try {
      const html = renderPolicyHtml(data, templateKey);
      const pdfBuffer = await htmlToPdfBuffer(html);
      return { pdfBuffer, templateKey };
    } catch (error: any) {
      this.logger.error(
        `Error generando PDF del cuadro-póliza: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `No se pudo generar el PDF del cuadro-póliza: ${error.message}`,
      );
    }
  }
}
