import { formatSalaryBulletsAsTable } from './salary-table-format';

describe('formatSalaryBulletsAsTable', () => {
  it('convierte las filas de una escala en una tabla Markdown con citas', () => {
    const answer = [
      'La remuneración varía según la modalidad:',
      '',
      '- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Inicial; Jornada laboral: 30; Remuneración mensual (S/): 3,500.70',
      '- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Primaria; Jornada laboral: 30; Remuneración mensual (S/): 3,500.70',
      '- Modalidad / Forma: Educación Básica Alternativa – EBA; Nivel / Ciclo: Avanzado; Jornada laboral: 30; Remuneración mensual (S/): 3,500.70',
      '',
      'Fuente: [1]',
    ].join('\n');

    const formatted = formatSalaryBulletsAsTable(answer);

    expect(formatted).toContain(
      '| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) |',
    );
    expect(formatted).toContain(
      '| Educación Básica Regular – EBR | Inicial | 30 | 3,500.70 [1] |',
    );
    expect(formatted).not.toContain('- Modalidad / Forma:');
  });

  it('no transforma una lista normal sin campos de escala', () => {
    const answer = [
      '- La licencia requiere certificado médico.',
      '- La solicitud se presenta en mesa de partes.',
    ].join('\n');

    expect(formatSalaryBulletsAsTable(answer)).toBe(answer);
  });

  it('respeta una tabla Markdown ya existente', () => {
    const answer = [
      '| Jornada | Remuneración |',
      '| --- | --- |',
      '| 30 horas | S/ 3,300.60 |',
    ].join('\n');

    expect(formatSalaryBulletsAsTable(answer)).toBe(answer);
  });
});
