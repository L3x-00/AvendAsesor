import {
  NoSupportMarkerFilter,
  RAG_NO_SUPPORT_MARKER,
} from './no-support-marker';

function run(tokens: string[]) {
  const filter = new NoSupportMarkerFilter();
  const emitted = tokens.map((token) => filter.push(token)).join('');
  const end = filter.finish();
  return {
    end,
    partial: filter.partialSupport,
    text: emitted + end.tail,
  };
}

describe('NoSupportMarkerFilter', () => {
  it('passes a normal answer through untouched', () => {
    expect(run(['El plazo ', 'es de 5 días [1].'])).toMatchObject({
      end: { noSupport: false },
      text: 'El plazo es de 5 días [1].',
    });
  });

  it('detects the marker at the start, even split across tokens and with leading spaces', () => {
    const result = run([
      '  \n[[SIN',
      '_SUST',
      'ENTO]]',
      ' Las fuentes no dicen nada.',
    ]);
    expect(result.end.noSupport).toBe(true);
    expect(result.text).toBe('');
  });

  it('treats a truncated marker as no support', () => {
    expect(run(['[[SIN_SUS']).end.noSupport).toBe(true);
  });

  it('strips a marker that appears after real content and flags partial support', () => {
    const result = run([
      'Los requisitos son A y B [1]. ',
      '[[SIN_',
      'SUSTENTO]]',
      ' El plazo no figura en los documentos.',
    ]);
    expect(result.end.noSupport).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.text).not.toContain(RAG_NO_SUPPORT_MARKER);
    expect(result.text).toContain('Los requisitos son A y B [1].');
    expect(result.text).toContain('El plazo no figura en los documentos.');
  });

  it('does not hold back brackets that are not the marker', () => {
    const filter = new NoSupportMarkerFilter();
    expect(filter.push('Ver [')).toBe('Ver ');
    expect(filter.push('1] y más.')).toBe('[1] y más.');
  });

  it('reports an empty answer as empty, not as no support', () => {
    expect(run(['   '])).toMatchObject({
      end: { noSupport: false, tail: '' },
      text: '',
    });
  });
});

describe('NoSupportMarkerFilter — variantes del modelo', () => {
  it.each([['[[SIN SUSTENTO]]'], ['[[ sin_sustento ]]'], ['[[Sin-Sustento]]']])(
    'reconoce la variante %s',
    (marker) => {
      expect(run([marker]).end.noSupport).toBe(true);
    },
  );

  it('trata la marca envuelta en formato como «sin sustento»', () => {
    const result = run(['**', '[[SIN_SUSTENTO]]', '**']);
    expect(result.end.noSupport).toBe(true);
    expect(result.text).toBe('');
  });

  it('no deja una marca re-formada al quitar una anidada', () => {
    const result = run([
      'Texto x',
      '[[SIN_SUS[[SIN_SUSTENTO]]TENTO]]',
      ' fin.',
    ]);
    expect(result.text).not.toMatch(/SIN_SUSTENTO/u);
    expect(result.partial).toBe(true);
  });

  it('libera una cita doble [[4]] cuando se cierra', () => {
    const result = run(['Según la norma ', '[[4', ']] el plazo es breve.']);
    expect(result.text).toBe('Según la norma [[4]] el plazo es breve.');
    expect(result.end.noSupport).toBe(false);
  });
});
