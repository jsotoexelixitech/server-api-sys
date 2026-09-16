import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { AseguradorasService } from './aseguradoras.service';
import { ListAseguradorasQueryDto } from './dto/list-aseguradoras-query.dto';
import {
  CreateAseguradoraDto,
  ProvisionAseguradoraDto,
  UpsertAseguradoraDto,
} from './dto/upsert-aseguradora.dto';

function isClientError(message: string): boolean {
  return /requerid|no encontrad|Ya existe|Campos/i.test(message);
}

@ApiTags(SWAGGER_TAGS.REPORTES)
@Controller('v1/aseguradoras')
@NestProtected(NEST_AUTH_SCOPES.REPORT_WRITE)
export class AseguradorasController {
  constructor(private readonly service: AseguradorasService) {}

  private rethrow(error: unknown): never {
    if (error instanceof BadRequestException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (isClientError(message)) {
      throw new BadRequestException(message);
    }
    throw error;
  }

  @Get('plantilla-origen-config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plantilla de origen_config (plug-in)' })
  @ApiCommonErrors()
  getPlantilla() {
    try {
      const data = this.service.getPlantillaOrigenConfig();
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post('provision')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Provisionar aseguradora (alta + test de conexión)',
  })
  @ApiBody({ type: ProvisionAseguradoraDto })
  @ApiCommonErrors()
  async provision(@Body() body: ProvisionAseguradoraDto) {
    try {
      const data = await this.service.provision(
        (body || {}) as unknown as Record<string, unknown>,
      );
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar aseguradoras (conexiones origen)' })
  @ApiCommonErrors()
  async list(@Query() query: ListAseguradorasQueryDto) {
    try {
      const data = await this.service.list(Boolean(query.includeInactive));
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener aseguradora por id' })
  @ApiCommonErrors()
  async getById(@Param('id', ParseIntPipe) id: number) {
    try {
      const data = await this.service.getById(id);
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear aseguradora' })
  @ApiBody({ type: CreateAseguradoraDto })
  @ApiCommonErrors()
  async create(@Body() body: CreateAseguradoraDto) {
    try {
      const data = await this.service.create(
        (body || {}) as unknown as Record<string, unknown>,
      );
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar aseguradora' })
  @ApiBody({ type: UpsertAseguradoraDto })
  @ApiCommonErrors()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertAseguradoraDto,
  ) {
    try {
      const data = await this.service.update(
        id,
        (body || {}) as unknown as Record<string, unknown>,
      );
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar aseguradora (soft delete)' })
  @ApiCommonErrors()
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    try {
      const data = await this.service.deactivate(id);
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post(':id/test-conexion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Probar conexión origen de una aseguradora' })
  @ApiCommonErrors()
  async testConnection(@Param('id', ParseIntPipe) id: number) {
    try {
      const data = await this.service.testConnection(id);
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }
}
