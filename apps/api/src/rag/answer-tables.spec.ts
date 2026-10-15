import { unsupportedTableRows } from './answer-tables';

describe('unsupportedTableRows', () => {
  // CR-07: la tabla solo se sostiene si cada fila cita una fuente entregada.
  it('no marca una tabla cuyas filas citan fuentes existentes', () => {
    const answer = [
      'Estas son las escalas:',
      '',
      '| Jornada | Monto [1] |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 [1] |',
      '| 40 horas | S/ 4 400,80 [1] |',
    ].join('\n');

    expect(unsupportedTableRows(answer, 1)).toEqual([]);
  });

  it('marca solo las filas sin cita válida', () => {
    const answer = [
      '| Jornada | Monto [1] |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 [1] |',
      '| 40 horas | S/ 4 400,80 |',
    ].join('\n');

    expect(unsupportedTableRows(answer, 1)).toEqual(['40 horas S/ 4 400,80']);
  });

  it('no acepta una cita a una fuente inexistente', () => {
    const answer = [
      '| Jornada | Monto [9] |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 [9] |',
    ].join('\n');

    expect(unsupportedTableRows(answer, 1)).toEqual([
      '30 horas S/ 3 300,60 [9]',
    ]);
  });

  it('acepta la cita agrupada y la de dos fuentes', () => {
    const answer = [
      '| Jornada | Monto |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 [1][2] |',
      '| 40 horas | S/ 4 400,80 [1, 2] |',
    ].join('\n');

    expect(unsupportedTableRows(answer, 2)).toEqual([]);
  });

  it('ignora una barra en una oración normal', () => {
    const answer = [
      'El plazo es de 5 días | 10 días según el caso.',
      'Sigue el texto sin tabla.',
    ].join('\n');

    expect(unsupportedTableRows(answer, 1)).toEqual([]);
  });

  it('ignora una cabecera con barras sin fila separadora', () => {
    const answer = ['| Jornada | Monto |', '| 30 horas | S/ 3 300,60 |'].join(
      '\n',
    );

    expect(unsupportedTableRows(answer, 1)).toEqual([]);
  });

  it('ignora una tabla que excede el contrato de columnas', () => {
    const answer = [
      '| A | B | C | D | E |',
      '| --- | --- | --- | --- | --- |',
      '| 1 | 2 | 3 | 4 | 5 |',
    ].join('\n');

    expect(unsupportedTableRows(answer, 1)).toEqual([]);
  });

  it('no marca nada cuando la respuesta no tiene tablas', () => {
    expect(
      unsupportedTableRows(
        'La jornada de 30 horas corresponde a S/ 3 300,60. [1]',
        1,
      ),
    ).toEqual([]);
  });

  it('sin fuentes entregadas no hay tabla sustentable que evaluar', () => {
    expect(
      unsupportedTableRows(
        ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'),
        0,
      ),
    ).toEqual([]);
  });

  // Revisión cruzada: la web rechaza la tabla entera cuando hay una séptima
  // fila, así que ninguna de sus filas se pinta como grilla; el caso debe
  // señalarse aunque todas citen una fuente.
  it('reporta las filas que exceden el tope del contrato', () => {
    const rows = Array.from(
      { length: 8 },
      (_value, index) => `| Motivo ${index + 1} | ${index + 1}0 días [1] |`,
    );
    const answer = ['| Motivo | Duración |', '| --- | --- |', ...rows].join(
      '\n',
    );

    expect(unsupportedTableRows(answer, 1)).toEqual([
      'Motivo 7 70 días [1]',
      'Motivo 8 80 días [1]',
    ]);
  });
});
