#!/usr/bin/env node
/**
 * Envío real de prueba SMTP (requiere --to).
 *
 * Uso local:
 *   node scripts/test-smtp-send.mjs --to tu@email.com
 *   node scripts/test-smtp-send.mjs --to tu@email.com --host mail.lamundialdeseguros.com --port 25
 *
 * Con adjunto PDF de prueba:
 *   node scripts/test-smtp-send.mjs --to tu@email.com --pdf https://qasys2000.lamundialdeseguros.com/assets/Arys_Tradicional.pdf
 */

import nodemailer from 'nodemailer';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const TO = arg('to', process.env.SMTP_TEST_TO || '');
const HOST = arg('host', process.env.SMTP_HOST || 'mail.lamundialdeseguros.com');
const PORT = Number(arg('port', process.env.SMTP_PORT || '25'));
const SECURE = String(arg('secure', process.env.SMTP_SECURE || 'false')).toLowerCase() === 'true';
const FROM = arg('from', process.env.SMTP_FROM || 'info@lamundialdeseguros.com');
const FROM_NAME = arg('from-name', process.env.SMTP_FROM_NAME || 'La Mundial de Seguros');
const USER = arg('user', process.env.SMTP_USER || '');
const PASS = arg('pass', process.env.SMTP_PASS || '');
const PDF_URL = arg('pdf', '');

if (!TO) {
  console.error('Uso: node scripts/test-smtp-send.mjs --to destinatario@email.com');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: SECURE,
  auth: USER && PASS ? { user: USER, pass: PASS } : undefined,
  tls: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
});

async function main() {
  console.log('=== Prueba envío SMTP ===');
  console.log(`Relay: ${HOST}:${PORT} secure=${SECURE}`);
  console.log(`To: ${TO}`);
  console.log('');

  const attachments = [];
  if (PDF_URL) {
    const res = await fetch(PDF_URL, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`No se pudo descargar PDF: HTTP ${res.status}`);
    attachments.push({
      filename: 'prueba-adjunto.pdf',
      content: Buffer.from(await res.arrayBuffer()),
    });
    console.log(`Adjunto: ${PDF_URL}`);
  }

  const info = await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM}>`,
    to: TO,
    subject: '[Exelixi] Prueba SMTP nest-api',
    html: `<p>Correo de prueba desde <strong>nest-api</strong> (${new Date().toISOString()}).</p>`,
    attachments,
  });

  console.log('OK — messageId:', info.messageId);
  console.log('Response:', info.response);
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
