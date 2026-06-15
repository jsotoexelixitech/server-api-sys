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

      // Función helper para estampar texto con fondo blanco para tapar las 'xxxxxx'
      const drawCleanText = (text: string, x: number, y: number, eraseWidth: number = 100, isBold = false) => {
        if (!text) return;
        // Dibujar parche blanco para borrar las XXXXXX de la plantilla
        firstPage.drawRectangle({
          x: x - 2,
          y: y - 2,
          width: eraseWidth,
          height: 12,
          color: rgb(1, 1, 1),
        });
        // Dibujar el texto encima
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
      drawCleanText(dto.poliza, 450, 785, 80);
      drawCleanText(dto.certificado, 450, 771, 80);
      drawCleanText(dto.fechaEmision, 450, 757, 100);

      // --- Caja de Sucursal e Intermediario ---
      drawCleanText(dto.sucursal, 60, 665, 200);
      drawCleanText(dto.intermediario || '80080 - LA MUNDIAL DE SEGUROS', 315, 665, 200);

      // --- Datos del Tomador ---
      drawCleanText(dto.tomadorNombre, 215, 600, 300);
      drawCleanText(dto.tomadorRif, 60, 574, 100);
      
      // Vigencia
      drawCleanText(dto.vigenciaDesde, 380, 574, 100);
      drawCleanText(dto.vigenciaHasta, 500, 574, 100);

      // --- Párrafo Central ---
      drawCleanText(dto.fechaEmision, 260, 549, 100); // Fecha de comienzo
      
      drawCleanText(dto.fechaEmision, 360, 485, 100); // a partir del...
      drawCleanText(dto.conductorNombre, 150, 471, 150, true); 
      drawCleanText(dto.conductorRif, 430, 471, 150, true);   

      // --- Firmas Footer ---
      drawCleanText(dto.tomadorNombre, 60, 215, 200);
      drawCleanText(dto.tomadorRif, 60, 195, 150);

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
