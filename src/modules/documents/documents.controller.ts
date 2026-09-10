import { Controller, Post, Get, Param, Body, Res, Req, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiTags, ApiOperation, ApiResponse, ApiBody, ApiHeader } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { DocumentsService } from './documents.service';
import { GenerateConductorPdfDto } from './dto/generate-conductor.dto';
import { Public } from '../auth/decorators/public.decorator';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { resolvePublicApiPaths } from '../../common/config/public-path';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('5. Documentos')
@Controller('v1/documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  /** Base pública para enlaces PDF abiertos desde el navegador del cliente. */
  private resolveDocumentPublicBase(): string {
    const publicPaths = resolvePublicApiPaths({
      publicApiPrefix: this.config.get<string>('PUBLIC_API_PREFIX'),
      publicApiOrigin: this.config.get<string>('PUBLIC_API_ORIGIN'),
    });
    if (publicPaths.prefix) {
      return publicPaths.publicBaseUrl.replace(/\/$/, '');
    }
    const explicit = String(this.config.get<string>('PUBLIC_URL') ?? '').trim().replace(/\/$/, '');
    if (explicit) return explicit;
    const port = this.config.get<number>('PORT', 3002);
    return `http://127.0.0.1:${port}`;
  }

  @Post('conductor-habitual')
  @NestProtected(NEST_AUTH_SCOPES.DOCUMENTS_WRITE)
  @ApiHeader({
    name: 'apikey',
    description: 'Clave de acceso a la API (requerida en emisión, cobranza y documentos en producción).',
    required: false,
  })
  @ApiOperation({
    summary: 'Anexo Conductor Habitual (PDF)',
    description:
      'Genera el PDF del anexo de conductor habitual tras la emisión, ' +
      'cuando el tomador declaró un conductor distinto. Devuelve URL para descarga.',
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
        url: 'https://nexusqa.exelixitech.com/nest-api-docs/api/v1/documents/pdf/conductor_1234567890.pdf',
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

      const baseUrl = this.resolveDocumentPublicBase();
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
  @Public()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Descarga o visualiza un PDF generado (enlace temporal sin auth)' })
  async getPdf(@Param('filename') filename: string, @Req() req: Request, @Res() res: Response) {
    const safeName = path.basename(String(filename ?? ''));
    if (!/^conductor_\d+\.pdf$/i.test(safeName)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Nombre de archivo no válido.',
      });
    }

    const tempDir = path.join(process.cwd(), 'temp-pdfs');
    const filePath = path.join(tempDir, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: 'El documento no existe o ha expirado.',
      });
    }

    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }
}
