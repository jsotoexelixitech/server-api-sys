import * as fs from 'fs';
import * as path from 'path';

export function htmlTemplatesRoot(): string {
  const candidates = [
    path.join(process.cwd(), 'dist', 'assets', 'product-emission', 'html'),
    path.join(process.cwd(), 'src', 'assets', 'product-emission', 'html'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[candidates.length - 1];
}

export function readTemplateFile(relativePath: string): string {
  const full = path.join(htmlTemplatesRoot(), relativePath);
  return fs.readFileSync(full, 'utf8');
}

export function resolveLogoDataUri(): string | null {
  return resolveAssetDataUri([
    'exelixi-logo-color.png',
    'exelixi-logo-blanco.png',
    'logo.png',
  ]);
}

/** Marca de agua centrada (como mPDF SetWatermarkImage en PHP). */
export function resolveWatermarkDataUri(): string | null {
  return resolveAssetDataUri([
    'exelixi-watermark.png',
    'exelixi-logo-blanco.png',
    'exelixi-logo-color.png',
    'logo.png',
  ]);
}

function resolveAssetDataUri(fileNames: string[]): string | null {
  const roots = [
    path.join(process.cwd(), 'src', 'assets', 'product-emission'),
    path.join(process.cwd(), 'dist', 'assets', 'product-emission'),
  ];
  for (const fileName of fileNames) {
    for (const root of roots) {
      const filePath = path.join(root, fileName);
      if (!fs.existsSync(filePath)) continue;
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  }
  return null;
}
