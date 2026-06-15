import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
const pdfMake = require('pdfmake');
import { GenerateConductorPdfDto } from './dto/generate-conductor.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  async generateConductorHabitualPdf(dto: GenerateConductorPdfDto): Promise<{ pdfBytes: Uint8Array, filename: string }> {
    try {
      const fonts = {
        Roboto: {
          normal: path.join(__dirname, '..', '..', 'assets', 'fonts', 'Roboto-Regular.ttf'),
          bold: path.join(__dirname, '..', '..', 'assets', 'fonts', 'Roboto-Medium.ttf'),
          italics: path.join(__dirname, '..', '..', 'assets', 'fonts', 'Roboto-Regular.ttf'),
          bolditalics: path.join(__dirname, '..', '..', 'assets', 'fonts', 'Roboto-Medium.ttf')
        }
      };

      pdfMake.setFonts(fonts);

      const logoPath = path.join(__dirname, '..', '..', 'assets', 'logo.png');

      const docDefinition: any = {
        pageSize: 'LETTER',
        pageMargins: [40, 40, 40, 40],
        defaultStyle: {
          font: 'Roboto',
          fontSize: 9,
        },
        content: [
          // Header
          {
            columns: [
              fs.existsSync(logoPath) ? { image: logoPath, width: 120 } : { text: 'LA MUNDIAL', width: 120, fontSize: 16, bold: true },
              {
                text: 'ANEXO DE CONDUCTOR HABITUAL\n001',
                alignment: 'center',
                bold: true,
                fontSize: 12,
                margin: [0, 15, 0, 0]
              },
              {
                table: {
                  widths: [60, '*'],
                  body: [
                    [{ text: 'Póliza:', bold: true }, dto.poliza || ''],
                    [{ text: 'Certificado:', bold: true }, dto.certificado || ''],
                    [{ text: 'Fecha:', bold: true }, dto.fechaEmision || ''],
                    [{ text: 'Página:', bold: true }, '1 de 1'],
                  ]
                },
                width: 160
              }
            ],
            margin: [0, 0, 0, 15]
          },

          // Producto
          {
            table: {
              widths: [120, '*'],
              body: [
                [{ text: 'Producto:', bold: true, fillColor: '#eeeeee' }, { text: 'PÓLIZA DE VEHÍCULOS AUTOMÓVILES', bold: true }],
                [{ text: 'Sucursal / Agencia:\n' + (dto.sucursal || ''), margin: [0, 2, 0, 2] }, { text: 'Código del(los) Intermediario(s):\n' + (dto.intermediario || '80080 - LA MUNDIAL DE SEGUROS'), margin: [0, 2, 0, 2] }]
              ]
            },
            margin: [0, 0, 0, 10]
          },

          // Datos Tomador
          {
            table: {
              widths: ['*', '*'],
              body: [
                [{ text: 'DATOS DEL TOMADOR', bold: true, alignment: 'center', colSpan: 2, fillColor: '#dddddd' }, {}],
                [{ text: 'Apellido(s) y Nombre(s) o Razón Social:\n', bold: true }, { text: dto.tomadorNombre || '' }],
                [{ text: 'Cédula de Identidad / R.I.F:\n' + (dto.tomadorRif || ''), margin: [0, 2, 0, 2] }, { text: 'Vigencia del Anexo:   Desde: ' + (dto.vigenciaDesde || '') + '   Hasta: ' + (dto.vigenciaHasta || ''), margin: [0, 2, 0, 2] }]
              ]
            },
            margin: [0, 0, 0, 15]
          },

          // Párrafo Central
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    margin: [10, 10, 10, 10],
                    stack: [
                      { text: `Fecha de comienzo de efecto de este anexo: ${dto.fechaEmision || ''}`, margin: [0, 0, 0, 10] },
                      { text: `Por medio del presente Anexo a la Póliza arriba indicada, se hace constar y expresamente se conviene que, por solicitud del Asegurado Titular y previa aprobación del Asegurador, a partir del ${dto.fechaEmision || ''}, queda designado como conductor habitual ${dto.conductorNombre || ''}, titular del documento de identidad ${dto.conductorRif || ''}.`, margin: [0, 0, 0, 15] },
                      { text: 'CONDICIONES DE APLICACIÓN:', bold: true, margin: [0, 0, 0, 5] },
                      { text: 'El presente anexo, salvo lo dispuesto especialmente en su propio texto, se rige en todos sus efectos por las Condiciones Generales y Particulares de la Póliza a la cual se adhiere y si surgieren contradicciones entre los textos prevalecerán las condiciones de este anexo.', margin: [0, 0, 0, 5] },
                      { text: 'A menos que el presente anexo señale expresamente la vigencia de su efecto, lo dispuesto en el sé lo puede ser derogado mediante un nuevo anexo.', margin: [0, 0, 0, 5] },
                      { text: 'Se hace constar que este Anexo queda unido a la Póliza arriba mencionada de la cual forma parte integrante con sus demás condiciones, términos y excepciones.', margin: [0, 0, 0, 5] }
                    ]
                  }
                ]
              ]
            },
            margin: [0, 0, 0, 15]
          },

          // Firmas Footer
          {
            table: {
              widths: ['*', '*'],
              body: [
                [{ text: 'Por el Tomador', bold: true, alignment: 'center', fillColor: '#dddddd' }, { text: 'Por La Mundial de Seguros', bold: true, alignment: 'center', fillColor: '#dddddd' }],
                [
                  {
                    stack: [
                      { text: 'Nombre y Apellido / Razón Social:', bold: true },
                      { text: dto.tomadorNombre || '', margin: [0, 5, 0, 10] },
                      { text: 'C.I./R.I.F:', bold: true },
                      { text: dto.tomadorRif || '', margin: [0, 5, 0, 20] },
                      { text: 'Firma:', bold: true },
                      { text: '________________________', margin: [0, 15, 0, 0] }
                    ],
                    margin: [5, 5, 5, 5]
                  },
                  {
                    stack: [
                      { text: 'Representante:', bold: true, margin: [0, 0, 0, 10] },
                      { text: 'Nombre y Apellido:', bold: true, margin: [0, 0, 0, 10] },
                      { text: 'C.I./R.I.F:', bold: true, margin: [0, 0, 0, 20] },
                      { text: 'Firma:', bold: true },
                      { text: '________________________', margin: [0, 15, 0, 0] }
                    ],
                    margin: [5, 5, 5, 5]
                  }
                ]
              ]
            },
            margin: [0, 0, 0, 10]
          },
          {
            text: 'Asegurado',
            alignment: 'center',
            fontSize: 8
          }
        ]
      };

      const doc = pdfMake.createPdf(docDefinition);
      const pdfBuffer = await doc.getBuffer();
      
      const tempDir = path.join(process.cwd(), 'temp-pdfs');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const filename = `conductor_${Date.now()}.pdf`;
      const filePath = path.join(tempDir, filename);
      fs.writeFileSync(filePath, pdfBuffer);

      return { pdfBytes: new Uint8Array(pdfBuffer), filename };

    } catch (error: any) {
      this.logger.error(`Error generando PDF con pdfmake: ${error.message}`, error.stack);
      throw new Error('No se pudo generar el documento PDF.');
    }
  }
}
