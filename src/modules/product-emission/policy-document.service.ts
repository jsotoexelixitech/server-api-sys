import { Injectable, Logger } from '@nestjs/common';
import { PartyDto } from './dto/party.dto';
import {
  buildPolicyPdfFromTemplate,
  PolicyTemplateKey,
  resolvePolicyTemplateKey,
} from './policy-template.util';

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
}

export interface PolicyPdfResult {
  pdfBuffer: Buffer;
  docxBuffer: Buffer;
  templateKey: PolicyTemplateKey;
}

@Injectable()
export class PolicyDocumentService {
  private readonly logger = new Logger(PolicyDocumentService.name);

  /** Genera cuadro-póliza PDF con plantilla Sis2000 (.docx) + conversión LibreOffice. */
  async buildPdf(
    data: PolicyDocumentData,
    productBranch: string,
  ): Promise<PolicyPdfResult> {
    const templateKey = resolvePolicyTemplateKey(productBranch);
    this.logger.log(
      `Generando cuadro-póliza PDF (plantilla=${templateKey}, póliza=${data.numeroPoliza}, ramo=${data.ramoPoliza})`,
    );
    try {
      const result = await buildPolicyPdfFromTemplate(templateKey, data);
      return { ...result, templateKey };
    } catch (error: any) {
      this.logger.error(
        `Error generando PDF del cuadro-póliza: ${error.message}`,
        error.stack,
      );
      throw new Error(
        'No se pudo generar el PDF del cuadro-póliza. Verifique que LibreOffice (soffice) esté instalado en el servidor.',
      );
    }
  }
}
