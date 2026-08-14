import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join } from 'path';
import express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import {
  SWAGGER_API_DESCRIPTION,
} from './common/swagger/api-docs.constants';
import {
  SWAGGER_TAG_DESCRIPTIONS,
  SWAGGER_TAGS,
  createBrowserTagsSorter,
} from './common/swagger/swagger-tags.constants';
import { normalizeSwaggerDocumentTags } from './common/swagger/normalize-swagger-tags';
import { sanitizeSwaggerDocForNestUi } from './common/swagger/sanitize-swagger-for-ui';
import {
  LA_MUNDIAL_BRAND,
  SWAGGER_BRAND_META,
} from './common/swagger/la-mundial-brand.constants';
import { resolvePublicApiPaths } from './common/config/public-path';
import {
  getLoadedPartnerPackageNames,
  parsePartnerPackageNames,
} from './partner/partner-loader';
import { readPartnerPackagesConfig } from './partner/partner-env';
import { OpenApiDocumentStore } from './modules/docs/open-api-document.store';
import { joinPublicPath } from './common/config/public-path';

function resolveBrandAssetsDir(): string {
  const candidates = [
    join(__dirname, 'assets'),
    join(process.cwd(), 'dist', 'assets'),
    join(process.cwd(), 'src', 'assets'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'brand', 'logo-lamundial-sidebar.png'))) {
      return dir;
    }
  }
  return join(__dirname, 'assets');
}

async function bootstrap(): Promise<void> {
  const bootstrapLog = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const assetsDir = resolveBrandAssetsDir();
  const logoOk = existsSync(join(assetsDir, 'brand', 'logo-lamundial-sidebar.png'));
  bootstrapLog.log(`Brand assets dir=${assetsDir} logo=${logoOk ? 'OK' : 'MISSING'}`);

  const partnerConfig = readPartnerPackagesConfig();
  const loadedPartners = getLoadedPartnerPackageNames();
  if (partnerConfig) {
    bootstrapLog.log(`PARTNER_PACKAGES=${partnerConfig}`);
  }
  if (loadedPartners.length > 0) {
    bootstrapLog.log(`Partner modules loaded: ${loadedPartners.join(', ')}`);
  } else if (parsePartnerPackageNames(partnerConfig).length > 0) {
    bootstrapLog.warn('PARTNER_PACKAGES configurado pero ningún módulo cargó — revisar npm install');
  } else {
    bootstrapLog.log('Partner modules: none');
  }
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');
  const swaggerPath = config.get<string>('SWAGGER_PATH', 'docs');
  const publicPaths = resolvePublicApiPaths({
    publicApiPrefix: config.get<string>('PUBLIC_API_PREFIX'),
    publicApiOrigin: config.get<string>('PUBLIC_API_ORIGIN'),
  });

  const staticAssets = express.static(assetsDir, { index: false });
  app.getHttpAdapter().getInstance().use('/assets', staticAssets);
  // Con PUBLIC_API_PREFIX en PM2, Swagger pide /nest-api-docs/assets/… (también acceso directo :3002).
  if (publicPaths.prefix) {
    app.getHttpAdapter().getInstance().use(`${publicPaths.prefix}/assets`, staticAssets);
  }
  app.getHttpAdapter().getInstance().use(
    '/admin',
    express.static(join(assetsDir, 'admin'), {
      index: 'index.html',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      },
    }),
  );

  const brandLogoUrl = publicPaths.brandAssetUrl('brand/logo-lamundial-sidebar.png');
  const brandFaviconUrl = publicPaths.brandAssetUrl('brand/favicon-64.png');

  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');

  // Permitir acceso a la red privada (Private Network Access / LNA) para evitar bloqueos del navegador
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
  });

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    exposedHeaders: ['X-Nest-Access-Refreshed'],
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
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  const showInternalSwaggerServers =
    config.get<string>('SWAGGER_SHOW_INTERNAL_SERVERS') === 'true' || !publicPaths.prefix;

  if (swaggerPath) {
    const swaggerConfigBuilder = new DocumentBuilder()
      .setTitle(SWAGGER_BRAND_META.title)
      .setDescription(SWAGGER_API_DESCRIPTION)
      .setVersion(SWAGGER_BRAND_META.version)
      .addApiKey(
        {
          type: 'apiKey',
          name: 'apikey',
          in: 'header',
          description:
            'Clave de acceso a la API. Solo necesaria en emisión, cobranza y documentos (opcional en pruebas internas).',
        },
        'apikey',
      )
      .addBearerAuth();

    if (showInternalSwaggerServers) {
      const isQaOrigin = publicPaths.origin.includes('nexusqa');
      const internalHost = isQaOrigin ? '192.168.8.121' : '192.168.8.120';
      const internalLabel = isQaOrigin
        ? 'La Mundial — QA interno (121)'
        : 'La Mundial — desarrollo interno (120)';
      swaggerConfigBuilder
        .addServer(`http://${internalHost}:${port}`, internalLabel)
        .addServer(`http://localhost:${port}`, 'Desarrollo local (tu PC)');
    }
    if (publicPaths.prefix) {
      const serverLabel = publicPaths.origin.includes('nexusqa')
        ? 'La Mundial — QA HTTPS (nexusqa.exelixitech.com)'
        : 'La Mundial — Desarrollo HTTPS (cierrelmds.exelixitech.com)';
      swaggerConfigBuilder.addServer(publicPaths.publicBaseUrl, serverLabel);
      bootstrapLog.log(
        `Swagger server HTTPS: ${publicPaths.publicBaseUrl} (${serverLabel})`,
      );
    }

    const swaggerConfig = swaggerConfigBuilder
      .addTag(SWAGGER_TAGS.AUTH, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.AUTH])
      .addTag(SWAGGER_TAGS.INMA, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.INMA])
      .addTag(SWAGGER_TAGS.VALREP, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.VALREP])
      .addTag(SWAGGER_TAGS.EMISSION, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.EMISSION])
      .addTag(SWAGGER_TAGS.COLLECTION, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.COLLECTION])
      .addTag(SWAGGER_TAGS.DOCUMENTS, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.DOCUMENTS])
      .addTag(SWAGGER_TAGS.PERSONAS, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.PERSONAS])
      .addTag(SWAGGER_TAGS.CLIENT, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.CLIENT])
      .addTag(SWAGGER_TAGS.PARTNER, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.PARTNER])
      .addTag(SWAGGER_TAGS.CONDOMINIO, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.CONDOMINIO])
      .addTag(SWAGGER_TAGS.ENDOSOS, SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.ENDOSOS])
      .addTag(
        SWAGGER_TAGS.PRODUCT_EMISSION,
        SWAGGER_TAG_DESCRIPTIONS[SWAGGER_TAGS.PRODUCT_EMISSION],
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    normalizeSwaggerDocumentTags(document);
    document.security = [{ bearer: [] }, { apikey: [] }];
    for (const pathKey of Object.keys(document.paths ?? {})) {
      if (pathKey.includes('/auth/token') || pathKey.includes('/auth/refresh')) {
        for (const method of Object.values(document.paths[pathKey] ?? {})) {
          if (method && typeof method === 'object') {
            (method as { security?: unknown[] }).security = [];
          }
        }
      }
    }
    app.get(OpenApiDocumentStore).setDocument(document);

    // Copia sanitizada solo para swagger-ui-init.js (Nest String.replace + $')
    const documentForUi = sanitizeSwaggerDocForNestUi(
      JSON.parse(JSON.stringify(document)),
    );

    SwaggerModule.setup(swaggerPath, app, documentForUi, {
      customSiteTitle: SWAGGER_BRAND_META.siteTitle,
      customfavIcon: brandFaviconUrl,
      customCssUrl: LA_MUNDIAL_BRAND.fontsCss,
      customJsStr: `
(function() {
  /* ─────────────────────────────────────────────────────────
     Lee los tags directamente del DOM de Swagger UI.
     Funciona con cualquier número de secciones/APIs.
  ───────────────────────────────────────────────────────── */

  /* Swagger UI inserta <base href="/">: ../assets se resuelve como /assets (404 en cierrelmds).
     Usar rutas absolutas; fallback desde pathname si falta PUBLIC_API_PREFIX en el servidor. */
  var NEXUS_BRAND_LOGO = '${brandLogoUrl}';
  var NEXUS_BRAND_FAVICON = '${brandFaviconUrl}';
  function lmBrandAsset(rel) {
    var path = window.location.pathname.replace(/\\/docs\\/?$/, '');
    if (path) return path + '/assets/' + rel;
    return '/assets/' + rel;
  }
  (function fixBrandAssets() {
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(function(link) {
      link.href = lmBrandAsset('brand/favicon-64.png');
    });
  })();

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
    var nav = document.getElementById('lm-sidebar');
    if (!nav) return;
    nav.querySelectorAll('.sb-item').forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-tag') === tag);
    });
  }

  /* ── Toggle hamburguesa (móvil) ─────────────────────────── */
  function buildToggle() {
    if (document.getElementById('lm-toggle')) return;
    var btn = document.createElement('button');
    btn.id = 'lm-toggle';
    btn.setAttribute('aria-label', 'Menú');
    btn.innerHTML = '<span></span><span></span><span></span>';
    document.body.appendChild(btn);
    btn.addEventListener('click', function() {
      var nav = document.getElementById('lm-sidebar');
      var ov  = document.getElementById('lm-overlay');
      if (nav) nav.classList.toggle('open');
      if (ov)  ov.classList.toggle('visible');
    });
    var ov = document.createElement('div');
    ov.id = 'lm-overlay';
    ov.addEventListener('click', function() {
      var nav = document.getElementById('lm-sidebar');
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

    var existing = document.getElementById('lm-sidebar');
    if (existing) existing.remove();

    var nav = document.createElement('nav');
    nav.id = 'lm-sidebar';

    nav.innerHTML =
      '<div class="sb-brand">'
      + '<img class="sb-logo" src="' + lmBrandAsset('brand/logo-lamundial-sidebar.png') + '" alt="${LA_MUNDIAL_BRAND.name}" />'
      + '<p class="sb-tagline">${LA_MUNDIAL_BRAND.tagline}</p>'
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
      + '<span class="sb-ver-val">${SWAGGER_BRAND_META.sidebarApiVersion}</span>'
      + '</div>'
      + '<div class="sb-env-row">'
      + '<a class="sb-env-badge active" data-env="QA" href="#">QA</a>'
      + '<span class="sb-env-badge disabled" title="Disponible próximamente">PROD</span>'
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
        var ov = document.getElementById('lm-overlay');
        if (ov) ov.classList.remove('visible');
      });
    });

    /* ── Buscar / filtrar ───────────────── */
    var inp = nav.querySelector('.sb-search');
    if (inp) {
      inp.addEventListener('input', function() {
        var q = inp.value.toLowerCase();
        var visible = 0;
        nav.querySelectorAll('li').forEach(function(li) {
          var lbl = li.querySelector('.sb-label');
          var show = !q || (lbl && lbl.textContent.toLowerCase().indexOf(q) >= 0);
          li.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        var empty = nav.querySelector('.sb-empty');
        if (q && visible === 0) {
          if (!empty) {
            empty = document.createElement('p');
            empty.className = 'sb-empty';
            empty.textContent = 'Sin resultados';
            nav.querySelector('.sb-list').after(empty);
          }
        } else if (empty) {
          empty.remove();
        }
      });
    }

    wireEnvBadges(nav);

    /* ── Scroll-spy ─────────────────────── */
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) setActive(e.target.getAttribute('data-tag'));
      });
    }, { rootMargin: '-' + HEADER_H + 'px 0px -55% 0px', threshold: 0 });

    sections.forEach(function(s) { io.observe(s.el); });
    if (sections.length > 0) setActive(sections[0].tag);
  }

  /* ── QA / servidor Swagger ─────────────────────────────── */
  function autoSelectSwaggerServer() {
    var select = document.querySelector('.swagger-ui .servers select');
    if (!select || select.dataset.lmAuto) return;
    var origin = window.location.origin;
    var pathPrefix = window.location.pathname.replace(/\\/docs\\/?$/, '');
    var target = (pathPrefix ? origin + pathPrefix : origin).replace(/\\/+$/, '');
    Array.from(select.options).forEach(function(opt, idx) {
      if (opt.value.replace(/\\/+$/, '') === target) {
        select.selectedIndex = idx;
        select.dataset.lmAuto = '1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function wireEnvBadges(nav) {
    if (!nav || nav.dataset.envWired) return;
    nav.dataset.envWired = '1';
    nav.querySelectorAll('.sb-env-badge[data-env]').forEach(function(badge) {
      badge.addEventListener('click', function(e) {
        e.preventDefault();
        var env = badge.getAttribute('data-env');
        var select = document.querySelector('.swagger-ui .servers select');
        if (!select || !env) return;
        Array.from(select.options).forEach(function(opt, idx) {
          if (opt.text.toUpperCase().indexOf(env) >= 0) {
            select.selectedIndex = idx;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        nav.querySelectorAll('.sb-env-badge').forEach(function(b) { b.classList.remove('active'); });
        badge.classList.add('active');
      });
    });
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
    highlightAuthorize();
    autoSelectSwaggerServer();
  }

  function highlightAuthorize() {
    var btn = document.querySelector('.swagger-ui .auth-wrapper .btn.authorize');
    if (btn && !btn.dataset.lmHint) {
      btn.dataset.lmHint = '1';
      btn.setAttribute('title', 'Clave de API (solo emisión, cobranza y documentos)');
    }
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
           LA MUNDIAL DE SEGUROS · SWAGGER — Manual de identidad
           Azul Pennsylvania #0F1A5A · Rojo Imperial #E84F51 · Plata #ACACAC · Poppins
        ═══════════════════════════════════════════════════════ */
        @import url('${LA_MUNDIAL_BRAND.fontsCss}');

        /* ── Reset & base ──────────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; }
        body {
          background: #f0f2f5;
          font-family: 'Poppins', 'Segoe UI', Arial, sans-serif !important;
          margin: 0;
        }
        .swagger-ui {
          font-family: 'Poppins', 'Segoe UI', Arial, sans-serif !important;
          max-width: none !important;
          margin: 0 !important;
        }

        /* ════════════════════════════════════════════════════════
           SIDEBAR
        ════════════════════════════════════════════════════════ */
        #lm-sidebar {
          position: fixed;
          left: 0; top: 0;
          width: 210px; height: 100vh;
          background: linear-gradient(180deg, #091133 0%, #0F1A5A 45%, #2E6DBF 100%);
          z-index: 600;
          display: flex;
          flex-direction: column;
          box-shadow: 4px 0 24px rgba(0,0,0,0.45);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.12) transparent;
        }
        #lm-sidebar::-webkit-scrollbar { width: 4px; }
        #lm-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

        /* Brand */
        .sb-brand {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 20px 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .sb-logo {
          width: 100%; max-width: 168px; height: auto;
          object-fit: contain; flex-shrink: 0;
          image-rendering: -webkit-optimize-contrast;
        }
        .sb-tagline {
          margin: 10px 0 0; padding: 0;
          color: ${LA_MUNDIAL_BRAND.silverLight}; font-size: 0.65rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          font-family: 'Poppins', sans-serif;
        }
        .sb-bolt { display: none; }
        .sb-name { display: none; }
        .sb-env { display: none; }

        /* Search */
        .sb-search-wrap { padding: 10px 14px 4px; flex-shrink: 0; }
        .sb-search {
          width: 100%; padding: 7px 10px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 7px; color: #fff; font-size: 0.8rem;
          font-family: 'Poppins', sans-serif; outline: none;
          transition: border 0.2s, background 0.2s;
        }
        .sb-search::placeholder { color: rgba(255,255,255,0.3); }
        .sb-search:focus { border-color: #E84F51; background: rgba(232,79,81,0.12); }

        /* Nav label */
        .sb-nav-label {
          color: rgba(255,255,255,0.28); font-size: 0.58rem; font-weight: 700;
          letter-spacing: 0.16em; text-transform: uppercase;
          padding: 14px 16px 4px; font-family: 'Poppins', sans-serif; flex-shrink: 0;
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
        .sb-item:hover { background: rgba(232,79,81,0.08); border-left-color: rgba(232,79,81,0.5); }
        .sb-item.active { background: rgba(232,79,81,0.18); border-left-color: #E84F51; }

        .sb-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: rgba(255,255,255,0.2); flex-shrink: 0;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .sb-item.active .sb-dot { background: #E84F51; box-shadow: 0 0 8px rgba(232,79,81,0.7); }
        .sb-item:hover .sb-dot { background: rgba(255,255,255,0.5); }

        .sb-label {
          color: rgba(255,255,255,0.6); font-size: 0.8rem; font-weight: 500;
          line-height: 1.3; transition: color 0.15s; font-family: 'Poppins', sans-serif;
        }
        .sb-item:hover .sb-label { color: rgba(255,255,255,0.92); }
        .sb-item.active .sb-label { color: #fff; font-weight: 600; }

        /* Footer */
        .sb-spacer { flex: 1; min-height: 16px; }
        .sb-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
        .sb-ver-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .sb-ver-label {
          color: rgba(255,255,255,0.25); font-size: 0.62rem; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Poppins', sans-serif;
        }
        .sb-ver-val { color: #162a7f; font-size: 0.68rem; font-weight: 700; font-family: 'Poppins', sans-serif; }
        .sb-env-row { display: flex; gap: 6px; }
        .sb-env-badge {
          color: rgba(255,255,255,0.4) !important; font-size: 0.68rem; font-weight: 600;
          padding: 3px 10px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12);
          text-decoration: none !important; transition: all 0.2s; font-family: 'Poppins', sans-serif;
        }
        .sb-env-badge.active, .sb-env-badge:hover {
          color: #fff !important; border-color: #E84F51; background: rgba(232,79,81,0.35);
        }
        .sb-env-badge.disabled {
          opacity: 0.35; cursor: not-allowed; pointer-events: none;
        }
        .sb-empty {
          color: rgba(255,255,255,0.45); font-size: 0.75rem; text-align: center;
          padding: 8px 14px 0; margin: 0; font-family: 'Poppins', sans-serif;
        }

        /* ── Hamburger toggle ──────────────────────────────────── */
        #lm-toggle {
          display: none; position: fixed; top: 10px; left: 12px; z-index: 800;
          background: #0F1A5A; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; padding: 8px 10px; cursor: pointer;
          flex-direction: column; gap: 5px; align-items: center;
          box-shadow: 0 3px 12px rgba(0,0,0,0.4);
        }
        #lm-toggle span {
          display: block; width: 20px; height: 2px;
          background: #fff; border-radius: 2px; transition: all 0.25s;
        }
        #lm-overlay {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.5); z-index: 550;
        }
        #lm-overlay.visible { display: block; }

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
          background: #091133;
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
          font-family: 'Poppins', sans-serif; margin-right: auto;
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
          color: #0F1A5A !important;
          font-size: 1.8rem !important;
          font-weight: 800 !important;
          letter-spacing: -0.02em;
          line-height: 1.2;
          font-family: 'Poppins', sans-serif !important;
        }
        .swagger-ui .info .title small.version-stamp { vertical-align: middle; margin-left: 12px; }
        .swagger-ui .info .version-stamp .version {
          background: #E84F51; color: #fff;
          border-radius: 20px; padding: 2px 12px;
          font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .swagger-ui .info a.link { color: #E84F51 !important; }
        .swagger-ui .info p, .swagger-ui .info li {
          color: #4b5563 !important; font-size: 0.88rem; line-height: 1.65;
        }
        .swagger-ui .info .description table {
          border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.84rem;
          border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
        }
        .swagger-ui .info .description th {
          background: #0F1A5A; color: #fff;
          padding: 8px 14px; text-align: left; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.72rem;
        }
        .swagger-ui .info .description td {
          padding: 7px 14px; border-bottom: 1px solid #f0f4f8;
          color: #374151 !important;
        }
        .swagger-ui .info .description tr:last-child td { border-bottom: none; }
        .swagger-ui .info .description h3 {
          color: #0F1A5A !important; font-size: 1rem !important; font-weight: 700 !important;
          margin: 28px 0 10px !important; padding-bottom: 6px;
          border-bottom: 2px solid rgba(232,79,81,0.35);
          font-family: 'Poppins', sans-serif !important;
        }
        .swagger-ui .info .description blockquote {
          margin: 12px 0; padding: 10px 16px;
          background: rgba(46,109,191,0.06); border-left: 4px solid #2E6DBF;
          border-radius: 0 8px 8px 0; color: #374151 !important; font-size: 0.84rem;
        }
        .swagger-ui .info .description pre {
          background: #0F1A5A !important; color: #e2e8f0 !important;
          border-radius: 8px; padding: 12px 16px !important; font-size: 0.78rem;
          border: none !important; margin: 8px 0 16px;
        }
        .swagger-ui .info .description pre code {
          background: transparent !important; color: inherit !important; border: none !important;
          padding: 0 !important;
        }
        .swagger-ui .info .description code {
          background: rgba(46,109,191,0.1); color: #0F1A5A;
          border-radius: 4px; padding: 1px 7px; font-size: 0.82em;
          border: 1px solid rgba(46,109,191,0.35);
        }

        /* Auth button */
        .swagger-ui .auth-wrapper .btn.authorize {
          background: #E84F51 !important;
          border: 1px solid #E84F51 !important;
          color: #fff !important; border-radius: 8px !important;
          font-weight: 700 !important; padding: 8px 20px !important;
          transition: all 0.2s ease !important;
        }
        .swagger-ui .auth-wrapper .btn.authorize:hover {
          background: #0F1A5A !important;
          box-shadow: 0 4px 12px rgba(232,79,81,0.35) !important;
        }
        .swagger-ui .auth-wrapper .btn.authorize svg { fill: #fff; }

        /* Servers */
        .swagger-ui .servers > label { color: #4b5563 !important; font-size: 0.82rem; }
        .swagger-ui .servers select {
          border: 1px solid #d1d5db !important; border-radius: 6px !important;
          padding: 5px 10px; background: #fff !important; color: #0F1A5A !important;
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
          border-left: 5px solid #E84F51 !important;
        }
        .swagger-ui .opblock-tag:hover {
          background: #fff9f5 !important;
          box-shadow: 0 4px 16px rgba(232,79,81,0.12) !important;
          transform: translateX(2px);
        }
        .swagger-ui .opblock-tag span,
        .swagger-ui .opblock-tag a {
          color: #0F1A5A !important;
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
        .swagger-ui .opblock-tag svg { fill: #E84F51 !important; }

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
          box-shadow: 0 4px 20px rgba(232,79,81,0.15) !important;
          transform: none;
        }

        /* ── POST ──────────────────────────────────────────────── */
        .swagger-ui .opblock.opblock-post {
          border-color: #E84F51 !important;
          background: #fff9f5 !important;
        }
        .swagger-ui .opblock.opblock-post .opblock-summary { border-color: rgba(232,79,81,0.25) !important; }
        .swagger-ui .opblock.opblock-post .opblock-summary-method {
          background: linear-gradient(135deg, #E84F51, #b23f44) !important;
          border-radius: 6px !important;
          font-weight: 800 !important;
          font-size: 0.72rem !important;
          letter-spacing: 0.06em;
          min-width: 68px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(232,79,81,0.35);
        }

        /* ── GET ───────────────────────────────────────────────── */
        .swagger-ui .opblock.opblock-get {
          border-color: #162a7f !important;
          background: #f3f6fc !important;
        }
        .swagger-ui .opblock.opblock-get .opblock-summary { border-color: rgba(46,109,191,0.35) !important; }
        .swagger-ui .opblock.opblock-get .opblock-summary-method {
          background: linear-gradient(135deg, #2E6DBF, #0F1A5A) !important;
          border-radius: 6px !important;
          font-weight: 800 !important;
          font-size: 0.72rem !important;
          letter-spacing: 0.06em;
          min-width: 68px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(46,109,191,0.35);
        }

        /* ── Summary path & description ────────────────────────── */
        .swagger-ui .opblock-summary-path {
          font-family: 'Poppins', monospace !important;
          font-size: 0.88rem !important;
          font-weight: 600 !important;
          color: #0F1A5A !important;
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
          color: #0F1A5A !important;
          font-weight: 700 !important;
          font-size: 0.85rem !important;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* ── Parámetros / Body ─────────────────────────────────── */
        .swagger-ui .parameters-col_description p { color: #374151; font-size: 0.86rem; }
        .swagger-ui .parameter__name { color: #0f2544 !important; font-weight: 700 !important; }
        .swagger-ui .parameter__type { color: #E84F51 !important; font-size: 0.78rem; }
        .swagger-ui textarea.body-param__text {
          border: 1px solid rgba(232,79,81,0.3) !important;
          border-radius: 8px !important;
          font-family: 'Fira Code', monospace;
          font-size: 0.83rem !important;
          background: #f8fbff !important;
          padding: 12px !important;
        }
        .swagger-ui textarea.body-param__text:focus {
          border-color: #E84F51 !important;
          outline: none;
          box-shadow: 0 0 0 3px rgba(232,79,81,0.15) !important;
        }

        /* ── Botón Execute ─────────────────────────────────────── */
        .swagger-ui .btn.execute {
          background: linear-gradient(135deg, #0F1A5A, #E84F51) !important;
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
          box-shadow: 0 6px 16px rgba(232,79,81,0.4) !important;
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
        .swagger-ui .response-col_status { font-weight: 800 !important; font-size: 0.92rem !important; color: #374151 !important; }
        .swagger-ui .response .response-col_status code {
          padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;
        }
        .swagger-ui .response:has(.response-col_status code:contains('2')) .response-col_status code {
          background: #d1fae5; color: #065f46;
        }

        /* ── Paneles oscuros (Request URL, Curl, JSON, headers) ──
           Regla: fondo ${LA_MUNDIAL_BRAND.blue} → texto claro #e2e8f0 siempre.
           Evita syntax-highlight azul oscuro ilegible sobre fondo oscuro. */
        .swagger-ui .request-url,
        .swagger-ui .curl-command,
        .swagger-ui .highlight-code,
        .swagger-ui .responses-table .response-col_description pre,
        .swagger-ui .response-col_description__inner pre {
          background: ${LA_MUNDIAL_BRAND.blue} !important;
          border-radius: 8px !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #e2e8f0 !important;
        }
        .swagger-ui .request-url pre,
        .swagger-ui .request-url .microlight,
        .swagger-ui .curl-command pre,
        .swagger-ui .curl-command .curl,
        .swagger-ui .curl-command .microlight,
        .swagger-ui .highlight-code pre,
        .swagger-ui .highlight-code .microlight,
        .swagger-ui .responses-table .response-col_description pre,
        .swagger-ui .response-col_description__inner pre {
          background: transparent !important;
          color: #e2e8f0 !important;
          font-size: 0.82rem !important;
          padding: 12px 14px !important;
          margin: 0 !important;
          word-break: break-all !important;
          line-height: 1.55 !important;
        }
        .swagger-ui .request-url .microlight *,
        .swagger-ui .curl-command .microlight *,
        .swagger-ui .highlight-code .microlight *,
        .swagger-ui .request-url pre *,
        .swagger-ui .curl-command pre *,
        .swagger-ui .highlight-code pre *,
        .swagger-ui .responses-table .response-col_description pre *,
        .swagger-ui .response-col_description__inner pre * {
          color: #e2e8f0 !important;
          background: transparent !important;
          text-shadow: none !important;
        }
        /* Zonas claras: microlight legible sobre blanco */
        .swagger-ui .model-box .microlight,
        .swagger-ui .model .microlight,
        .swagger-ui .markdown .microlight,
        .swagger-ui .info .microlight {
          color: #374151 !important;
        }

        /* ── Curl (copy btn) ───────────────────────────────────── */
        .swagger-ui .copy-to-clipboard {
          background: ${LA_MUNDIAL_BRAND.red} !important;
          border-radius: 4px !important;
          border: none !important;
        }

        /* ── Input / Select en formularios ─────────────────────── */
        .swagger-ui input[type=text], .swagger-ui input[type=email],
        .swagger-ui input[type=file], .swagger-ui select {
          border: 1px solid #d1d5db !important;
          border-radius: 6px !important;
          padding: 6px 10px !important;
          font-family: 'Poppins', sans-serif !important;
          font-size: 0.85rem !important;
          transition: border 0.2s !important;
        }
        .swagger-ui input:focus, .swagger-ui select:focus {
          border-color: #E84F51 !important;
          box-shadow: 0 0 0 3px rgba(232,79,81,0.15) !important;
          outline: none !important;
        }

        /* ── Modal de Autorización ─────────────────────────────── */
        .swagger-ui .dialog-ux .modal-ux {
          border-radius: 16px !important;
          box-shadow: 0 20px 60px rgba(12,19,58,0.35) !important;
          border: 1px solid rgba(232,79,81,0.25) !important;
        }
        .swagger-ui .dialog-ux .modal-ux-header {
          background: linear-gradient(135deg, #0F1A5A, #E84F51) !important;
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
          background: #E84F51 !important;
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
          color: #0F1A5A !important;
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
        .swagger-ui .model-title { color: #0F1A5A !important; font-weight: 700 !important; }
        .swagger-ui .model { color: #374151; font-size: 0.85rem; }
        .swagger-ui .property-row .property-name { color: #E84F51 !important; font-weight: 600 !important; }

        /* ── Scrollbar ─────────────────────────────────────────── */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
        ::-webkit-scrollbar-thumb { background: #E84F51; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #0F1A5A; }

        /* ── Filter / Buscar ───────────────────────────────────── */
        .swagger-ui .filter .operation-filter-input {
          border: 1px solid rgba(232,79,81,0.3) !important;
          border-radius: 8px !important;
          padding: 8px 14px !important;
          font-size: 0.88rem !important;
          background: #fff !important;
          transition: all 0.2s !important;
        }
        .swagger-ui .filter .operation-filter-input:focus {
          border-color: #E84F51 !important;
          box-shadow: 0 0 0 3px rgba(232,79,81,0.15) !important;
          outline: none !important;
        }

        /* ── Try it out button ─────────────────────────────────── */
        .swagger-ui .try-out__btn {
          border: 1px solid #E84F51 !important;
          color: #E84F51 !important;
          border-radius: 6px !important;
          font-weight: 600 !important;
          background: transparent !important;
          transition: all 0.2s !important;
        }
        .swagger-ui .try-out__btn:hover {
          background: #E84F51 !important;
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
          #lm-sidebar { width: 180px; }
          #swagger-ui { margin-left: 180px !important; width: calc(100% - 180px) !important; }
          .sb-name { font-size: 0.95rem; }
          .sb-label { font-size: 0.75rem; }
        }

        /* Móvil: sidebar oculta, toggle visible */
        @media (max-width: 768px) {
          #lm-sidebar {
            width: 240px;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 700;
          }
          #lm-sidebar.open { transform: translateX(0); }

          #swagger-ui {
            margin-left: 0 !important;
            width: 100% !important;
          }

          #lm-toggle {
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
        tagsSorter: createBrowserTagsSorter(),
      },
    });

    const httpServer = app.getHttpAdapter().getInstance();
    const denyPublicSpec = (_req: express.Request, res: express.Response) => {
      res.status(404).json({
        statusCode: 404,
        message:
          'OpenAPI completo restringido. Use el enlace Swagger personalizado de su token en /admin/.',
      });
    };
    for (const suffix of ['-json', '-yaml']) {
      httpServer.get(`/${swaggerPath}${suffix}`, denyPublicSpec);
      if (publicPaths.prefix) {
        httpServer.get(`${publicPaths.prefix}/${swaggerPath}${suffix}`, denyPublicSpec);
      }
    }

    const clientDocsHtml = join(assetsDir, 'docs-client', 'index.html');
    const serveClientDocs = (_req: express.Request, res: express.Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(clientDocsHtml);
    };
    httpServer.get(`/${swaggerPath}/client/:docsSlug`, serveClientDocs);
    if (publicPaths.prefix) {
      httpServer.get(
        joinPublicPath(publicPaths.prefix, swaggerPath, 'client/:docsSlug'),
        serveClientDocs,
      );
    }
  }

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/api`);
  if (swaggerPath) {
    logger.log(`Swagger docs:  http://localhost:${port}/${swaggerPath}`);
    logger.log(`Admin keys UI: http://localhost:${port}/admin/`);
    logger.log(`Swagger por token: http://localhost:${port}/${swaggerPath}/client/{docsSlug}`);
    if (publicPaths.prefix) {
      logger.log(
        `Swagger HTTPS: ${publicPaths.publicBaseUrl}/${swaggerPath.replace(/^\/+/, '')}`,
      );
    }
  } else {
    logger.log('Swagger: deshabilitado (SWAGGER_PATH vacío)');
  }
}

bootstrap();
