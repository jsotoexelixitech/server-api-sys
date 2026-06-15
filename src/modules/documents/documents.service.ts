import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { GenerateConductorPdfDto } from './dto/generate-conductor.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  async generateConductorHabitualPdf(dto: GenerateConductorPdfDto): Promise<Uint8Array> {
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
      drawText(dto.poliza, 460, 725);
      drawText(dto.certificado, 460, 705);
      drawText(dto.fechaEmision, 460, 685);

      // --- Caja de Sucursal e Intermediario ---
      drawText(dto.sucursal, 60, 608);
      drawText(dto.intermediario || '80080 - LA MUNDIAL DE SEGUROS', 315, 608);

      // --- Datos del Tomador ---
      drawText(dto.tomadorNombre, 215, 555);
      drawText(dto.tomadorRif, 60, 528);
      
      // Vigencia (Asumiendo que el texto "Desde:" y "Hasta:" ya está en el PDF y solo llenamos la fecha)
      drawText(dto.vigenciaDesde, 380, 528);
      drawText(dto.vigenciaHasta, 500, 528);

      // --- Párrafo Central ---
      // Fecha de comienzo
      drawText(dto.fechaEmision, 260, 482);
      
      // En la línea del párrafo donde se designa al conductor:
      // Estas coordenadas deben afinarse visualmente luego.
      drawText(dto.fechaEmision, 400, 452); // "a partir del [fecha]"
      drawText(dto.conductorNombre, 60, 437, true); // Nombre en la siguiente línea
      drawText(dto.conductorRif, 280, 437, true);   // Cédula en la misma línea

      // --- Firmas Footer ---
      // Tomador
      drawText(dto.tomadorNombre, 60, 195);
      drawText(dto.tomadorRif, 60, 155);

      // Guardar documento
      const pdfBytes = await pdfDoc.save();
      return pdfBytes;
    } catch (error: any) {
      this.logger.error(`Error generando PDF: ${error.message}`, error.stack);
      throw new Error('No se pudo generar el documento PDF.');
    }
  }
}
