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
  const candidates = [
    path.join(process.cwd(), 'src', 'assets', 'product-emission', 'exelixi-logo-blanco.png'),
    path.join(process.cwd(), 'dist', 'assets', 'product-emission', 'exelixi-logo-blanco.png'),
    path.join(process.cwd(), 'src', 'assets', 'logo.png'),
    path.join(process.cwd(), 'dist', 'assets', 'logo.png'),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  return null;
}
