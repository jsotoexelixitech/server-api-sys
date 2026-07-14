import { Controller, Post, Get, Param, Body, Res, Req, HttpStatus, Logger } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags, ApiOperation, ApiResponse, ApiBody, ApiSecurity, ApiHeader } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { DocumentsService } from './documents.service';
import { GenerateConductorPdfDto } from './dto/generate-conductor.dto';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('5. Documentos (post-emisión)')
@Controller('v1/documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documentsService: DocumentsService) {}

  @Post('conductor-habitual')
  @ApiSecurity('apikey')
  @ApiHeader({
    name: 'apikey',
    description: 'Token del canal (`maclient_api.xtoken`).',
    required: false,
  })
  @ApiOperation({
    summary: 'Paso 8 · Anexo Conductor Habitual (PDF)',
    description:
      'Genera PDF tras la emisión. Lo invoca **emision-api** cuando el tomador declaró conductor distinto. ' +
      'Devuelve URL para descarga.',
    operationId: 'rcvConductorHabitualPdf',
  })
  @ApiBody({ type: GenerateConductorPdfDto })
  @ApiResponse({
    status: 201,
    description: 'PDF generado.',
    schema: {
      example: {
        success: true,
        message: 'PDF generado exitosamente',
        url: 'http://192.168.8.120:3002/api/v1/documents/pdf/conductor-18-1-0000078926.pdf',
      },
    },
  })
  async generateConductorHabitual(
    @Body() dto: GenerateConductorPdfDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`[DocumentsController] Iniciando generación de anexo conductor para póliza ${dto.poliza}`);
      const { filename } = await this.documentsService.generateConductorHabitualPdf(dto);
      
      const baseUrl = process.env.PUBLIC_URL || `http://192.168.8.120:${process.env.PORT || 3002}`;
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
  @ApiExcludeEndpoint()
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
