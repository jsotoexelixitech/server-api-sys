/**
 * Manual de Identidad — La Mundial de Seguros (colores y tipografía oficiales).
 * Logo: mismo asset que módulo emisión (`logo-lamundial-sidebar.png`).
 */
export const LA_MUNDIAL_BRAND = {
  name: 'La Mundial de Seguros',
  shortName: 'La Mundial',
  tagline: 'API RCV · Documentación',

  /** Azul Pennsylvania (principal) — alineado a modulo-emision/index.css */
  blue: '#0F1A5A',
  blueDark: '#091133',
  blueLight: '#162a7f',
  /** Acento gradiente sidebar (módulos) */
  blueAccent: '#2E6DBF',

  /** Rojo Imperial (secundario) */
  red: '#E84F51',
  redDark: '#b23f44',
  redLight: '#ff6675',

  /** Plata (terciario) */
  silver: '#ACACAC',
  silverDark: '#777777',
  silverLight: '#dddddd',

  /** Servido desde nest-api (`useStaticAssets` → /assets/brand/) */
  logoUrl: '/assets/brand/logo-lamundial-sidebar.png',
  faviconUrl: '/assets/brand/favicon-64.png',

  fontsCss:
    'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
} as const;

export const SWAGGER_BRAND_META = {
  title: 'La Mundial de Seguros · API RCV → Sis2000',
  siteTitle: 'La Mundial de Seguros · API RCV',
  version: '1.2.0-rcv',
  sidebarApiVersion: 'v1.2-rcv',
} as const;
