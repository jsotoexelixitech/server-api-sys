#!/usr/bin/env node
/**
 * Prueba conectividad SMTP (sin enviar correo).
 * Uso:
 *   node scripts/test-smtp-connectivity.mjs
 *   node scripts/test-smtp-connectivity.mjs --host mail.lamundialdeseguros.com --port 25
 *
 * En srv001:
 *   cd ~/server-api-sys && node scripts/test-smtp-connectivity.mjs
 */

import net from 'node:net';
import tls from 'node:tls';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const HOST = arg('host', process.env.SMTP_HOST || 'mail.lamundialdeseguros.com');
const PORT = Number(arg('port', process.env.SMTP_PORT || '25'));
const TIMEOUT_MS = Number(arg('timeout', '15000'));

function log(label, msg) {
  console.log(`[${label}] ${msg}`);
}

function tcpConnect(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP timeout ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function readSmtpBanner(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      socket.removeAllListeners('data');
      reject(new Error('SMTP banner timeout'));
    }, timeoutMs);

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (buf.includes('\n')) {
        clearTimeout(timer);
        socket.removeAllListeners('data');
        resolve(buf.trim());
      }
    });
  });
}

function smtpCommand(socket, command, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      socket.removeAllListeners('data');
      reject(new Error(`SMTP command timeout: ${command}`));
    }, timeoutMs);

    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      if (/^\d{3} /.test(last)) {
        clearTimeout(timer);
        socket.removeListener('data', onData);
        resolve(buf.trim());
      }
    };

    socket.on('data', onData);
    socket.write(`${command}\r\n`);
  });
}

async function testStartTls(socket, host) {
  const response = await smtpCommand(socket, 'STARTTLS', TIMEOUT_MS);
  if (!response.startsWith('220')) {
    throw new Error(`STARTTLS rechazado: ${response.split('\n')[0]}`);
  }

  const secure = await new Promise((resolve, reject) => {
    const tlsSocket = tls.connect(
      { socket, servername: host, rejectUnauthorized: false },
      () => resolve(tlsSocket),
    );
    tlsSocket.once('error', reject);
  });

  const ehlo = await smtpCommand(secure, `EHLO ${host}`, TIMEOUT_MS);
  await smtpCommand(secure, 'QUIT', TIMEOUT_MS);
  secure.end();
  return ehlo;
}

async function run() {
  console.log('=== Prueba SMTP (sin envío de correo) ===');
  console.log(`Host: ${HOST}:${PORT}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log('');

  let socket;
  try {
    log('TCP', `Conectando a ${HOST}:${PORT}...`);
    socket = await tcpConnect(HOST, PORT, TIMEOUT_MS);
    log('TCP', 'OK — puerto accesible');

    const banner = await readSmtpBanner(socket, TIMEOUT_MS);
    log('SMTP', `Banner: ${banner.split('\n')[0]}`);

    const ehloPlain = await smtpCommand(socket, `EHLO ${HOST}`, TIMEOUT_MS);
    const supportsStartTls = /STARTTLS/i.test(ehloPlain);
    log('EHLO', supportsStartTls ? 'STARTTLS disponible' : 'Sin STARTTLS en EHLO');

    if (supportsStartTls) {
      const ehloTls = await testStartTls(socket, HOST);
      log('TLS', `EHLO post-STARTTLS: ${ehloTls.split('\n')[0]}`);
      log('RESULT', 'OK — relay responde y acepta STARTTLS (como PHPMailer)');
    } else {
      await smtpCommand(socket, 'QUIT', TIMEOUT_MS);
      socket.end();
      log('RESULT', 'OK — relay responde (sin STARTTLS; revisar config PHP)');
    }
    process.exitCode = 0;
  } catch (err) {
    log('FAIL', err instanceof Error ? err.message : String(err));
    if (socket && !socket.destroyed) socket.destroy();
    process.exitCode = 1;
  }
}

run();
