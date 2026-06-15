import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { GenerateConductorPdfDto } from './dto/generate-conductor.dto';

@ApiTags('Documentos')
@Controller('v1/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('conductor-habitual')
  @ApiOperation({ summary: 'Genera el anexo de Conductor Habitual en PDF' })
  @ApiResponse({ status: 201, description: 'PDF generado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos.' })
  @ApiResponse({ status: 500, description: 'Error interno al generar el documento.' })
  async generateConductorHabitual(
    @Body() dto: GenerateConductorPdfDto,
    @Res() res: Response,
  ) {
    try {
      const pdfBytes = await this.documentsService.generateConductorHabitualPdf(dto);
      
      const buffer = Buffer.from(pdfBytes);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="anexo_conductor.pdf"',
        'Content-Length': buffer.length,
      });

      res.status(HttpStatus.CREATED).send(buffer);
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'No se pudo generar el PDF del conductor habitual',
        error: error.message,
      });
    }
  }
}
