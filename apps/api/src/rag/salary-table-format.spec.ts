import { formatSalaryBulletsAsTable } from './salary-table-format';

describe('formatSalaryBulletsAsTable', () => {
  it('convierte las filas de una escala sin reasignar la cita del bloque', () => {
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
      '| Educación Básica Regular – EBR | Inicial | 30 | 3,500.70 |',
    );
    expect(formatted).toContain('Fuente: [1]');
    expect(formatted).not.toContain('- Modalidad / Forma:');
  });

  it('convierte filas sin viñeta y separadas por líneas en blanco', () => {
    const answer = [
      'La remuneración varía según la modalidad:',
      '',
      'Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Inicial; Jornada laboral: 30; Remuneración mensual (S/): 3,300.60',
      '',
      'Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Primaria; Jornada laboral: 30; Remuneración mensual (S/): 3,300.60',
      '',
      'Fuente: [1] DS',
    ].join('\n');

    const formatted = formatSalaryBulletsAsTable(answer);

    expect(formatted).toContain(
      '| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) |',
    );
    expect(formatted).toContain(
      '| Educación Básica Regular – EBR | Inicial | 30 | 3,300.60 |',
    );
    expect(formatted).toContain('Fuente: [1] DS');
    expect(formatted).not.toContain('Modalidad / Forma: Educación');
  });

  it('no inventa una cita por fila aunque todo el bloque cite un documento', () => {
    const answer = [
      '- Modalidad: EBR; Nivel: Inicial; Remuneración: S/ 3 500,70',
      '- Modalidad: EBR; Nivel: Primaria; Remuneración: S/ 3 500,70',
      '',
      'La jornada menor se paga de forma proporcional. [1][2]',
    ].join('\n');

    const formatted = formatSalaryBulletsAsTable(answer);

    expect(formatted).toContain('| EBR | Inicial | S/ 3 500,70 |');
    expect(formatted).toContain('| EBR | Primaria | S/ 3 500,70 |');
    expect(formatted).toContain(
      'La jornada menor se paga de forma proporcional. [1][2]',
    );
  });

  it('no atribuye todas las filas a la primera cita si intervienen documentos distintos', () => {
    const answer = [
      '- Modalidad: EBR; Nivel: Inicial; Remuneración: S/ 3 500,70',
      '- Modalidad: EBE; Nivel: Primaria; Remuneración: S/ 3 500,70',
      '',
      'Fuentes: [1][2]',
    ].join('\n');

    const formatted = formatSalaryBulletsAsTable(answer);

    expect(formatted).toContain('| EBR | Inicial | S/ 3 500,70 |');
    expect(formatted).not.toContain('S/ 3 500,70 [1] |');
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

  it('deja intacto de forma atómica un bloque que supera doce filas', () => {
    const answer = Array.from(
      { length: 13 },
      (_, index) =>
        `- Modalidad: EBR; Nivel: ${index + 1}; Remuneración: S/ 3 500,70`,
    ).join('\n');

    expect(formatSalaryBulletsAsTable(answer)).toBe(answer);
  });
});
