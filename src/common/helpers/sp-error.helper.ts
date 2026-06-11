export function parseSPError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  
  // Si el mensaje viene de un THROW 99001 en SQL Server, suele tener este formato:
  // "Error: 99001, State: 1, Class: 16, Message: El vehículo ya tiene una póliza vigente..."
  // o simplemente empezar con el error del driver MSSQL.
  
  const match = msg.match(/Message:\s*(.*?)(?:\r?\n|$)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Si no tiene el formato clásico, removemos prefijos comunes del driver mssql
  return msg
    .replace(/^RequestError: /i, '')
    .replace(/^Error: \d+, State: \d+, Class: \d+, /i, '')
    .trim();
}
