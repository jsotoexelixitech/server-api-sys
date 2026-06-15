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
      drawText(dto.poliza, 460, 760);
      drawText(dto.certificado, 460, 745);
      drawText(dto.fechaEmision, 460, 730);

      // --- Caja de Sucursal e Intermediario ---
      drawText(dto.sucursal, 60, 655);
      drawText(dto.intermediario || '80080 - LA MUNDIAL DE SEGUROS', 315, 655);

      // --- Datos del Tomador ---
      drawText(dto.tomadorNombre, 215, 595);
      drawText(dto.tomadorRif, 60, 570);
      
      // Vigencia
      drawText(dto.vigenciaDesde, 380, 570);
      drawText(dto.vigenciaHasta, 500, 570);

      // --- Párrafo Central ---
      drawText(dto.fechaEmision, 260, 545); // Fecha de comienzo
      
      drawText(dto.fechaEmision, 380, 485); // a partir del...
      drawText(dto.conductorNombre, 180, 470, true); 
      drawText(dto.conductorRif, 430, 470, true);   

      // --- Firmas Footer ---
      drawText(dto.tomadorNombre, 60, 215);
      drawText(dto.tomadorRif, 60, 195);

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
