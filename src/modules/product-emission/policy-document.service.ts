import { Injectable, Logger } from '@nestjs/common';
import { PartyDto } from './dto/party.dto';
import {
  buildPolicyPdfFromTemplate,
  PolicyTemplateKey,
  resolvePolicyTemplateKey,
} from './policy-docx.util';

export interface PolicyDocumentCoverageRow {
  name: string;
  sumaAsegurada: number | null;
  prima: number | null;
}

export interface PolicyDocumentData {
  ramoPoliza: string;
  productName: string;
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
   * Genera el cuadro-póliza en PDF llenando dinámicamente (con
   * `docxtemplater`) la plantilla `.docx` real capturada del cuadro-póliza
   * (mismo diseño, tablas y textos legales, con la marca Exelixi), y
   * convirtiendo el resultado a PDF con LibreOffice. Las plantillas
   * "tageadas" se generan una sola vez con `scripts/tag-policy-templates.js`.
   */
  async buildPdf(
    data: PolicyDocumentData,
    productBranch: string,
  ): Promise<PolicyPdfResult> {
    const templateKey = resolvePolicyTemplateKey(productBranch);
    this.logger.log(
      `Generando cuadro-póliza PDF (layout=${templateKey}, póliza=${data.numeroPoliza}, ramo=${data.ramoPoliza})`,
    );
    try {
      const result = await buildPolicyPdfFromTemplate(templateKey, data);
      return { ...result, templateKey };
    } catch (error: any) {
      this.logger.error(
        `Error generando PDF del cuadro-póliza: ${error.message}`,
        error.stack,
      );
      throw new Error('No se pudo generar el PDF del cuadro-póliza.');
    }
  }
}
