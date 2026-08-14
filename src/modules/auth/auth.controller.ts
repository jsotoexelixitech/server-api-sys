import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { Public } from './decorators/public.decorator';
import { RefreshRequestDto, TokenRequestDto } from './dto/auth.dto';
import { NestAuthService } from './nest-auth.service';

@ApiTags('0. Autenticación nest-api')
@Controller('v1/auth')
@Public()
@SkipEnvelope()
export class AuthController {
  constructor(private readonly auth: NestAuthService) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Canjear apikey por access + refresh token',
    description:
      'Uso server-to-server (módulos Exélixi, integradores). ' +
      'Funciona por HTTP local y HTTPS público (QA: nexusqa.exelixitech.com · desarrollo: cierrelmds.exelixitech.com).',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        access_token: 'eyJ...',
        refresh_token: 'a1b2...',
        token_type: 'Bearer',
        expires_in: 900,
      },
    },
  })
  async token(@Body() dto: TokenRequestDto, @Req() req: Request) {
    this.auth.assertHttpsIfRequired(req);
    return this.auth.issueTokenPair(dto.apikey ?? '');
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar par de tokens',
    description: 'Rota refresh_token en cada uso. Devuelve access_token nuevo.',
  })
  async refresh(@Body() dto: RefreshRequestDto, @Req() req: Request) {
    this.auth.assertHttpsIfRequired(req);
    return this.auth.refreshTokenPair(dto.refresh_token);
  }
}
