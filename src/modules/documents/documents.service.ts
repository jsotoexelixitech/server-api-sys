import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { GenerateConductorPdfDto } from './dto/generate-conductor.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  async generateConductorHabitualPdf(dto: GenerateConductorPdfDto): Promise<{ pdfBytes: Uint8Array, filename: string }> {
    try {
      // 1. Cargar el PDF base (plantilla)
      const templatePath = path.join(__dirname, '..', '..', 'assets', 'templates', 'conductor_habitual.pdf');
      const existingPdfBytes = fs.readFileSync(templatePath);

      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];

      // 2. Definir fuentes y colores
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const color = rgb(0, 0, 0); // Negro
      const size = 10;

      // Función helper para estampar texto
      const drawText = (text: string, x: number, y: number, isBold = false) => {
        if (!text) return;
        firstPage.drawText(text, {
          x,
          y,
          size,
          font: isBold ? fontBold : font,
          color,
        });
      };

      // 3. Coordenadas aproximadas (X, Y) - Origen (0,0) está en la esquina inferior izquierda.
      // Alto total = 792, Ancho total = 612

      // --- Caja Superior Derecha ---
      drawText(dto.poliza, 460, 752);
      drawText(dto.certificado, 460, 732);
      drawText(dto.fechaEmision, 460, 712);

      // --- Caja de Sucursal e Intermediario ---
      drawText(dto.sucursal, 60, 620);
      drawText(dto.intermediario || '80080 - LA MUNDIAL DE SEGUROS', 315, 620);

      // --- Datos del Tomador ---
      drawText(dto.tomadorNombre, 215, 570);
      drawText(dto.tomadorRif, 60, 545);
      
      // Vigencia
      drawText(dto.vigenciaDesde, 380, 545);
      drawText(dto.vigenciaHasta, 500, 545);

      // --- Párrafo Central ---
      drawText(dto.fechaEmision, 260, 500); // Fecha de comienzo
      
      drawText(dto.fechaEmision, 400, 470); // a partir del...
      drawText(dto.conductorNombre, 60, 455, true); 
      drawText(dto.conductorRif, 280, 455, true);   

      // --- Firmas Footer ---
      drawText(dto.tomadorNombre, 60, 215);
      drawText(dto.tomadorRif, 60, 175);

      const pdfBytes = await pdfDoc.save();

      // Guardar el PDF generado temporalmente para poder accederlo por URL
      const tempDir = path.join(process.cwd(), 'temp-pdfs');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const filename = `conductor_${Date.now()}.pdf`;
      const filePath = path.join(tempDir, filename);
      fs.writeFileSync(filePath, pdfBytes);

      return { pdfBytes, filename };
    } catch (error: any) {
      this.logger.error(`Error generando PDF: ${error.message}`, error.stack);
      throw new Error('No se pudo generar el documento PDF.');
    }
  }
}
