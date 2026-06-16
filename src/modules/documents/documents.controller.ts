import { Controller, Post, Get, Param, Body, Res, Req, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { DocumentsService } from './documents.service';
import { GenerateConductorPdfDto } from './dto/generate-conductor.dto';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('Documentos')
@Controller('v1/documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documentsService: DocumentsService) {}

  @Post('conductor-habitual')
  @ApiOperation({ summary: 'Genera el anexo de Conductor Habitual en PDF' })
  @ApiResponse({ status: 201, description: 'PDF generado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos.' })
  @ApiResponse({ status: 500, description: 'Error interno al generar el documento.' })
  async generateConductorHabitual(
    @Body() dto: GenerateConductorPdfDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`[DocumentsController] Iniciando generación de anexo conductor para póliza ${dto.poliza}`);
      const { filename } = await this.documentsService.generateConductorHabitualPdf(dto);
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const fileUrl = `${baseUrl}/api/v1/documents/pdf/${filename}`;

      this.logger.log(`[DocumentsController] PDF generado con éxito. URL: ${fileUrl}`);
      res.status(HttpStatus.CREATED).json({
        success: true,
        message: 'PDF generado exitosamente',
        url: fileUrl
      });
    } catch (error: any) {
      this.logger.error(`[DocumentsController] Error generando anexo: ${error.message}`, error.stack);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'No se pudo generar el PDF del conductor habitual',
        error: error.message,
      });
    }
  }

  @Get('pdf/:filename')
  @ApiOperation({ summary: 'Descarga o visualiza un PDF generado' })
  async getPdf(@Param('filename') filename: string, @Req() req: Request, @Res() res: Response) {
    const tempDir = path.join(process.cwd(), 'temp-pdfs');
    const filePath = path.join(tempDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: 'El documento no existe o ha expirado.',
      });
    }

    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }
}
