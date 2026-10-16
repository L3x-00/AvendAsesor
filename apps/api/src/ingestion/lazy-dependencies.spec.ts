jest.mock('js-tiktoken', () => {
  throw new Error('All token vocabularies loaded at boot');
});
jest.mock('js-tiktoken/ranks/o200k_base', () => {
  throw new Error('Ingestion vocabulary loaded at boot');
});
jest.mock('pdf-parse', () => {
  throw new Error('PDF renderer loaded at boot');
});
jest.mock('mammoth', () => {
  throw new Error('Word extractor loaded at boot');
});
jest.mock('tesseract.js', () => {
  throw new Error('OCR library loaded at boot');
});

describe('API document dependencies', () => {
  it('loads document services without loading extractors or token vocabularies', () => {
    expect(() => {
      jest.isolateModules(() => {
        // These explicit requires exercise the production import boundary.
        /* eslint-disable @typescript-eslint/no-require-imports */
        require('./chunking.service');
        require('./pdf-extraction.service');
        require('./docx-extraction.service');
        require('./ocr.service');
        require('../documents/pdf-inspection.service');
        /* eslint-enable @typescript-eslint/no-require-imports */
      });
    }).not.toThrow();
  });
});
