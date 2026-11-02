import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RenovacionQuery, RenovacionService } from './renovacion.service';
import {
  DestinoNexus,
  armarLinkRenovacion,
  armarMetadataSso,
  enmascararToken,
  envTrue,
  expiraJwt,
  permiteLink,
  resolverDestinoNexus,
  validarRespuestaNexus,
} from './renovacion-link.util';

const SSO_TIMEOUT_MS = 15000;

/**
 * Link "Renovar" listo para abrir: valida elegibilidad, pide a Nexus (`POST /api/auth/sso-delegate`
 * con la API key de empresa `NEXUS_RENOVACION_API_KEY` y `submoduloId` de entrada por ambiente:
 * `RENOVACION_NEXUS_EMPRESA_ID`, `RENOVACION_SUBMODULO_OCR_RCV` / `_PERSONAS`) un nexus_token con el canal de la póliza y
 * devuelve `<OCR>/?nexus_token=…&renovar=<cnpoliza>`. No escribe en Sis2000.
 */
@Injectable()
export class RenovacionLinkService {
  private readonly logger = new Logger(RenovacionLinkService.name);

  constructor(
    private readonly renovacion: RenovacionService,
    private readonly config: ConfigService,
  ) {}

  async generar(cnpolizaRaw: string, query: RenovacionQuery = {}) {
    const nexusUrl = String(this.config.get('NEXUS_API_URL') ?? '').trim().replace(/\/+$/, '');
    const apiKey = String(this.config.get('NEXUS_RENOVACION_API_KEY') ?? '').trim();
    const faltan = [!nexusUrl && 'NEXUS_API_URL', !apiKey && 'NEXUS_RENOVACION_API_KEY'].filter(Boolean);
    if (faltan.length) {
      throw new ServiceUnavailableException(
        `Link de renovación no configurado en nest-api: falta ${faltan.join(' y ')} en el .env.`,
      );
    }

    const data = await this.renovacion.consultar(cnpolizaRaw, query);
    const permitirFuera = envTrue(this.config.get('RENOVACION_PERMITIR_FUERA_VENTANA'));
    if (!permiteLink(data.elegible, data.motivo, permitirFuera)) {
      throw new HttpException(
        { status: false, message: data.mensaje, motivo: data.motivo, cnpoliza: data.cnpoliza, renovada_por: data.renovada_por },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const destino = resolverDestinoNexus(data.poliza_origen.cramo, (k) => this.config.get(k));
    if (!destino.ok) {
      throw new ServiceUnavailableException(
        `Link de renovación no configurado en nest-api: falta ${destino.faltan.join(' y ')} en el .env.`,
      );
    }

    const metadata = armarMetadataSso(data, {
      cusuario: this.config.get('RENOVACION_CUSUARIO') ?? this.config.get('LAMUNDIAL_CUSUARIO') ?? null,
      productorDefault: String(this.config.get('LAMUNDIAL_PRODUCTOR') ?? '80080'),
    });
    const redirectUrl = await this.ssoDelegate(nexusUrl, apiKey, metadata, destino.destino);
    const link = armarLinkRenovacion(redirectUrl, data.cnpoliza, this.config.get('RENOVACION_LINK_BASE'));
    const token = new URL(link).searchParams.get('nexus_token');

    this.logger.log(
      `link ${data.cnpoliza} motivo=${data.motivo} meta=${JSON.stringify(metadata)} → ${enmascararToken(link)}`,
    );
    return {
      cnpoliza: data.cnpoliza,
      link,
      expira_en: expiraJwt(token),
      tipo: data.tipo,
      elegible: data.elegible,
      motivo: data.motivo,
      mensaje: data.mensaje,
      advertencias: data.elegible
        ? data.advertencias
        : [`Fuera de ventana (${data.motivo}); permitido por RENOVACION_PERMITIR_FUERA_VENTANA.`, ...data.advertencias],
      metadata_canal: metadata,
    };
  }

  private async ssoDelegate(
    nexusUrl: string,
    apiKey: string,
    metadata: Record<string, unknown>,
    destino: DestinoNexus,
  ): Promise<string> {
    const url = `${nexusUrl}/api/auth/sso-delegate`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SSO_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ target: 'ocr', submoduloId: destino.submoduloId, metadata }),
        signal: ctrl.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`sso-delegate ${url} sin respuesta: ${msg}`);
      throw new BadGatewayException(`Nexus no respondió (${url}): ${msg}`);
    } finally {
      clearTimeout(timer);
    }
    const body = (await res.json().catch(() => ({}))) as {
      redirect_url?: string;
      message?: string;
      empresa_id?: unknown;
      submodulo_id?: unknown;
    };
    if (!res.ok || !body.redirect_url) {
      const msg = body.message ?? `HTTP ${res.status}`;
      this.logger.warn(`sso-delegate ${url} → ${res.status}: ${msg}`);
      throw new BadGatewayException(`Nexus rechazó el token de renovación (${res.status}): ${msg}`);
    }
    const error = validarRespuestaNexus(body, destino);
    if (error) {
      this.logger.warn(`sso-delegate ${url}: ${error}`);
      throw new BadGatewayException(error);
    }
    return body.redirect_url;
  }
}
