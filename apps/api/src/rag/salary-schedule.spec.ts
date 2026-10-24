import { parseSalarySchedule } from './salary-schedule';

const productionTable = `6 NORMAS LEGALES Sábado 29 de noviembre de 2025 El Peruano / 29944, Ley de Reforma Magisterial, en la suma de S/ 116,69 (CIENTO DIECISEIS Y 69/100 SOLES). Artículo 2.- Monto de la remuneración mensual a otorgarse al profesor contratado 2.1 El profesor contratado en el marco del Contrato de Servicio Docente de la Ley N° 30328, Ley que establece medidas en materia educativa y dicta otras disposiciones, percibe una remuneración mensual de acuerdo con la jornada laboral establecida para la modalidad, forma, nivel o ciclo en que presta sus servicios, regulada en la Ley N° 29944 y en la Ley N° 30328, conforme al siguiente detalle: Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70 Secundaria 30 3 500,70 Educación Básica Especial - EBE Inicial 30 3 500,70 Primaria 30 3 500,70 Educación Básica Alternativa - EBA Inicial / Intermedio 30 3 500,70 Avanzado 30 3 500,70 Educación Técnico Productiva - ETP Básico y Medio 30 3 500,70 2.2 El profesor contratado en el marco del Contrato de Servicio Docente de la Ley N° 30328, que labora menos de la jornada laboral establecida para la modalidad, forma, nivel o ciclo en que presta sus servicios, percibe la remuneración mensual de forma proporcional a las horas contratadas. 2.3 Los profesores contratados que prestan servicios como Profesor Coordinador perciben una remuneración mensual de S/ 4 667,60.`;

describe('parseSalarySchedule', () => {
  it('lee las ocho filas de la escala aplanada de producción', () => {
    const schedule = parseSalarySchedule(productionTable);

    expect(schedule?.rows).toHaveLength(8);
    expect(schedule?.rows[0]).toEqual({
      amount: 'S/ 3 500,70',
      hours: 30,
      level: 'Inicial',
      modality: 'Educación Básica Regular – EBR',
    });
    expect(schedule?.rows.at(-1)).toEqual({
      amount: 'S/ 3 500,70',
      hours: 30,
      level: 'Básico y Medio',
      modality: 'Educación Técnico Productiva – ETP',
    });
  });

  it('no confunde el numeral 2.2 con una fila ni con un importe', () => {
    const schedule = parseSalarySchedule(productionTable);

    expect(schedule?.rows.some((row) => row.amount.includes('2.2'))).toBe(
      false,
    );
    expect(schedule?.rows.some((row) => row.hours === 2)).toBe(false);
  });

  it('conserva la modalidad que agrupa varias filas', () => {
    const schedule = parseSalarySchedule(productionTable);
    const levels = schedule?.rows
      .filter((row) => row.modality === 'Educación Básica Especial – EBE')
      .map((row) => row.level);

    expect(levels).toEqual(['Inicial', 'Primaria']);
  });

  it('devuelve null si falta el encabezado de la tabla', () => {
    expect(
      parseSalarySchedule(
        'La remuneración mensual del profesor contratado es S/ 3 500,70.',
      ),
    ).toBeNull();
  });

  it('devuelve null si una fila queda sin leer', () => {
    const truncated = productionTable.replace(
      'Educación Técnico Productiva - ETP Básico y Medio 30 3 500,70',
      'Educación Técnico Productiva - ETP Básico y Medio 30 3 500,70 Secretaría de Gestión Educativa',
    );

    expect(parseSalarySchedule(truncated)?.rows).toHaveLength(8);
    expect(
      parseSalarySchedule(
        productionTable.replace(
          'Avanzado 30 3 500,70',
          'Avanzado 30 3 500,70 | Básico y Medio 30 3 500,70',
        ),
      ),
    ).toBeNull();
  });

  it('no publica una tabla parcial cuando la interrupción es extensa', () => {
    const broken = productionTable.replace(
      'Primaria 30 3 500,70 Secundaria 30 3 500,70',
      `Primaria 30 3 500,70 ${'texto ajeno '.repeat(40)} Secundaria 30 4 000,00`,
    );

    expect(parseSalarySchedule(broken)).toBeNull();
  });

  it('no toma un nivel con palabras intermedias como una jornada válida', () => {
    expect(
      parseSalarySchedule(
        'Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70 Inicial años 30',
      ),
    ).toBeNull();
  });

  it('acepta exactamente doce filas', () => {
    const rows = Array.from(
      { length: 12 },
      (_, index) =>
        `Educación Básica Regular - EBR Inicial 30 ${(3_000 + index).toString()}`,
    ).join(' ');

    expect(
      parseSalarySchedule(
        `Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ ${rows}`,
      )?.rows,
    ).toHaveLength(12);
  });

  it('no convierte el primer grupo de un importe en jornada', () => {
    expect(
      parseSalarySchedule(
        'Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 3 500,70 Primaria 30 3 500,70',
      ),
    ).toBeNull();
  });

  it('no acepta un importe de cinco cifras como jornada más importe', () => {
    expect(
      parseSalarySchedule(
        'Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 12 500,00 Primaria 12 500,00',
      ),
    ).toBeNull();
  });

  it('no publica una tabla parcial con un nivel desconocido', () => {
    expect(
      parseSalarySchedule(
        'Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70 Básico 30 3 500,70 Medio 30 3 500,70',
      ),
    ).toBeNull();
    expect(
      parseSalarySchedule(
        'Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70 Primaria 30 3 500,70 Ciclo I 30 3 500,70',
      ),
    ).toBeNull();
  });

  it('rechaza una jornada fuera de rango', () => {
    expect(
      parseSalarySchedule(
        productionTable.replace('Inicial 30 3 500,70', 'Inicial 90 3 500,70'),
      ),
    ).toBeNull();
  });

  it('acepta importes con formato de miles anglosajón', () => {
    const schedule = parseSalarySchedule(
      productionTable.replaceAll('3 500,70', '3,500.70'),
    );

    expect(schedule?.rows[0]?.amount).toBe('S/ 3,500.70');
  });

  it('rechaza una tabla de una sola fila', () => {
    expect(
      parseSalarySchedule(
        'Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ Educación Básica Regular - EBR Inicial 30 3 500,70',
      ),
    ).toBeNull();
  });

  it('rechaza una tabla sin filas', () => {
    expect(
      parseSalarySchedule(
        'Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/',
      ),
    ).toBeNull();
  });

  it('rechaza tablas de más de doce filas para no exceder la grilla', () => {
    const rows = Array.from(
      { length: 13 },
      (_, index) =>
        `Educación Básica Regular - EBR Inicial 30 ${(3_000 + index).toString()}`,
    ).join(' ');

    expect(
      parseSalarySchedule(
        `Modalidad / Forma Nivel / Ciclo Jornada laboral Remuneración mensual S/ ${rows}`,
      ),
    ).toBeNull();
  });
});
