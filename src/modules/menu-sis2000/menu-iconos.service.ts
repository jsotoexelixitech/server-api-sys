import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** Máximo de un ícono subido (un SVG de menú pesa unos pocos KB; el body JSON admite 100 KB). */
const MAX_BYTES = 80 * 1024;

/** Lo que nunca debe traer un ícono: scripts, eventos, contenido embebido o enlaces externos. */
const CONTENIDO_PROHIBIDO =
  /<\s*(script|foreignObject|iframe|embed|object|audio|video|image)\b|\son[a-z]+\s*=|javascript:|data:text\/html|(?:xlink:)?href\s*=\s*["']\s*(?!#)/i;

const ID_VALIDO = /^[a-f0-9]{8}$/;

/**
 * Íconos SVG propios del menú lateral. En la BD (semenuprincipal.xicono, varchar(50)) queda solo
 * la referencia corta "svg:<id>"; el archivo vive fuera del repo para sobrevivir a git clean del deploy.
 */
@Injectable()
export class MenuIconosService {
  private readonly directorio: string;

  constructor(config: ConfigService) {
    this.directorio = config.get<string>('MENU_ICONOS_DIR')?.trim() || join(homedir(), 'nest-api-storage', 'menu-iconos');
  }

  /** Valida y guarda el SVG; devuelve la referencia para guardar en xicono. */
  async guardar(svg: string): Promise<{ xicono: string }> {
    const contenido = String(svg ?? '').replace(new RegExp('^\uFEFF'), '').trim();
    if (!contenido) throw new BadRequestException('El archivo está vacío.');
    if (Buffer.byteLength(contenido, 'utf8') > MAX_BYTES) {
      throw new BadRequestException('El ícono supera 80 KB; usa un SVG más simple.');
    }
    const sinCabecera = contenido.replace(/^<\?xml[^>]*>\s*/i, '').replace(/^(<!--[\s\S]*?-->\s*)+/, '').replace(/^<!DOCTYPE[^>]*>\s*/i, '');
    if (!/^<svg[\s>]/i.test(sinCabecera) || !/<\/svg>\s*$/i.test(sinCabecera)) {
      throw new BadRequestException('El archivo no es un SVG válido.');
    }
    if (CONTENIDO_PROHIBIDO.test(sinCabecera)) {
      throw new BadRequestException('El SVG trae scripts, eventos o enlaces externos; expórtalo como ícono simple.');
    }

    const id = randomBytes(4).toString('hex');
    await fs.mkdir(this.directorio, { recursive: true });
    await fs.writeFile(join(this.directorio, `${id}.svg`), sinCabecera, 'utf8');
    return { xicono: `svg:${id}` };
  }

  async leer(id: string): Promise<string> {
    if (!ID_VALIDO.test(id)) throw new NotFoundException('Ícono no encontrado.');
    try {
      return await fs.readFile(join(this.directorio, `${id}.svg`), 'utf8');
    } catch {
      throw new NotFoundException('Ícono no encontrado.');
    }
  }
}
