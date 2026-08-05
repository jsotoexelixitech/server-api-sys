import * as fs from 'fs';
import puppeteer, { Browser } from 'puppeteer';

const SYSTEM_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
].filter((p): p is string => Boolean(p));

function resolveChromeExecutable(): string | undefined {
  for (const candidate of SYSTEM_CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

// Chromium persistente: lanzarlo cuesta ~30s en srv001, así que se reutiliza
// entre emisiones y solo se relanza si el proceso muere.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && existing.connected) return existing;
    browserPromise = null;
  }

  browserPromise = puppeteer.launch({
    headless: true,
    executablePath: resolveChromeExecutable(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const browser = await browserPromise;
    browser.once('disconnected', () => {
      browserPromise = null;
    });
    return browser;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '14mm', left: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Pre-lanza Chromium al arrancar para que la primera emisión no pague el frío. */
export function warmUpPdfRenderer(): void {
  void getBrowser().catch(() => undefined);
}
