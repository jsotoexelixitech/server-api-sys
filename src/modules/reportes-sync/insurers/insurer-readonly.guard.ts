/**
 * Garantiza que las consultas hacia la BD origen de la aseguradora sean solo lectura.
 */

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

export function assertReadOnlyQuery(queryText: string): void {
  if (!queryText || typeof queryText !== 'string') {
    throw new Error('Origen aseguradora: consulta inválida');
  }

  const stripped = stripSqlComments(queryText).trim();
  const statements = stripped
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  if (statements.length > 1) {
    throw new Error(
      'Origen aseguradora: solo se permite una sentencia SELECT por consulta',
    );
  }

  const sql = statements[0] || stripped;
  if (!/^(WITH|SELECT)\b/i.test(sql)) {
    throw new Error(
      'Origen aseguradora: solo se permiten consultas SELECT (lectura)',
    );
  }

  const writePattern =
    /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|EXEC|EXECUTE)\b/i;
  if (writePattern.test(sql)) {
    throw new Error(
      'Origen aseguradora: sentencias de modificación no permitidas',
    );
  }
}
