import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { AnalisisIAResult } from './gemini.service';

const INSTRUCCIONES_JSON_SINIESTROS = `
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin bloques de código, solo el JSON puro.
Usa exactamente esta estructura:
{
  "resumen_ejecutivo": "string de 2 a 4 oraciones resumiendo el estado general de los siniestros, nivel de riesgo y hallazgos clave",
  "observaciones": [
    {
      "titulo": "string corto del hallazgo o alerta",
      "detalle": "string explicando qué nivel de fraude/riesgo existe, a qué segmento pertenece y por qué",
      "prioridad": "Alta",
      "recomendacion": "acción operativa recomendada",
      "origen_datos": "campo, KPI o gráfico exacto del que se extrajo el hallazgo",
      "metodologia": "razonamiento aplicado en una frase corta"
    }
  ],
  "estrategias": [
    "Acción operativa prioritaria 1",
    "Acción operativa prioritaria 2"
  ],
  "alertas": [
    "Alerta crítica de posible fraude o anomalía, citando el dato específico que la justifica"
  ]
}
Reglas Técnicas Estrictas:
- El JSON debe coincidir con la estructura mostrada.
- Las prioridades en observaciones deben ser exactamente: "Alta", "Media" o "Baja".
- Los campos origen_datos y metodologia son OBLIGATORIOS y deben extraerse de los datos estructurados entregados.
- ATENCIÓN: Respeta estrictamente TODAS las directrices, tonos, reglas de negocio y restricciones indicadas en el Prompt Base. El Prompt Base es la fuente principal de la verdad sobre CÓMO analizar, mientras que esta instrucción solo dicta el FORMATO JSON de salida.
`;

@Injectable()
export class SiniestrosIaService {
  private readonly logger = new Logger(SiniestrosIaService.name);

  constructor(private readonly config: ConfigService) {}

  private buildContextoDesdeDatos(datos: unknown): string {
    if (!datos) {
      return 'No se encontraron datos suficientes para el análisis.';
    }

    if (Array.isArray(datos)) {
      return datos
        .map((item, i) => {
          if (typeof item === 'object') {
            return `[${i + 1}] ${JSON.stringify(item)}`;
          }
          return `[${i + 1}] ${item}`;
        })
        .join('\n\n');
    }

    if (typeof datos === 'object') {
      return JSON.stringify(datos, null, 2);
    }

    return String(datos);
  }

  async generateSiniestrosInsights(
    promptBase: string | null,
    datosEstructurados: unknown,
  ): Promise<Omit<AnalisisIAResult, 'observaciones'> & {
    observaciones: Array<{
      titulo: string;
      detalle: string;
      prioridad: string;
      recomendacion: string;
      origen_datos: string;
      metodologia: string;
    }>;
  } | null> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY') || '';
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY no configurada.');
      return null;
    }

    if (!promptBase || !promptBase.trim()) {
      this.logger.warn('Sin prompt base — se omite la llamada a Gemini.');
      return null;
    }

    const model =
      this.config.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash-lite';
    const contexto = this.buildContextoDesdeDatos(datosEstructurados);

    const promptCompleto = [
      promptBase,
      '',
      'Base de análisis (Datos):',
      'Apóyate principalmente en los resultados de la búsqueda y los datos actuales proporcionados en el contexto para generar el análisis.',
      '',
      'Datos estructurados del reporte de Siniestros:',
      contexto,
      '',
      INSTRUCCIONES_JSON_SINIESTROS,
    ].join('\n');

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: promptCompleto,
      });

      const text = (response.text || '').trim();
      const clean = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(clean) as Record<string, unknown>;

      return {
        resumen_ejecutivo:
          typeof parsed.resumen_ejecutivo === 'string'
            ? parsed.resumen_ejecutivo
            : '',
        observaciones: Array.isArray(parsed.observaciones)
          ? (parsed.observaciones as Record<string, unknown>[]).map((h) => ({
              titulo: String(h.titulo || ''),
              detalle: String(h.detalle || ''),
              prioridad: ['Alta', 'Media', 'Baja'].includes(String(h.prioridad))
                ? String(h.prioridad)
                : 'Media',
              recomendacion:
                typeof h.recomendacion === 'string' ? h.recomendacion : '',
              origen_datos:
                typeof h.origen_datos === 'string' ? h.origen_datos : '',
              metodologia:
                typeof h.metodologia === 'string' ? h.metodologia : '',
            }))
          : [],
        estrategias: Array.isArray(parsed.estrategias)
          ? parsed.estrategias.map(String)
          : [],
        alertas: Array.isArray(parsed.alertas)
          ? parsed.alertas.map(String)
          : [],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error al generar insights con IA: ${message}`);
      return null;
    }
  }
}
