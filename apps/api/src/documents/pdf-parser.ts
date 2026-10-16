import type { PDFParse } from 'pdf-parse';

/** Keep PDF.js and its native renderer out of text-only API requests. */
export function createPdfParser(
  options: ConstructorParameters<typeof PDFParse>[0],
): PDFParse {
  // CommonJS loading is intentional: callers and Jest use the same lazy loader.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const library = require('pdf-parse') as typeof import('pdf-parse');
  const { PDFParse: Parser } = library;
  return new Parser(options);
}
