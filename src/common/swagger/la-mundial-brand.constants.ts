/**
 * Manual de Identidad — La Mundial de Seguros (colores y tipografía oficiales).
 * Uso: documentación Swagger / UI estática. No altera contratos de la API.
 */
export const LA_MUNDIAL_BRAND = {
  name: 'La Mundial de Seguros',
  shortName: 'La Mundial',
  tagline: 'de Seguros · API RCV',

  /** Azul Pennsylvania (principal) */
  blue: '#0F1A5A',
  blueDark: '#091133',
  blueLight: '#162a7f',

  /** Rojo Imperial (secundario) */
  red: '#E84F51',
  redDark: '#b23f44',
  redLight: '#ff6675',

  /** Plata (terciario) */
  silver: '#ACACAC',
  silverDark: '#777777',
  silverLight: '#dddddd',

  logoUrl:
    'https://lamundialdeseguros.com/wp-content/uploads/2022/06/Logotipo-La-Mundial-RGB-3.png',

  fontsCss:
    'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
} as const;

export const SWAGGER_BRAND_META = {
  title: 'La Mundial de Seguros · API RCV → Sis2000',
  siteTitle: 'La Mundial de Seguros · API RCV',
  version: '1.2.0-rcv',
  sidebarApiVersion: 'v1.2-rcv',
} as const;
