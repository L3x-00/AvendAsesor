import { unbackedTableRows } from './answer-tables';

describe('unbackedTableRows', () => {
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

    expect(unbackedTableRows(answer, 1)).toEqual([]);
  });

  it('marca solo las filas sin cita válida', () => {
    const answer = [
      '| Jornada | Monto [1] |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 [1] |',
      '| 40 horas | S/ 4 400,80 |',
    ].join('\n');

    expect(unbackedTableRows(answer, 1)).toEqual(['40 horas S/ 4 400,80']);
  });

  it('no acepta una cita a una fuente inexistente', () => {
    const answer = [
      '| Jornada | Monto [9] |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 [9] |',
    ].join('\n');

    expect(unbackedTableRows(answer, 1)).toEqual(['30 horas S/ 3 300,60 [9]']);
  });

  it('acepta la cita agrupada y la de dos fuentes', () => {
    const answer = [
      '| Jornada | Monto |',
      '| --- | --- |',
      '| 30 horas | S/ 3 300,60 [1][2] |',
      '| 40 horas | S/ 4 400,80 [1, 2] |',
    ].join('\n');

    expect(unbackedTableRows(answer, 2)).toEqual([]);
  });

  it('ignora una barra en una oración normal', () => {
    const answer = [
      'El plazo es de 5 días | 10 días según el caso.',
      'Sigue el texto sin tabla.',
    ].join('\n');

    expect(unbackedTableRows(answer, 1)).toEqual([]);
  });

  it('ignora una cabecera con barras sin fila separadora', () => {
    const answer = ['| Jornada | Monto |', '| 30 horas | S/ 3 300,60 |'].join(
      '\n',
    );

    expect(unbackedTableRows(answer, 1)).toEqual([]);
  });

  it('ignora una tabla que excede el contrato de columnas', () => {
    const answer = [
      '| A | B | C | D | E |',
      '| --- | --- | --- | --- | --- |',
      '| 1 | 2 | 3 | 4 | 5 |',
    ].join('\n');

    expect(unbackedTableRows(answer, 1)).toEqual([]);
  });

  it('no marca nada cuando la respuesta no tiene tablas', () => {
    expect(
      unbackedTableRows(
        'La jornada de 30 horas corresponde a S/ 3 300,60. [1]',
        1,
      ),
    ).toEqual([]);
  });

  it('sin fuentes entregadas no hay tabla sustentable que evaluar', () => {
    expect(
      unbackedTableRows(
        ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'),
        0,
      ),
    ).toEqual([]);
  });
});
