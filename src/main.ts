import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import {
  SWAGGER_API_DESCRIPTION,
} from './common/swagger/api-docs.constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');
  const swaggerPath = config.get<string>('SWAGGER_PATH', 'docs');

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // permite propiedades extra en el body (emision-api las incluye)
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  if (swaggerPath) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Exelixi · RCV → Sis2000')
      .setDescription(SWAGGER_API_DESCRIPTION)
      .setVersion('1.2.0-rcv')
      .addApiKey(
        {
          type: 'apiKey',
          name: 'apikey',
          in: 'header',
          description: 'Token del canal (`maclient_api.xtoken`). Requerido en emisión y cobro.',
        },
        'apikey',
      )
      .addBearerAuth()
      .addServer('http://192.168.8.120:3002', 'srv001 — QA/Producción Exélixi')
      .addServer('http://localhost:3002', 'Desarrollo local')
      .addTag('1. Catálogo vehículo (inma)', 'Paso 1 · `VInma`')
      .addTag('2. Catálogos y cotización (valrep)', 'Pasos 2–4 · estados, planes, prima')
      .addTag('3. Emisión RCV', 'Pasos 5–6 · validar y emitir')
      .addTag('4. Cobranza RCV', 'Paso 7 · `activate` (ingreso de caja)')
      .addTag('5. Documentos (post-emisión)', 'Paso 8 · anexo conductor habitual')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      customSiteTitle: 'Exelixi · RCV Sis2000 API',
      customfavIcon: 'https://exelixitech.com/favicon.ico',
      customCssUrl: 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
      customJsStr: `
(function() {
  /* ─────────────────────────────────────────────────────────
     Lee los tags directamente del DOM de Swagger UI.
     Funciona con cualquier número de secciones/APIs.
  ───────────────────────────────────────────────────────── */

  var HEADER_H = 38; /* altura del topbar */

  /* Obtiene las secciones actuales del DOM */
  function readSections() {
    var seen = {};
    var list = [];
    document.querySelectorAll('.opblock-tag[data-tag]').forEach(function(el) {
      var tag = el.getAttribute('data-tag');
      if (!tag || seen[tag]) return;
      seen[tag] = true;
      var label = tag.replace(/^\\d+\\.\\s*/, '').trim();
      list.push({ tag: tag, label: label, el: el });
    });
    return list;
  }

  /* Scroll al elemento de sección — usa scrollIntoView siempre */
  function scrollTo(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    /* compensar el topbar fijo */
    setTimeout(function() { window.scrollBy(0, -HEADER_H - 4); }, 350);
  }

  /* Marca activo en sidebar */
  function setActive(tag) {
    var nav = document.getElementById('exelixi-sidebar');
    if (!nav) return;
    nav.querySelectorAll('.sb-item').forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-tag') === tag);
    });
  }

  /* ── Toggle hamburguesa (móvil) ─────────────────────────── */
  function buildToggle() {
    if (document.getElementById('exelixi-toggle')) return;
    var btn = document.createElement('button');
    btn.id = 'exelixi-toggle';
    btn.setAttribute('aria-label', 'Menú');
    btn.innerHTML = '<span></span><span></span><span></span>';
    document.body.appendChild(btn);
    btn.addEventListener('click', function() {
      var nav = document.getElementById('exelixi-sidebar');
      var ov  = document.getElementById('exelixi-overlay');
      if (nav) nav.classList.toggle('open');
      if (ov)  ov.classList.toggle('visible');
    });
    var ov = document.createElement('div');
    ov.id = 'exelixi-overlay';
    ov.addEventListener('click', function() {
      var nav = document.getElementById('exelixi-sidebar');
      if (nav) nav.classList.remove('open');
      ov.classList.remove('visible');
    });
    document.body.appendChild(ov);
  }

  /* ── Construye o reconstruye el sidebar ─────────────────── */
  var lastCount = 0;
  function buildSidebar() {
    var sections = readSections();
    if (sections.length === 0) return;           /* aún no renderizó */
    if (sections.length === lastCount) return;   /* sin cambios */
    lastCount = sections.length;

    var existing = document.getElementById('exelixi-sidebar');
    if (existing) existing.remove();

    var nav = document.createElement('nav');
    nav.id = 'exelixi-sidebar';

    nav.innerHTML =
      '<div class="sb-brand">'
      + '<span class="sb-bolt">&#9889;</span>'
      + '<div><div class="sb-name">Exélixi API</div>'
      + '<div class="sb-tagline">Sis2000 · Documentación</div></div>'
      + '</div>'
      + '<div class="sb-search-wrap">'
      + '<input class="sb-search" placeholder="&#128269; Buscar..." type="text" />'
      + '</div>'
      + '<div class="sb-nav-label">MÓDULOS (' + sections.length + ')</div>'
      + '<ul class="sb-list">'
      + sections.map(function(s) {
          return '<li><a class="sb-item" data-tag="' + s.tag.replace(/"/g, '&quot;') + '">'
            + '<span class="sb-dot"></span>'
            + '<span class="sb-label">' + s.label + '</span>'
            + '</a></li>';
        }).join('')
      + '</ul>'
      + '<div class="sb-spacer"></div>'
      + '<div class="sb-footer">'
      + '<div class="sb-ver-row">'
      + '<span class="sb-ver-label">API</span>'
      + '<span class="sb-ver-val">v3.0-rcv</span>'
      + '</div>'
      + '<div class="sb-env-row">'
      + '<a class="sb-env-badge active">QA</a>'
      + '<a class="sb-env-badge">PROD</a>'
      + '</div></div>';

    document.body.insertBefore(nav, document.body.firstChild);

    /* ── Clicks ─────────────────────────── */
    nav.querySelectorAll('.sb-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.preventDefault();
        var tag = item.getAttribute('data-tag');
        /* buscar el elemento de sección por atributo, no por selector CSS */
        var target = null;
        document.querySelectorAll('.opblock-tag[data-tag]').forEach(function(el) {
          if (el.getAttribute('data-tag') === tag) target = el;
        });
        if (target) {
          scrollTo(target);
          setActive(tag);
        }
        nav.classList.remove('open');
        var ov = document.getElementById('exelixi-overlay');
        if (ov) ov.classList.remove('visible');
      });
    });

    /* ── Buscar / filtrar ───────────────── */
    var inp = nav.querySelector('.sb-search');
    if (inp) {
      inp.addEventListener('input', function() {
        var q = inp.value.toLowerCase();
        nav.querySelectorAll('li').forEach(function(li) {
          var lbl = li.querySelector('.sb-label');
          li.style.display = (!q || (lbl && lbl.textContent.toLowerCase().indexOf(q) >= 0)) ? '' : 'none';
        });
      });
    }

    /* ── Scroll-spy ─────────────────────── */
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) setActive(e.target.getAttribute('data-tag'));
      });
    }, { rootMargin: '-' + HEADER_H + 'px 0px -55% 0px', threshold: 0 });

    sections.forEach(function(s) { io.observe(s.el); });
    if (sections.length > 0) setActive(sections[0].tag);
  }

  /* ── Limpiar prefijos "N. " visibles en las secciones ──── */
  function cleanTitles() {
    document.querySelectorAll('.opblock-tag[data-tag]').forEach(function(el) {
      if (el.dataset.cleaned) return;
      el.dataset.cleaned = '1';
      /* buscar nodo de texto directo */
      var a = el.querySelector('a') || el.querySelector('span');
      if (!a) return;
      a.childNodes.forEach(function(n) {
        if (n.nodeType === 3) n.textContent = n.textContent.replace(/^\\d+\\.\\s*/, '');
      });
    });
  }

  /* ── Init con reintentos ────────────────────────────────── */
  function tryInit() {
    buildToggle();
    buildSidebar();
    cleanTitles();
  }

  /* Primer intento rápido */
  setTimeout(tryInit, 600);

  /* Observer para cuando Swagger termina de renderizar */
  var obs = new MutationObserver(function(mutations) {
    var relevant = mutations.some(function(m) {
      return Array.from(m.addedNodes).some(function(n) {
        return n.nodeType === 1 && (
          n.classList && (n.classList.contains('opblock-tag') || n.classList.contains('opblock-tag-section'))
          || (n.querySelector && n.querySelector('.opblock-tag'))
        );
      });
    });
    if (relevant) { buildSidebar(); cleanTitles(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  /* Reintentos de seguridad */
  [1500, 3000, 5000].forEach(function(t) { setTimeout(tryInit, t); });
})();
      `,
      customCss: `
        /* ═══════════════════════════════════════════════════════
           EXÉLIXI · SWAGGER THEME v3 — Two-Column Layout
           navy #0f2544 · blue #0e6ba8 · sidebar 210px
        ═══════════════════════════════════════════════════════ */
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap');

        /* ── Reset & base ──────────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; }
        body {
          background: #f0f4f8;
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
          margin: 0;
        }
        .swagger-ui {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
          max-width: none !important;
          margin: 0 !important;
        }

        /* ════════════════════════════════════════════════════════
           SIDEBAR
        ════════════════════════════════════════════════════════ */
        #exelixi-sidebar {
          position: fixed;
          left: 0; top: 0;
          width: 210px; height: 100vh;
          background: linear-gradient(180deg, #081526 0%, #0f2544 55%, #0c3460 100%);
          z-index: 600;
          display: flex;
          flex-direction: column;
          box-shadow: 4px 0 24px rgba(0,0,0,0.45);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.12) transparent;
        }
        #exelixi-sidebar::-webkit-scrollbar { width: 4px; }
        #exelixi-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

        /* Brand */
        .sb-brand {
          display: flex; align-items: center; gap: 10px;
          padding: 22px 16px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .sb-bolt {
          font-size: 1.8rem; line-height: 1;
          filter: drop-shadow(0 0 10px rgba(96,165,250,0.9));
        }
        .sb-name {
          color: #fff; font-weight: 800; font-size: 1.1rem;
          letter-spacing: 0.01em; line-height: 1;
          font-family: 'Inter', sans-serif;
        }
        .sb-env {
          color: #60a5fa; font-size: 0.64rem; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          margin-top: 3px; font-family: 'Inter', sans-serif;
        }

        /* Search */
        .sb-search-wrap { padding: 10px 14px 4px; flex-shrink: 0; }
        .sb-search {
          width: 100%; padding: 7px 10px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 7px; color: #fff; font-size: 0.8rem;
          font-family: 'Inter', sans-serif; outline: none;
          transition: border 0.2s, background 0.2s;
        }
        .sb-search::placeholder { color: rgba(255,255,255,0.3); }
        .sb-search:focus { border-color: #0e6ba8; background: rgba(14,107,168,0.15); }

        /* Nav label */
        .sb-nav-label {
          color: rgba(255,255,255,0.28); font-size: 0.58rem; font-weight: 700;
          letter-spacing: 0.16em; text-transform: uppercase;
          padding: 14px 16px 4px; font-family: 'Inter', sans-serif; flex-shrink: 0;
        }

        /* Nav list */
        .sb-list { list-style: none; margin: 0; padding: 0; flex-shrink: 0; }
        .sb-list li { margin: 0; }

        /* Nav items */
        .sb-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 16px 10px 14px;
          text-decoration: none !important; cursor: pointer;
          border-left: 3px solid transparent;
          transition: background 0.15s, border-color 0.15s;
        }
        .sb-item:hover { background: rgba(255,255,255,0.06); border-left-color: rgba(14,107,168,0.5); }
        .sb-item.active { background: rgba(14,107,168,0.2); border-left-color: #0e6ba8; }

        .sb-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: rgba(255,255,255,0.2); flex-shrink: 0;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .sb-item.active .sb-dot { background: #60a5fa; box-shadow: 0 0 8px rgba(96,165,250,0.7); }
        .sb-item:hover .sb-dot { background: rgba(255,255,255,0.5); }

        .sb-label {
          color: rgba(255,255,255,0.6); font-size: 0.8rem; font-weight: 500;
          line-height: 1.3; transition: color 0.15s; font-family: 'Inter', sans-serif;
        }
        .sb-item:hover .sb-label { color: rgba(255,255,255,0.92); }
        .sb-item.active .sb-label { color: #fff; font-weight: 600; }

        /* Footer */
        .sb-spacer { flex: 1; min-height: 16px; }
        .sb-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
        .sb-ver-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .sb-ver-label {
          color: rgba(255,255,255,0.25); font-size: 0.62rem; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Inter', sans-serif;
        }
        .sb-ver-val { color: #60a5fa; font-size: 0.68rem; font-weight: 700; font-family: 'Inter', sans-serif; }
        .sb-env-row { display: flex; gap: 6px; }
        .sb-env-badge {
          color: rgba(255,255,255,0.4) !important; font-size: 0.68rem; font-weight: 600;
          padding: 3px 10px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12);
          text-decoration: none !important; transition: all 0.2s; font-family: 'Inter', sans-serif;
        }
        .sb-env-badge.active, .sb-env-badge:hover {
          color: #fff !important; border-color: #0e6ba8; background: rgba(14,107,168,0.4);
        }

        /* ── Hamburger toggle ──────────────────────────────────── */
        #exelixi-toggle {
          display: none; position: fixed; top: 10px; left: 12px; z-index: 800;
          background: #0f2544; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; padding: 8px 10px; cursor: pointer;
          flex-direction: column; gap: 5px; align-items: center;
          box-shadow: 0 3px 12px rgba(0,0,0,0.4);
        }
        #exelixi-toggle span {
          display: block; width: 20px; height: 2px;
          background: #fff; border-radius: 2px; transition: all 0.25s;
        }
        #exelixi-overlay {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.5); z-index: 550;
        }
        #exelixi-overlay.visible { display: block; }

        /* ════════════════════════════════════════════════════════
           LAYOUT — push content right
        ════════════════════════════════════════════════════════ */
        #swagger-ui {
          margin-left: 210px !important;
          width: calc(100% - 210px) !important;
          min-height: 100vh;
        }

        /* ════════════════════════════════════════════════════════
           TOPBAR — delgada, solo info, sin duplicar sidebar
        ════════════════════════════════════════════════════════ */
        .swagger-ui .topbar {
          background: #081526;
          padding: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          position: sticky; top: 0; z-index: 500;
        }
        .swagger-ui .topbar .topbar-wrapper {
          padding: 10px 24px; align-items: center; gap: 0; justify-content: flex-end;
        }
        .swagger-ui .topbar .topbar-wrapper img { display: none; }
        .swagger-ui .topbar .topbar-wrapper::before {
          content: 'Documentación interna · No compartir externamente';
          color: rgba(255,255,255,0.28);
          font-size: 0.68rem; font-weight: 500; letter-spacing: 0.06em;
          font-family: 'Inter', sans-serif; margin-right: auto;
        }
        .swagger-ui .topbar a { display: none !important; }

        /* ════════════════════════════════════════════════════════
           HERO / INFO
        ════════════════════════════════════════════════════════ */
        .swagger-ui .information-container {
          background: #fff;
          border-bottom: 1px solid #e2e8f0;
          padding: 28px 28px 22px !important;
          margin-bottom: 0;
        }
        .swagger-ui .info { margin: 0; }
        .swagger-ui .info .title {
          color: #0f2544 !important;
          font-size: 1.8rem !important;
          font-weight: 800 !important;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .swagger-ui .info .title small.version-stamp { vertical-align: middle; margin-left: 12px; }
        .swagger-ui .info .version-stamp .version {
          background: #0e6ba8; color: #fff;
          border-radius: 20px; padding: 2px 12px;
          font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .swagger-ui .info a.link { color: #0e6ba8 !important; }
        .swagger-ui .info p, .swagger-ui .info li {
          color: #4b5563 !important; font-size: 0.88rem; line-height: 1.65;
        }
        .swagger-ui .info .description table {
          border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.84rem;
          border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
        }
        .swagger-ui .info .description th {
          background: #0f2544; color: #fff;
          padding: 8px 14px; text-align: left; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.72rem;
        }
        .swagger-ui .info .description td {
          padding: 7px 14px; border-bottom: 1px solid #f0f4f8;
          color: #374151 !important;
        }
        .swagger-ui .info .description tr:last-child td { border-bottom: none; }
        .swagger-ui .info .description code {
          background: #eff6ff; color: #1d4ed8;
          border-radius: 4px; padding: 1px 7px; font-size: 0.82em;
          border: 1px solid #bfdbfe;
        }

        /* Auth button */
        .swagger-ui .auth-wrapper .btn.authorize {
          background: #0e6ba8 !important;
          border: 1px solid #0e6ba8 !important;
          color: #fff !important; border-radius: 8px !important;
          font-weight: 700 !important; padding: 8px 20px !important;
          transition: all 0.2s ease !important;
        }
        .swagger-ui .auth-wrapper .btn.authorize:hover {
          background: #0f2544 !important;
          box-shadow: 0 4px 12px rgba(14,107,168,0.3) !important;
        }
        .swagger-ui .auth-wrapper .btn.authorize svg { fill: #fff; }

        /* Servers */
        .swagger-ui .servers > label { color: #4b5563 !important; font-size: 0.82rem; }
        .swagger-ui .servers select {
          border: 1px solid #d1d5db !important; border-radius: 6px !important;
          padding: 5px 10px; background: #fff !important; color: #0f2544 !important;
        }

        /* ════════════════════════════════════════════════════════
           WRAPPER & CONTENT AREA
        ════════════════════════════════════════════════════════ */
        .swagger-ui .wrapper { padding: 0 20px 48px; max-width: none !important; }

        /* ── Secciones (tags) ──────────────────────────────────── */
        .swagger-ui .opblock-tag-section { margin-bottom: 20px; }
        .swagger-ui .opblock-tag {
          background: #ffffff !important;
          border: none !important;
          border-radius: 12px !important;
          margin-bottom: 2px !important;
          padding: 14px 20px !important;
          box-shadow: 0 2px 8px rgba(15,37,68,0.08) !important;
          cursor: pointer;
          transition: all 0.2s ease !important;
          border-left: 5px solid #0e6ba8 !important;
        }
        .swagger-ui .opblock-tag:hover {
          background: #f0f7ff !important;
          box-shadow: 0 4px 16px rgba(14,107,168,0.15) !important;
          transform: translateX(2px);
        }
        .swagger-ui .opblock-tag span,
        .swagger-ui .opblock-tag a {
          color: #0f2544 !important;
          font-size: 1rem !important;
          font-weight: 700 !important;
          text-decoration: none !important;
        }
        .swagger-ui .opblock-tag small {
          color: #6b7280 !important;
          font-weight: 400 !important;
          font-size: 0.8rem !important;
          margin-left: 8px;
        }
        .swagger-ui .opblock-tag svg { fill: #0e6ba8 !important; }

        /* ── Endpoints: contenedor ─────────────────────────────── */
        .swagger-ui .opblock-tag-section .opblock {
          border-radius: 8px !important;
          margin: 4px 0 !important;
          box-shadow: 0 1px 4px rgba(15,37,68,0.07) !important;
          transition: box-shadow 0.2s, transform 0.15s !important;
        }
        .swagger-ui .opblock:hover {
          box-shadow: 0 3px 12px rgba(15,37,68,0.13) !important;
          transform: translateX(2px);
        }
        .swagger-ui .opblock.is-open {
          box-shadow: 0 4px 20px rgba(14,107,168,0.18) !important;
          transform: none;
        }

        /* ── POST ──────────────────────────────────────────────── */
        .swagger-ui .opblock.opblock-post {
          border-color: #0e6ba8 !important;
          background: #f8fbff !important;
        }
        .swagger-ui .opblock.opblock-post .opblock-summary { border-color: #bfdbfe !important; }
        .swagger-ui .opblock.opblock-post .opblock-summary-method {
          background: linear-gradient(135deg, #0e6ba8, #1d4ed8) !important;
          border-radius: 6px !important;
          font-weight: 800 !important;
          font-size: 0.72rem !important;
          letter-spacing: 0.06em;
          min-width: 68px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(14,107,168,0.3);
        }

        /* ── GET ───────────────────────────────────────────────── */
        .swagger-ui .opblock.opblock-get {
          border-color: #059669 !important;
          background: #f8fffe !important;
        }
        .swagger-ui .opblock.opblock-get .opblock-summary { border-color: #a7f3d0 !important; }
        .swagger-ui .opblock.opblock-get .opblock-summary-method {
          background: linear-gradient(135deg, #059669, #047857) !important;
          border-radius: 6px !important;
          font-weight: 800 !important;
          font-size: 0.72rem !important;
          letter-spacing: 0.06em;
          min-width: 68px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(5,150,105,0.3);
        }

        /* ── Summary path & description ────────────────────────── */
        .swagger-ui .opblock-summary-path {
          font-family: 'Inter', monospace !important;
          font-size: 0.88rem !important;
          font-weight: 600 !important;
          color: #0f2544 !important;
        }
        .swagger-ui .opblock-summary-description {
          color: #6b7280 !important;
          font-size: 0.82rem !important;
        }

        /* ── Interior del endpoint abierto ─────────────────────── */
        .swagger-ui .opblock-body { background: #fff !important; border-radius: 0 0 8px 8px; }
        .swagger-ui .opblock-section-header {
          background: #f8fafc !important;
          border-bottom: 1px solid #e2e8f0 !important;
          padding: 10px 16px !important;
        }
        .swagger-ui .opblock-section-header h4 {
          color: #0f2544 !important;
          font-weight: 700 !important;
          font-size: 0.85rem !important;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* ── Parámetros / Body ─────────────────────────────────── */
        .swagger-ui .parameters-col_description p { color: #374151; font-size: 0.86rem; }
        .swagger-ui .parameter__name { color: #0f2544 !important; font-weight: 700 !important; }
        .swagger-ui .parameter__type { color: #0e6ba8 !important; font-size: 0.78rem; }
        .swagger-ui textarea.body-param__text {
          border: 1px solid #bfdbfe !important;
          border-radius: 8px !important;
          font-family: 'Fira Code', monospace;
          font-size: 0.83rem !important;
          background: #f8fbff !important;
          padding: 12px !important;
        }
        .swagger-ui textarea.body-param__text:focus {
          border-color: #0e6ba8 !important;
          outline: none;
          box-shadow: 0 0 0 3px rgba(14,107,168,0.15) !important;
        }

        /* ── Botón Execute ─────────────────────────────────────── */
        .swagger-ui .btn.execute {
          background: linear-gradient(135deg, #0f2544, #0e6ba8) !important;
          color: #fff !important;
          border: none !important;
          border-radius: 8px !important;
          font-weight: 700 !important;
          font-size: 0.85rem !important;
          letter-spacing: 0.05em;
          padding: 9px 28px !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 2px 8px rgba(14,107,168,0.3) !important;
        }
        .swagger-ui .btn.execute:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 16px rgba(14,107,168,0.4) !important;
        }
        .swagger-ui .btn.execute:active { transform: translateY(0) !important; }

        /* ── Botón Clear / Cancel ──────────────────────────────── */
        .swagger-ui .btn.btn-clear, .swagger-ui .btn.cancel {
          border: 1px solid #e2e8f0 !important;
          color: #6b7280 !important;
          border-radius: 8px !important;
          background: #f8fafc !important;
          font-weight: 600 !important;
        }

        /* ── Respuestas ────────────────────────────────────────── */
        .swagger-ui .responses-wrapper { padding: 0 16px 16px; }
        .swagger-ui .response-col_status { font-weight: 800 !important; font-size: 0.92rem !important; }
        .swagger-ui .response .response-col_status code {
          padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;
        }
        .swagger-ui .response:has(.response-col_status code:contains('2')) .response-col_status code {
          background: #d1fae5; color: #065f46;
        }
        /* Highlight de código JSON en respuesta */
        .swagger-ui .highlight-code pre {
          background: #0f2544 !important;
          border-radius: 8px !important;
          font-size: 0.8rem !important;
          padding: 14px !important;
          color: #e2e8f0 !important;
        }
        .swagger-ui .microlight { color: #93c5fd !important; }

        /* ── Curl ──────────────────────────────────────────────── */
        .swagger-ui .curl-command { background: #0f2544 !important; border-radius: 8px !important; }
        .swagger-ui .curl-command .curl { color: #bfdbfe !important; font-size: 0.8rem !important; }
        .swagger-ui .copy-to-clipboard {
          background: #0e6ba8 !important;
          border-radius: 4px !important;
          border: none !important;
        }

        /* ── Input / Select en formularios ─────────────────────── */
        .swagger-ui input[type=text], .swagger-ui input[type=email],
        .swagger-ui input[type=file], .swagger-ui select {
          border: 1px solid #d1d5db !important;
          border-radius: 6px !important;
          padding: 6px 10px !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 0.85rem !important;
          transition: border 0.2s !important;
        }
        .swagger-ui input:focus, .swagger-ui select:focus {
          border-color: #0e6ba8 !important;
          box-shadow: 0 0 0 3px rgba(14,107,168,0.12) !important;
          outline: none !important;
        }

        /* ── Modal de Autorización ─────────────────────────────── */
        .swagger-ui .dialog-ux .modal-ux {
          border-radius: 16px !important;
          box-shadow: 0 20px 60px rgba(15,37,68,0.3) !important;
          border: 1px solid #bfdbfe !important;
        }
        .swagger-ui .dialog-ux .modal-ux-header {
          background: linear-gradient(135deg, #0f2544, #0e6ba8) !important;
          border-radius: 14px 14px 0 0 !important;
          padding: 20px 24px !important;
        }
        .swagger-ui .dialog-ux .modal-ux-header h3 {
          color: #fff !important;
          font-weight: 800 !important;
          font-size: 1.1rem !important;
        }
        .swagger-ui .dialog-ux .modal-ux-header button svg { fill: rgba(255,255,255,0.7); }
        .swagger-ui .auth-container .wrapper { padding: 20px 24px !important; }
        .swagger-ui .dialog-ux .btn.authorize {
          background: #0e6ba8 !important;
          color: #fff !important;
          border-radius: 8px !important;
        }

        /* ── Schemas ───────────────────────────────────────────── */
        .swagger-ui section.models {
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important;
          background: #fff !important;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(15,37,68,0.06);
        }
        .swagger-ui section.models h4 {
          color: #0f2544 !important;
          font-weight: 800 !important;
          font-size: 0.95rem !important;
          padding: 14px 20px !important;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          margin: 0 !important;
        }
        .swagger-ui section.models .model-container {
          background: #fafafa;
          border-top: 1px solid #f0f0f0;
        }
        .swagger-ui .model-title { color: #0f2544 !important; font-weight: 700 !important; }
        .swagger-ui .model { color: #374151; font-size: 0.85rem; }
        .swagger-ui .property-row .property-name { color: #0e6ba8 !important; font-weight: 600 !important; }

        /* ── Scrollbar ─────────────────────────────────────────── */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
        ::-webkit-scrollbar-thumb { background: #0e6ba8; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #0f2544; }

        /* ── Filter / Buscar ───────────────────────────────────── */
        .swagger-ui .filter .operation-filter-input {
          border: 1px solid #bfdbfe !important;
          border-radius: 8px !important;
          padding: 8px 14px !important;
          font-size: 0.88rem !important;
          background: #fff !important;
          transition: all 0.2s !important;
        }
        .swagger-ui .filter .operation-filter-input:focus {
          border-color: #0e6ba8 !important;
          box-shadow: 0 0 0 3px rgba(14,107,168,0.12) !important;
          outline: none !important;
        }

        /* ── Try it out button ─────────────────────────────────── */
        .swagger-ui .try-out__btn {
          border: 1px solid #0e6ba8 !important;
          color: #0e6ba8 !important;
          border-radius: 6px !important;
          font-weight: 600 !important;
          background: transparent !important;
          transition: all 0.2s !important;
        }
        .swagger-ui .try-out__btn:hover {
          background: #0e6ba8 !important;
          color: #fff !important;
        }
        .swagger-ui .try-out__btn.cancel {
          border-color: #e5e7eb !important;
          color: #6b7280 !important;
        }
        .swagger-ui .try-out__btn.cancel:hover {
          background: #f3f4f6 !important;
          color: #374151 !important;
        }

        /* ── Animaciones suaves ────────────────────────────────── */
        .swagger-ui .opblock-body,
        .swagger-ui .model-container,
        .swagger-ui .dialog-ux .modal-ux {
          animation: fadeSlide 0.2s ease;
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ════════════════════════════════════════════════════════
           RESPONSIVE
        ════════════════════════════════════════════════════════ */

        /* Tablet: sidebar más angosta */
        @media (max-width: 1024px) and (min-width: 769px) {
          #exelixi-sidebar { width: 180px; }
          #swagger-ui { margin-left: 180px !important; width: calc(100% - 180px) !important; }
          .sb-name { font-size: 0.95rem; }
          .sb-label { font-size: 0.75rem; }
        }

        /* Móvil: sidebar oculta, toggle visible */
        @media (max-width: 768px) {
          #exelixi-sidebar {
            width: 240px;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 700;
          }
          #exelixi-sidebar.open { transform: translateX(0); }

          #swagger-ui {
            margin-left: 0 !important;
            width: 100% !important;
          }

          #exelixi-toggle {
            display: flex !important;
          }

          .swagger-ui .topbar .topbar-wrapper {
            padding-left: 56px !important;
          }

          .swagger-ui .information-container {
            padding: 20px 16px 16px !important;
          }

          .swagger-ui .info .title { font-size: 1.4rem !important; }

          .swagger-ui .opblock-tag {
            padding: 12px 14px !important;
          }

          .swagger-ui .opblock-summary-path {
            font-size: 0.78rem !important;
            word-break: break-all;
          }

          .swagger-ui .wrapper { padding: 0 12px 32px; }
        }

        /* Móvil pequeño */
        @media (max-width: 480px) {
          .swagger-ui .opblock-summary-method {
            min-width: 52px !important;
            font-size: 0.65rem !important;
          }
          .swagger-ui .info .title { font-size: 1.2rem !important; }
        }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        tagsSorter: (a: string, b: string) => {
          const order = [
            '1. Catálogo vehículo (inma)',
            '2. Catálogos y cotización (valrep)',
            '3. Emisión RCV',
            '4. Cobranza RCV',
            '5. Documentos (post-emisión)',
          ];
          const ai = order.indexOf(a);
          const bi = order.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        },
      },
    });
  }

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/api`);
  if (swaggerPath) {
    logger.log(`Swagger docs:  http://localhost:${port}/${swaggerPath}`);
  } else {
    logger.log('Swagger: deshabilitado (SWAGGER_PATH vacío)');
  }
}

bootstrap();
