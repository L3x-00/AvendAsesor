import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  RETRIEVAL_RPC_ARG_NAMES,
  RETRIEVAL_RPC_NAME,
} from './retrieval.constants';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../supabase/migrations');

/**
 * Bloque de parámetros de la ÚLTIMA definición de la función en las migraciones
 * (los archivos se ordenan por nombre; la última `create [or replace]` gana).
 */
function latestFunctionParamBlock(fnName: string): string | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  let block: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    // Ancla en `create [or replace] function`, no en el `function` de
    // `revoke/grant ... on function ...(<tipos>)`, que no lleva nombres de
    // parámetros y podría capturar un bloque espurio.
    const pattern = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fnName}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
      'gi',
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql)) !== null) {
      block = match[1];
    }
  }
  return block;
}

describe('contrato de la RPC de retrieval (M7)', () => {
  it('la función que invoca el gateway existe en una migración con todos sus argumentos', () => {
    const params = latestFunctionParamBlock(RETRIEVAL_RPC_NAME);

    expect(params).not.toBeNull();
    for (const argument of RETRIEVAL_RPC_ARG_NAMES) {
      // Si una migración renombra la función o cambia un parámetro, esto falla
      // en CI antes de desplegar (en vez de un 503 silencioso en producción).
      expect(params).toContain(argument);
    }
    // La dimensión del embedding es parte del contrato: el gateway envía un
    // number[] de 1536; un cambio de modelo que altere la dimensión rompería el
    // runtime aunque los nombres de argumentos no cambien.
    expect(params).toMatch(/vector\s*\(\s*1536\s*\)/i);
  });
});
