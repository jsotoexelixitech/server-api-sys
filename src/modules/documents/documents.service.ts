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
      // 1. Fetch conductor details from La Mundial API
      const cedulaNumerica = String(dto.conductorRif).replace(/\D/g, '');
      if (cedulaNumerica) {
        try {
          const apiUrl = `https://qaapisys2000.lamundialdeseguros.com/PasarelaPago/api/v1/client/search/${cedulaNumerica}`;
          const response = await fetch(apiUrl, { method: 'GET', headers: { 'Accept': 'application/json' }, timeout: 15000 } as RequestInit);
          if (response.ok) {
            const result = await response.json();
            if (result.status === true && result.data && result.data.client && result.data.client.length > 0) {
              const clientData = result.data.client[0];
              // Overwrite DTO fields with real data from DB
              dto.conductorNombre = clientData.xcliente || `${clientData.xnombre} ${clientData.xapellido}`;
              if (clientData.cid) {
                dto.conductorRif = clientData.cid;
              }
              this.logger.log(`Datos de conductor actualizados desde el API: ${dto.conductorNombre} (${dto.conductorRif})`);
            }
          }
        } catch (apiErr: any) {
          this.logger.warn(`Fallo al consultar la API del conductor habitual: ${apiErr.message}`);
          // Continuamos con los datos del DTO si la API falla
        }
      }

      const fonts = {
        Helvetica: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique'
        }
      };

      pdfMake.setFonts(fonts);
      
      // Silenciar warnings de políticas de acceso en NodeJS
      if (typeof pdfMake.setUrlAccessPolicy === 'function') {
        pdfMake.setUrlAccessPolicy(() => true);
      }
      if (typeof pdfMake.setLocalAccessPolicy === 'function') {
        pdfMake.setLocalAccessPolicy(() => true);
      }

      const logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');

      const docDefinition: any = {
        pageSize: 'LETTER',
        pageMargins: [40, 40, 40, 40],
        defaultStyle: {
          font: 'Helvetica',
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

          // Datos Conductor
          {
            table: {
              widths: ['*', '*'],
              body: [
                [{ text: 'DATOS DEL CONDUCTOR HABITUAL', bold: true, alignment: 'center', colSpan: 2, fillColor: '#dddddd' }, {}],
                [{ text: 'Apellido(s) y Nombre(s) o Razón Social:\n', bold: true }, { text: dto.conductorNombre || '' }],
                [{ text: 'Cédula de Identidad / R.I.F:\n' + (dto.conductorRif || ''), margin: [0, 2, 0, 2] }, { text: 'Vigencia del Anexo:   Desde: ' + (dto.vigenciaDesde || '') + '   Hasta: ' + (dto.vigenciaHasta || ''), margin: [0, 2, 0, 2] }]
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
                [{ text: 'Por el Conductor Habitual', bold: true, alignment: 'center', fillColor: '#dddddd' }, { text: 'Por La Mundial de Seguros', bold: true, alignment: 'center', fillColor: '#dddddd' }],
                [
                  {
                    stack: [
                      { text: 'Nombre y Apellido / Razón Social:', bold: true },
                      { text: dto.conductorNombre || '', margin: [0, 5, 0, 10] },
                      { text: 'C.I./R.I.F:', bold: true },
                      { text: dto.conductorRif || '', margin: [0, 5, 0, 20] },
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
