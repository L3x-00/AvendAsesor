#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const DEMO_MARKER = 'avend-demo-2026';
const DEMO_DOMAIN = 'demo.avend.local';
const DEMO_PASSWORD = 'AvendDemo2026!';
const DEMO_CONSULTATION_REVISION = 'v5';
const EXPIRING_SOON_DAYS = 7;

const documentTypes = [
  'RESOLUCION_MINISTERIAL',
  'RESOLUCION_VICEMINISTERIAL',
  'RESOLUCION_DIRECTORAL',
  'DECRETO_SUPREMO',
  'DECRETO_LEGISLATIVO',
  'LEY',
  'REGLAMENTO',
  'DIRECTIVA',
  'NORMA_TECNICA',
  'OFICIO',
  'MEMORANDUM',
  'COMUNICADO',
  'CRONOGRAMA',
  'ANEXO',
  'INFORME',
  'INFOGRAFIA',
  'OTRO',
];

const entityDetails = [
  ['MINEDU', 'Dirección General de Desarrollo Docente'],
  ['MTPE', 'Dirección de Promoción del Empleo'],
  ['UGEL', 'UGEL 05 - San Juan de Lurigancho'],
  ['DRE_GRE', 'Dirección Regional de Educación de Lima Metropolitana'],
  ['SERVIR', 'Gerencia de Desarrollo de la Gerencia Pública'],
  ['SUNAFIL', 'Intendencia Nacional de Prevención y Asesoría'],
  ['MEF', 'Dirección General de Gestión Fiscal de los Recursos Humanos'],
  ['PCM', 'Secretaría de Gestión Pública'],
  ['CONGRESO_REPUBLICA', 'Comisión de Educación, Juventud y Deporte'],
  ['TRIBUNAL_CONSTITUCIONAL', 'Secretaría Relatoría'],
  ['DEFENSORIA_PUEBLO', 'Adjuntía para la Administración Estatal'],
  ['GOBIERNO_REGIONAL', 'Gerencia Regional de Desarrollo Social'],
  ['OTRA_INSTITUCION', 'Instituto Pedagógico Nacional Monterrico'],
];

const rootModules = [
  'CONTRATACION_DESPLAZAMIENTOS',
  'EVALUACION_DOCENTE',
  'SITUACIONES_ADMINISTRATIVAS',
  'AUXILIAR_EDUCACION',
  'LEY_REGLAMENTO',
  'CARGOS_PLAZAS',
  'REMUNERACIONES',
];

const rootModuleDetails = [
  {
    code: 'CONTRATACION_DESPLAZAMIENTOS',
    description: 'Procesos de contratación, encargatura y desplazamiento docente.',
    name: 'Contratación y desplazamientos',
    sortOrder: 10,
  },
  {
    code: 'EVALUACION_DOCENTE',
    description: 'Procesos de evaluación, nombramiento y desarrollo de la carrera docente.',
    name: 'Evaluación docente',
    sortOrder: 20,
  },
  {
    code: 'SITUACIONES_ADMINISTRATIVAS',
    description: 'Licencias, destaques y otras situaciones administrativas del personal docente.',
    name: 'Situaciones administrativas',
    sortOrder: 30,
  },
  {
    code: 'AUXILIAR_EDUCACION',
    description: 'Normativa y procesos aplicables a auxiliares de educación.',
    name: 'Auxiliar de educación',
    sortOrder: 40,
  },
  {
    code: 'LEY_REGLAMENTO',
    description: 'Ley de Reforma Magisterial y reglamento aplicable.',
    name: 'Ley y reglamento',
    sortOrder: 50,
  },
  {
    code: 'CARGOS_PLAZAS',
    description: 'Gestión de cargos, plazas y cuadro de horas pedagógicas.',
    name: 'Cargos y plazas',
    sortOrder: 60,
  },
  {
    code: 'REMUNERACIONES',
    description: 'Escalas remunerativas, asignaciones y bonificaciones docentes.',
    name: 'Remuneraciones',
    sortOrder: 70,
  },
];

const extraSubmodules = [
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'NOMBRAMIENTO_DOCENTE_INGRESO_CPM',
    name: 'Nombramiento Docente / Ingreso a la Carrera Pública Magisterial',
    description: 'Nombramiento docente e ingreso a la Carrera Pública Magisterial.',
    sortOrder: 10,
  },
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'CONTRATACION_DOCENTE',
    name: 'Contratación Docente',
    description: 'Proceso de contratación docente y criterios de adjudicación.',
    sortOrder: 20,
  },
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'ASCENSO_ESCALA_MAGISTERIAL',
    name: 'Ascenso de Escala Magisterial',
    description: 'Evaluación y requisitos para el ascenso de escala magisterial.',
    sortOrder: 30,
  },
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'ACCESO_CARGOS_DIRECTIVOS',
    name: 'Acceso a Cargos Directivos',
    description: 'Acceso a cargos directivos y especialistas en formación.',
    sortOrder: 40,
  },
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'ACCESO_ESPECIALISTA_EDUCACION',
    name: 'Acceso al cargo de Especialista en Educación',
    description: 'Acceso al cargo de especialista en educación.',
    sortOrder: 50,
  },
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'EVALUACION_DESEMPENO_DOCENTE',
    name: 'Evaluación del Desempeño Docente',
    description: 'Evaluación del desempeño docente y retroalimentación.',
    sortOrder: 60,
  },
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'EVALUACION_DESEMPENO_DIRECTIVOS',
    name: 'Evaluación del Desempeño de Directivos',
    description: 'Evaluación del desempeño de directivos de instituciones educativas.',
    sortOrder: 70,
  },
  {
    parentCode: 'EVALUACION_DOCENTE',
    code: 'PROCESOS_ESPECIFICOS',
    name: 'Procesos específicos (CETPRO, PRITE, MININTER y MINDEF)',
    description: 'Procesos específicos de CETPRO, PRITE, MININTER, MINDEF y otros.',
    sortOrder: 80,
  },
  {
    parentCode: 'CONTRATACION_DESPLAZAMIENTOS',
    code: 'REASIGNACION_DOCENTE',
    name: 'Reasignación docente',
    description: 'Procedimientos y criterios de reasignación del personal docente.',
    sortOrder: 10,
  },
  {
    parentCode: 'CONTRATACION_DESPLAZAMIENTOS',
    code: 'ENCARGATURA_DOCENTE',
    name: 'Encargatura docente',
    description: 'Normativa aplicable a encargaturas y desplazamientos docentes.',
    sortOrder: 20,
  },
  {
    parentCode: 'CONTRATACION_DESPLAZAMIENTOS',
    code: 'PERMUTA_DOCENTE',
    name: 'Permuta docente',
    description: 'Criterios, requisitos y plazos para permutas docentes.',
    sortOrder: 30,
  },
  {
    parentCode: 'SITUACIONES_ADMINISTRATIVAS',
    code: 'LICENCIAS_DOCENTES',
    name: 'Licencias docentes',
    description: 'Licencias con y sin goce de remuneraciones.',
    sortOrder: 10,
  },
  {
    parentCode: 'SITUACIONES_ADMINISTRATIVAS',
    code: 'DESTAQUES_DOCENTES',
    name: 'Destaques docentes',
    description: 'Destaques y rotaciones por necesidad de servicio.',
    sortOrder: 20,
  },
  {
    parentCode: 'SITUACIONES_ADMINISTRATIVAS',
    code: 'RECONOCIMIENTO_TIEMPO_SERVICIOS',
    name: 'Reconocimiento de tiempo de servicios',
    description: 'Reconocimiento de servicios y escalafón docente.',
    sortOrder: 30,
  },
  {
    parentCode: 'AUXILIAR_EDUCACION',
    code: 'CONTRATACION_AUXILIARES',
    name: 'Contratación de auxiliares de educación',
    description: 'Proceso de contratación de auxiliares de educación.',
    sortOrder: 10,
  },
  {
    parentCode: 'AUXILIAR_EDUCACION',
    code: 'EVALUACION_AUXILIARES',
    name: 'Evaluación de auxiliares de educación',
    description: 'Evaluación y desempeño de auxiliares de educación.',
    sortOrder: 20,
  },
  {
    parentCode: 'LEY_REGLAMENTO',
    code: 'LEY_REFORMA_MAGISTERIAL',
    name: 'Ley de Reforma Magisterial',
    description: 'Ley N.° 29944 y disposiciones complementarias.',
    sortOrder: 10,
  },
  {
    parentCode: 'LEY_REGLAMENTO',
    code: 'REGLAMENTO_REFORMA_MAGISTERIAL',
    name: 'Reglamento de la Ley de Reforma Magisterial',
    description: 'Reglamento y modificatorias de la Ley N.° 29944.',
    sortOrder: 20,
  },
  {
    parentCode: 'CARGOS_PLAZAS',
    code: 'CUADRO_HORAS_PEDAGOGICAS',
    name: 'Cuadro de horas pedagógicas',
    description: 'Criterios para la elaboración del cuadro de horas.',
    sortOrder: 10,
  },
  {
    parentCode: 'CARGOS_PLAZAS',
    code: 'RACIONALIZACION_PLAZAS',
    name: 'Racionalización de plazas',
    description: 'Racionalización de plazas docentes y auxiliares.',
    sortOrder: 20,
  },
  {
    parentCode: 'REMUNERACIONES',
    code: 'ESCALA_REMUNERATIVA',
    name: 'Escala remunerativa',
    description: 'Escala y componentes de la remuneración íntegra mensual.',
    sortOrder: 10,
  },
  {
    parentCode: 'REMUNERACIONES',
    code: 'ASIGNACIONES_BONIFICACIONES',
    name: 'Asignaciones y bonificaciones',
    description: 'Asignaciones temporales y bonificaciones docentes.',
    sortOrder: 20,
  },
];

const teachers = [
  'María Elena Quispe Huamán',
  'José Luis Cárdenas Salazar',
  'Rosa Milagros Gutiérrez Poma',
  'Víctor Manuel Huamán Rojas',
  'Carmen Julia Flores Paredes',
  'Carlos Alberto Chávez Lévano',
  'Ana Lucía Mendoza Torres',
  'Luis Fernando Rivas Palomino',
  'Patricia del Pilar Ramos Huerta',
  'Julio César Vargas Medina',
  'Milagros Yupanqui Cahuana',
  'Renato David Medina Rojas',
  'Gladys Maribel Huertas León',
  'Edgar Rolando Pineda Salas',
  'Norma Beatriz Alarcón Meza',
  'Wilmer Augusto Quispe Araujo',
  'Sonia Elizabeth Tello Ríos',
  'Héctor Raúl Gamarra Huerta',
  'Mónica Isabel Cueva Chávez',
  'Óscar Antonio Lazo Rojas',
  'Fanny Mercedes Cárdenas Paredes',
  'Richard Alonso Espinoza Flores',
  'Yolanda Maritza Salas Quispe',
  'Walter Martín Rojas Cárdenas',
  'Elsa Verónica Túpac Medina',
  'Miguel Ángel Huayta Flores',
  'Luz Marina Pacheco Cárdenas',
  'Juan Carlos Poma Sánchez',
  'Diana Carolina Asto Huamán',
  'César Augusto Lévano Vásquez',
  'María del Rosario Quiroz Rojas',
  'Pedro Pablo Chacón Cueva',
  'Claudia Milagros Gálvez Huamán',
  'Jorge Eduardo Condori Flores',
  'Nelly Patricia Cárdenas Quispe',
  'Raúl Enrique Taboada Salazar',
  'Inés del Carmen Huerta Ríos',
  'Fernando Javier Rojas Gutiérrez',
  'Maribel Soledad Paredes Vela',
  'Álvaro Sebastián Vilca Huamán',
  'Teresa Angélica Cárdenas Vera',
  'Marco Antonio Salinas Quispe',
  'Ruth Esperanza Mendoza Poma',
  'Diego Armando Flores Araujo',
  'Paola Andrea Luna Chávez',
  'Gustavo Adolfo Pinedo Rivas',
  'Julia Mercedes Huamán Tello',
  'Ricardo Iván Cárdenas Medina',
  'Carolina Beatriz Rojas Salas',
  'Manuel Jesús Quispe Flores',
  'Silvia Patricia Cueva Ramos',
  'Hugo Enrique Torres Huerta',
  'Noemí Rosario Poma Lévano',
  'Franklin David Salazar Chávez',
  'Elena Marisol Vargas Medina',
  'Roberto Carlos Huamán Asto',
];

const administrativeUsers = [
  {
    key: 'superadmin',
    fullName: 'Rosa Elena Valdivia Paredes',
    email: `rosa.valdivia@${DEMO_DOMAIN}`,
    phone: '999145620',
    role: 'superadmin',
    access: 'indefinite',
    label: 'Superadministradora',
  },
  {
    key: 'admin-modulos',
    fullName: 'Gabriel Martín Cárdenas León',
    email: `gabriel.cardenas@${DEMO_DOMAIN}`,
    phone: '987245631',
    role: 'admin',
    access: 'active',
    label: 'Administrador de módulos',
    modulesAccess: true,
  },
  {
    key: 'admin-documentos',
    fullName: 'Verónica Paola Salinas Rojas',
    email: `veronica.salinas@${DEMO_DOMAIN}`,
    phone: '986345742',
    role: 'admin',
    access: 'active',
    label: 'Administradora documental',
    modulesAccess: true,
  },
  {
    key: 'admin-consultas',
    fullName: 'Daniel Eduardo Quispe Medina',
    email: `daniel.quispe@${DEMO_DOMAIN}`,
    phone: '985456853',
    role: 'admin',
    access: 'active',
    label: 'Administrador de consultas y reportes',
    modulesAccess: false,
  },
  {
    key: 'gestor-contenido',
    fullName: 'Cecilia Maribel Huerta Poma',
    email: `cecilia.huerta@${DEMO_DOMAIN}`,
    phone: '984567964',
    role: 'admin',
    access: 'active',
    label: 'Gestora de contenido',
    modulesAccess: true,
  },
  {
    key: 'gestor-seguimiento',
    fullName: 'Renzo Alberto Chávez Ríos',
    email: `renzo.chavez@${DEMO_DOMAIN}`,
    phone: '983678175',
    role: 'admin',
    access: 'active',
    label: 'Gestor de seguimiento',
    modulesAccess: false,
  },
];

function failure(message) {
  throw new Error(`[demo-seed] ${message}`);
}

function stableUuid(value) {
  const bytes = createHash('sha1').update(`${DEMO_MARKER}:${value}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isoDaysFromNow(days, hour = 10) {
  const result = new Date();
  result.setUTCHours(hour, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

function isoHistoricalDaysFromNow(days, hour = 10) {
  const historical = new Date(isoDaysFromNow(days, hour));
  if (historical.getTime() < Date.now()) return historical.toISOString();
  const minutesAgo = Math.max(5, (12 - Math.min(hour, 11)) * 10);
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function profileCreatedAt(index) {
  return isoDaysFromNow(-120 + ((index * 7) % 110), 14);
}

function statusForTeacher(index) {
  if (index < 32) return 'active';
  if (index < 40) return 'expiring';
  if (index < 48) return 'expired';
  return 'suspended';
}

function teacherAccess(status, index) {
  if (status === 'expiring') {
    return {
      accessExpiresAt: isoDaysFromNow((index - 32) % EXPIRING_SOON_DAYS + 1, 23),
      accessStartAt: isoDaysFromNow(-180, 8),
    };
  }
  if (status === 'expired') {
    return {
      accessExpiresAt: isoDaysFromNow(-((index - 40) * 5 + 2), 23),
      accessStartAt: isoDaysFromNow(-365, 8),
    };
  }
  if (status === 'suspended') {
    return {
      accessExpiresAt: isoDaysFromNow(45 + ((index - 48) * 6), 23),
      accessStartAt: isoDaysFromNow(-220, 8),
    };
  }
  if (index % 3 === 0) {
    return { accessExpiresAt: null, accessStartAt: isoDaysFromNow(-180, 8) };
  }
  return {
    accessExpiresAt: isoDaysFromNow(30 + (index * 3), 23),
    accessStartAt: isoDaysFromNow(-180, 8),
  };
}

function demoUsers() {
  const teachersWithAccess = teachers.map((fullName, index) => {
    const status = statusForTeacher(index);
    const access = teacherAccess(status, index);
    return {
      key: `teacher-${String(index + 1).padStart(2, '0')}`,
      fullName,
      email: `docente.${String(index + 1).padStart(2, '0')}@${DEMO_DOMAIN}`,
      phone: `9${String(81234567 + index).padStart(8, '0')}`,
      role: 'docente',
      state: status,
      ...access,
    };
  });

  return [
    ...administrativeUsers.map((user, index) => ({
      ...user,
      state: 'active',
      accessExpiresAt: user.access === 'indefinite' ? null : isoDaysFromNow(180 + index * 15, 23),
      accessStartAt: isoDaysFromNow(-200, 8),
    })),
    ...teachersWithAccess,
  ];
}

function getLocalRuntime() {
  let rawStatus;
  try {
    const command = process.platform === 'win32' ? 'powershell.exe' : 'supabase';
    const argumentsList = process.platform === 'win32'
      ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'supabase status --output json']
      : ['status', '--output', 'json'];
    rawStatus = execFileSync(command, argumentsList, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    failure(`No se pudo consultar Supabase local: ${error.message}`);
  }

  let status;
  try {
    status = JSON.parse(rawStatus);
  } catch {
    failure('La salida de Supabase local no tiene el formato esperado.');
  }

  const apiUrl = status.API_URL;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  const anonKey = status.ANON_KEY;
  if (!apiUrl || !serviceRoleKey || !anonKey) {
    failure('Supabase local no expuso las credenciales de desarrollo requeridas.');
  }

  const host = new URL(apiUrl).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    failure('El seed solo permite una API Supabase local; se rechazó un destino remoto.');
  }

  const projectConfig = readFileSync(resolve(repositoryRoot, 'supabase', 'config.toml'), 'utf8');
  const configuredProject = projectConfig.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!configuredProject) {
    failure('No se pudo identificar el proyecto local de Supabase.');
  }

  const containers = execFileSync(
    'docker',
    [
      'ps',
      '--filter',
      `label=com.supabase.cli.project=${configuredProject}`,
      '--filter',
      'name=supabase_db_',
      '--format',
      '{{.Names}}',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);

  const expectedContainer = `supabase_db_${configuredProject}`.toLowerCase();
  const databaseContainer = containers.find(
    (container) => container.toLowerCase() === expectedContainer,
  );
  if (!databaseContainer) {
    failure('No se encontró el contenedor de base de datos local del proyecto actual.');
  }

  return {
    anonKey,
    apiUrl,
    databaseContainer,
    demoPassword: DEMO_PASSWORD,
    mode: 'local',
    moduleCodePrefix: '',
    serviceRoleKey,
  };
}

function createPdf(title, versionNumber, environment = 'entorno de demostración') {
  return new Promise((resolvePdf, rejectPdf) => {
    const document = new PDFDocument({
      info: { Author: 'AVEND ASESOR', Title: title },
      margin: 56,
      size: 'A4',
    });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', rejectPdf);
    document.on('end', () => resolvePdf(Buffer.concat(chunks)));
    document.fontSize(18).fillColor('#0f2d4f').text('AVEND ASESOR');
    document.moveDown(0.4);
    document.fontSize(12).fillColor('#111827').text('Documento ficticio para entorno de demostración');
    document.moveDown(1.2);
    document.fontSize(16).fillColor('#0f172a').text(title);
    document.moveDown(1);
    document.fontSize(10).fillColor('#334155').text(`Versión ${versionNumber} · Datos de demostración · No usar como sustento normativo real.`);
    document.moveDown(1.2);
    document.text(`Este archivo permite comprobar la visualización, descarga y el historial de versiones dentro del ${environment} de AVEND ASESOR.`);
    document.end();
  });
}

function textForDocumentType(type, sequence, year) {
  const number = String(81 + sequence * 7).padStart(3, '0');
  const labels = {
    RESOLUCION_MINISTERIAL: `RM N.° ${number}-${year}-MINEDU`,
    RESOLUCION_VICEMINISTERIAL: `RVM N.° ${number}-${year}-MINEDU`,
    RESOLUCION_DIRECTORAL: `RD N.° ${number}-${year}-MINEDU`,
    DECRETO_SUPREMO: `Decreto Supremo N.° ${String(sequence % 40 + 1).padStart(3, '0')}-${year}-PCM`,
    DECRETO_LEGISLATIVO: `Decreto Legislativo N.° ${String(sequence % 150 + 1200)}`,
    LEY: sequence % 2 === 0
      ? `Ley N.° 29944 - Ley de Reforma Magisterial (texto concordado ${year})`
      : `Ley N.° ${String(30000 + sequence)}`,
    REGLAMENTO: `Reglamento de la Ley N.° 29944 (texto actualizado ${year})`,
    DIRECTIVA: `Directiva N.° ${String(sequence % 50 + 1).padStart(3, '0')}-${year}-MINEDU/SG`,
    NORMA_TECNICA: `Norma Técnica para el Año Escolar ${year}`,
    OFICIO: `Oficio Múltiple N.° ${String(sequence % 400 + 100).padStart(3, '0')}-${year}-MINEDU`,
    MEMORANDUM: `Memorándum N.° ${String(sequence % 300 + 1).padStart(3, '0')}-${year}-MINEDU`,
    COMUNICADO: `Comunicado Oficial N.° ${String(sequence % 90 + 1).padStart(2, '0')}-${year}`,
    CRONOGRAMA: `Cronograma de actividades docentes ${year}`,
    ANEXO: `Anexo técnico de procedimientos docentes ${year}`,
    INFORME: `Informe técnico N.° ${String(sequence % 120 + 1).padStart(3, '0')}-${year}-MINEDU`,
    INFOGRAFIA: `Infografía orientadora para docentes ${year}`,
    OTRO: `Guía operativa de gestión educativa ${year}`,
  };
  return labels[type];
}

function documentPlans(leafModules) {
  const weightedLeafCodes = [
    ...Array(5).fill(['NOMBRAMIENTO_DOCENTE_INGRESO_CPM', 'CONTRATACION_DOCENTE', 'ASCENSO_ESCALA_MAGISTERIAL', 'ACCESO_CARGOS_DIRECTIVOS', 'ACCESO_ESPECIALISTA_EDUCACION', 'EVALUACION_DESEMPENO_DOCENTE', 'EVALUACION_DESEMPENO_DIRECTIVOS', 'PROCESOS_ESPECIFICOS']).flat(),
    ...Array(3).fill(['REASIGNACION_DOCENTE', 'ENCARGATURA_DOCENTE', 'PERMUTA_DOCENTE']).flat(),
    ...Array(2).fill(['LICENCIAS_DOCENTES', 'DESTAQUES_DOCENTES', 'RECONOCIMIENTO_TIEMPO_SERVICIOS']).flat(),
    'CONTRATACION_AUXILIARES',
    'EVALUACION_AUXILIARES',
    'LEY_REFORMA_MAGISTERIAL',
    'REGLAMENTO_REFORMA_MAGISTERIAL',
    'CUADRO_HORAS_PEDAGOGICAS',
    'RACIONALIZACION_PLAZAS',
    'ESCALA_REMUNERATIVA',
    'ASIGNACIONES_BONIFICACIONES',
  ].filter((code) => leafModules.has(code));

  if (!weightedLeafCodes.length) {
    failure('No se encontraron submódulos para asociar documentos de demostración.');
  }

  return Array.from({ length: 96 }, (_, index) => {
    const type = documentTypes[index % documentTypes.length];
    const [entity, specificDependency] = entityDetails[index % entityDetails.length];
    const year = 2026 - (index % 13);
    const situation = index < 70 ? 'current' : index < 86 ? 'replaced' : 'archived';
    const technicalStatus = index >= 90
      ? 'error'
      : index === 86
        ? 'ready'
        : (index >= 66 && index <= 69) || index >= 78
          ? 'pending'
          : 'ready';
    const leafCode = weightedLeafCodes[index % weightedLeafCodes.length];
    const secondLeafCode = index % 9 === 0
      ? weightedLeafCodes[(index + 1) % weightedLeafCodes.length]
      : null;
    const historicalSupportCode = situation === 'replaced'
      ? [
        'ASCENSO_ESCALA_MAGISTERIAL',
        'NOMBRAMIENTO_DOCENTE_INGRESO_CPM',
        'PERMUTA_DOCENTE',
        'RECONOCIMIENTO_TIEMPO_SERVICIOS',
        'ESCALA_REMUNERATIVA',
        'LEY_REFORMA_MAGISTERIAL',
      ][(index - 70) % 6]
      : null;
    const moduleCodes = [...new Set([leafCode, secondLeafCode, historicalSupportCode].filter(Boolean))];
    const title = textForDocumentType(type, index, year);
    const key = `document-${String(index + 1).padStart(3, '0')}`;
    return {
      archiveReasonCode: situation === 'archived'
        ? (index % 2 === 0 ? 'HISTORICAL_ANTECEDENT' : 'DEROGATED_OR_EXPIRED')
        : null,
      documentId: stableUuid(key),
      documentType: type,
      entity,
      key,
      metadata: {
        additionalDetail: index % 3 === 0 ? 'Equipo de gestión pedagógica' : undefined,
        demoKey: key,
        demoSeed: DEMO_MARKER,
        demoTechnicalStatus: technicalStatus,
        documentTypeOther: type === 'OTRO' ? 'Guía operativa' : undefined,
        issuingEntityOther: entity === 'OTRA_INSTITUCION' ? 'Instituto Pedagógico Nacional Monterrico' : undefined,
        keywords: `gestión docente, ${leafCode.toLowerCase().replaceAll('_', ' ')}, ${year}`,
        specificDependency,
      },
      moduleCodes,
      replacementDocumentId: situation === 'replaced'
        ? stableUuid(`document-${String(index - 69).padStart(3, '0')}`)
        : null,
      replacementYear: situation === 'replaced' ? year + 1 : null,
      resolutionNumber: title.replace(/^.*N\.°\s*/u, '').slice(0, 110),
      situation,
      technicalStatus,
      title,
      versionCount: technicalStatus === 'error' ? 1 : index % 20 === 0 ? 3 : index % 9 === 0 ? 2 : 1,
      versionId: stableUuid(`${key}:version-1`),
      year,
    };
  });
}

async function requireResult(operation, label) {
  const { data, error } = await operation;
  if (error) failure(`${label}: ${error.message}`);
  return data;
}

async function callRpc(client, name, args) {
  return requireResult(client.rpc(name, args), `RPC ${name}`);
}

async function listAllAuthUsers(client) {
  const users = [];
  let page = 1;
  while (true) {
    const response = await requireResult(
      client.auth.admin.listUsers({ page, perPage: 200 }),
      'No se pudo listar identidades locales',
    );
    users.push(...response.users);
    if (!response.nextPage || !response.users.length) return users;
    page = response.nextPage;
  }
}

async function ensureIdentity(client, runtime, user, usersByEmail) {
  const found = usersByEmail.get(user.email);
  const userMetadata = { demoSeed: DEMO_MARKER, full_name: user.fullName };
  const appMetadata = { demoSeed: DEMO_MARKER };

  if (found) {
    const isSeedIdentity = found.app_metadata?.demoSeed === DEMO_MARKER
      || (runtime.mode === 'local' && found.user_metadata?.demoSeed === DEMO_MARKER);
    if (!isSeedIdentity) {
      failure(`La identidad ${user.email} ya existe y no pertenece al seed de demostración.`);
    }
    await requireResult(
      client.auth.admin.updateUserById(found.id, {
        app_metadata: appMetadata,
        email_confirm: true,
        password: runtime.demoPassword,
        user_metadata: userMetadata,
      }),
      `No se pudo actualizar ${user.email}`,
    );
    return found.id;
  }

  const created = await requireResult(
    client.auth.admin.createUser({
      app_metadata: appMetadata,
      email: user.email,
      email_confirm: true,
      password: runtime.demoPassword,
      user_metadata: userMetadata,
    }),
    `No se pudo crear ${user.email}`,
  );
  if (!created.user?.id) failure(`Auth no devolvió ID para ${user.email}.`);
  usersByEmail.set(user.email, created.user);
  return created.user.id;
}

async function getProfile(client, userId) {
  return requireResult(
    client
      .from('profiles')
      .select('id, role, account_status, created_by')
      .eq('id', userId)
      .maybeSingle(),
    `No se pudo leer el perfil ${userId}`,
  );
}

function sqlText(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    failure('El seed recibió un identificador de perfil inválido.');
  }
  return `${sqlText(value)}::uuid`;
}

function applyProfilePatch(runtime, userId, profile) {
  const assignments = [
    `access_expires_at = ${sqlText(profile.accessExpiresAt)}::timestamptz`,
    `access_start_at = ${sqlText(profile.accessStartAt)}::timestamptz`,
    `account_status = ${sqlText(profile.accountStatus)}::public.account_status`,
    `created_at = ${sqlText(profile.createdAt)}::timestamptz`,
    `created_by = ${sqlUuid(profile.createdBy)}`,
    `full_name = ${sqlText(profile.fullName)}`,
    `last_access_at = ${sqlText(profile.lastAccessAt)}::timestamptz`,
    `phone = ${sqlText(profile.phone)}`,
    `role = ${sqlText(profile.role)}::public.app_role`,
    `status_changed_at = ${sqlText(profile.statusChangedAt)}::timestamptz`,
    `status_changed_by = ${profile.statusChangedBy ? sqlUuid(profile.statusChangedBy) : 'null'}`,
    `status_reason = ${sqlText(profile.statusReason)}`,
    `updated_by = ${sqlUuid(profile.updatedBy)}`,
    'updated_at = now()',
  ];
  executeSql(
    runtime,
    `update public.profiles set ${assignments.join(', ')} where id = ${sqlUuid(userId)};`,
    `No se pudo completar el perfil de demostración ${userId}`,
  );
}

async function seedUsers(client, runtime) {
  const users = demoUsers();
  const idsByKey = new Map();
  const usersByEmail = new Map((await listAllAuthUsers(client)).map((user) => [user.email, user]));
  for (const user of users) {
    idsByKey.set(user.key, await ensureIdentity(client, runtime, user, usersByEmail));
  }

  const superadministrator = users.find((user) => user.key === 'superadmin');
  const superadministratorId = idsByKey.get('superadmin');
  if (!superadministrator || !superadministratorId) failure('Falta la superadministradora de demostración.');

  const bootstrapProfile = await getProfile(client, superadministratorId);
  if (!bootstrapProfile) failure('El trigger de perfiles no creó la superadministradora local.');
  applyProfilePatch(runtime, superadministratorId, {
    accessExpiresAt: null,
    accessStartAt: isoDaysFromNow(-365, 8),
    accountStatus: 'active',
    createdAt: profileCreatedAt(0),
    createdBy: superadministratorId,
    fullName: superadministrator.fullName,
    lastAccessAt: isoDaysFromNow(-1, 11),
    phone: superadministrator.phone,
    role: 'superadmin',
    statusChangedAt: null,
    statusChangedBy: null,
    statusReason: null,
    updatedBy: superadministratorId,
  });

  for (const [index, user] of users.entries()) {
    if (user.key === 'superadmin') continue;
    const userId = idsByKey.get(user.key);
    if (!userId) failure(`Falta el ID de ${user.key}.`);
    const profile = await getProfile(client, userId);
    if (!profile) failure(`No existe el perfil de ${user.email}.`);

    if (profile.created_by === null) {
      await callRpc(client, 'provision_administrative_user', {
        p_access_expires_at: user.state === 'expiring' ? user.accessExpiresAt : null,
        p_access_start_at: user.accessStartAt,
        p_actor_id: superadministratorId,
        p_full_name: user.fullName,
        p_phone: user.phone,
        p_role: user.role,
        p_target_user_id: userId,
      });
    }

    const mustSuspend = user.state === 'suspended';
    const freshProfile = await getProfile(client, userId);
    if (mustSuspend && freshProfile?.account_status !== 'suspended') {
      await callRpc(client, 'update_administrative_user', {
        p_account_status: 'suspended',
        p_actor_id: superadministratorId,
        p_reason: 'Pausa temporal configurada para la demostración local.',
        p_role: user.role,
        p_target_user_id: userId,
      });
    }

    applyProfilePatch(runtime, userId, {
      accessExpiresAt: user.accessExpiresAt,
      accessStartAt: user.accessStartAt,
      accountStatus: mustSuspend ? 'suspended' : 'active',
      createdAt: profileCreatedAt(index),
      createdBy: superadministratorId,
      fullName: user.fullName,
      lastAccessAt: mustSuspend || user.state === 'expired' ? null : isoDaysFromNow(-(index % 12), 11),
      phone: user.phone,
      role: user.role,
      statusChangedAt: mustSuspend ? isoDaysFromNow(-((index % 30) + 2), 9) : null,
      statusChangedBy: mustSuspend ? superadministratorId : null,
      statusReason: mustSuspend ? 'Pausa temporal para demostración local.' : null,
      updatedBy: superadministratorId,
    });
  }

  for (const administrator of administrativeUsers.filter((user) => user.key !== 'superadmin')) {
    const userId = idsByKey.get(administrator.key);
    if (!userId) continue;
    const permission = await requireResult(
      client
        .from('admin_module_permissions')
        .select('can_access')
        .eq('user_id', userId)
        .maybeSingle(),
      `No se pudo revisar el permiso de ${administrator.email}`,
    );
    const desiredAccess = administrator.modulesAccess ?? false;
    const effectiveAccess = permission?.can_access ?? true;
    if (effectiveAccess === desiredAccess) continue;
    await callRpc(client, 'set_admin_module_permission', {
      p_actor_id: superadministratorId,
      p_can_access: desiredAccess,
      p_reason: `Permiso de demostración para ${administrator.label.toLowerCase()}.`,
      p_target_user_id: userId,
    });
  }

  return { idsByKey, superadministratorId, users };
}

function scopedModuleCode(runtime, code) {
  return `${runtime.moduleCodePrefix ?? ''}${code}`;
}

function logicalModuleMap(runtime, modules) {
  const actualByCode = new Map(modules.map((module) => [module.code, module]));
  return new Map(
    [...rootModules, ...extraSubmodules.map((module) => module.code)]
      .map((code) => [code, actualByCode.get(scopedModuleCode(runtime, code))])
      .filter(([, module]) => Boolean(module)),
  );
}

async function loadModuleMap(client, runtime) {
  const modules = await requireResult(
    client
      .from('modules')
      .select('id, code, name, parent_module_id, is_active')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('parent_module_id', { ascending: true, nullsFirst: true })
      .order('sort_order', { ascending: true })
      .order('code', { ascending: true }),
    'No se pudo leer la jerarquía de módulos',
  );
  return logicalModuleMap(runtime, modules);
}

function requireCanonicalRoots(moduleMap) {
  for (const rootCode of rootModules) {
    const root = moduleMap.get(rootCode);
    if (!root || root.parent_module_id !== null || root.is_active !== true) {
      failure(`El módulo canónico ${rootCode} debe ser una raíz activa.`);
    }
  }
}

async function ensureModules(client, runtime, superadministratorId) {
  const scopedRootCodes = rootModules.map((code) => scopedModuleCode(runtime, code));
  if (runtime.moduleCodePrefix) {
    for (const root of rootModuleDetails) {
      const code = scopedModuleCode(runtime, root.code);
      const existing = await requireResult(
        client
          .from('modules')
          .select('id, metadata')
          .eq('code', code)
          .maybeSingle(),
        `No se pudo revisar el módulo demo ${root.name}`,
      );
      const payload = {
        code,
        created_by: superadministratorId,
        description: root.description,
        id: existing?.id ?? stableUuid(`module:${code}`),
        is_active: true,
        is_deleted: false,
        metadata: { demoSeed: DEMO_MARKER, logicalCode: root.code },
        name: root.name,
        parent_module_id: null,
        sort_order: root.sortOrder,
        updated_by: superadministratorId,
      };
      if (existing?.metadata?.demoSeed === DEMO_MARKER) {
        await requireResult(client.from('modules').update(payload).eq('id', existing.id), `No se pudo actualizar ${root.name}`);
      } else if (existing) {
        failure(`El código aislado ${code} ya pertenece a un módulo no demostrativo.`);
      } else {
        await requireResult(client.from('modules').insert(payload), `No se pudo crear ${root.name}`);
      }
    }
  }

  const refreshedRoots = await requireResult(
    client
      .from('modules')
      .select('id, code, name, parent_module_id, is_active')
      .in('code', scopedRootCodes)
      .eq('is_deleted', false)
      .eq('is_active', true),
    'No se pudieron leer los módulos principales de demostración',
  );
  const rootMap = logicalModuleMap(runtime, refreshedRoots);
  requireCanonicalRoots(rootMap);
  const rootIds = new Map([...rootMap.entries()].map(([code, module]) => [code, module.id]));

  for (const submodule of extraSubmodules) {
    const parentModuleId = rootIds.get(submodule.parentCode);
    if (!parentModuleId) failure(`Falta el padre ${submodule.parentCode}.`);
    const code = scopedModuleCode(runtime, submodule.code);
    const existing = await requireResult(
      client
        .from('modules')
        .select('id, is_active, is_deleted, metadata, parent_module_id')
        .eq('code', code)
        .maybeSingle(),
      `No se pudo buscar el submódulo ${submodule.code}`,
    );
    const payload = {
      code,
      created_by: superadministratorId,
      description: submodule.description,
      id: existing?.id ?? stableUuid(`module:${code}`),
      is_active: true,
      is_deleted: false,
      metadata: { demoSeed: DEMO_MARKER, logicalCode: submodule.code },
      name: submodule.name,
      parent_module_id: parentModuleId,
      sort_order: submodule.sortOrder,
      updated_by: superadministratorId,
    };
    if (existing?.metadata?.demoSeed === DEMO_MARKER) {
      await requireResult(
        client.from('modules').update(payload).eq('id', existing.id),
        `No se pudo actualizar ${submodule.code}`,
      );
    } else if (existing) {
      if (
        existing.parent_module_id !== parentModuleId
        || existing.is_deleted
        || !existing.is_active
      ) {
        failure(`El código ${code} ya pertenece a un módulo no demostrativo incompatible.`);
      }
    } else {
      await requireResult(client.from('modules').insert(payload), `No se pudo crear ${submodule.code}`);
    }
  }
  const moduleMap = await loadModuleMap(client, runtime);
  requireCanonicalRoots(moduleMap);
  return moduleMap;
}

async function uploadPdf(client, runtime, storagePath, title, versionNumber) {
  const pdf = title.technicalStatus === 'error'
    ? Buffer.from(`AVEND ASESOR DEMO - archivo PDF ilegible para ${title.title}\n`, 'utf8')
    : await createPdf(title.title, versionNumber, runtime.pdfEnvironment);
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  await requireResult(
    client.storage.from('normative-documents').upload(storagePath, new Blob([pdf], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: runtime.mode !== 'production',
    }),
    `No se pudo subir ${storagePath}`,
  );
  return { pdf, sha256 };
}

function sqlSmallint(value) {
  return value === null || value === undefined ? 'null::smallint' : `${Number(value)}::smallint`;
}

function sqlBigint(value) {
  return `${Number(value)}::bigint`;
}

function sqlUuidArray(values) {
  if (!values.length) failure('La asociación documental local no puede quedar vacía.');
  return `array[${values.map(sqlUuid).join(', ')}]::uuid[]`;
}

function createGovernedDocument(runtime, plan, actorId, moduleIds, file, storagePath) {
  executeSql(
    runtime,
    `select public.create_governed_document_with_initial_version(
      ${sqlUuid(plan.documentId)}, ${sqlUuid(plan.versionId)}, ${sqlText(plan.title)},
      ${sqlText(plan.documentType)}, ${sqlText(plan.entity)}, ${sqlSmallint(plan.year)},
      ${sqlText(plan.resolutionNumber)}, null::text, ${sqlText(JSON.stringify(plan.metadata))}::jsonb,
      ${sqlUuidArray(moduleIds)}, ${sqlText(storagePath)}, ${sqlText(`${plan.key}-v1.pdf`)},
      ${sqlBigint(file.pdf.byteLength)}, 1, ${sqlText(file.sha256)}, ${sqlUuid(actorId)},
      ${sqlText(plan.situation)}::public.document_situation,
      ${sqlText(plan.situation === 'replaced' ? 'Sustituido por una disposición normativa posterior.' : null)},
      ${plan.replacementDocumentId ? sqlUuid(plan.replacementDocumentId) : 'null::uuid'},
      ${sqlText(plan.situation === 'replaced' ? `${plan.replacementYear}-01-15` : null)}::date,
      ${sqlSmallint(plan.replacementYear)},
      ${sqlText(plan.situation === 'archived'
        ? 'Conservado como antecedente histórico para la demostración.'
        : plan.situation === 'replaced'
          ? 'Existe una versión posterior vinculada en la biblioteca.'
          : null)},
      ${sqlText(plan.archiveReasonCode)}::public.document_archive_reason,
      null::text,
      ${sqlText(plan.technicalStatus === 'error'
        ? 'Fallo simulado de lectura OCR para demostrar el estado técnico Error.'
        : null)}
    );`,
    `No se pudo crear ${plan.title} en la base de demostración`,
  );
}

function addGovernedDocumentVersion(runtime, plan, actorId, versionId, versionNumber, file, storagePath) {
  executeSql(
    runtime,
    `select public.add_governed_document_version(
      ${sqlUuid(plan.documentId)}, ${sqlUuid(versionId)}, ${sqlText(storagePath)},
      ${sqlText(`${plan.key}-v${versionNumber}.pdf`)}, ${sqlBigint(file.pdf.byteLength)},
      1, ${sqlText(file.sha256)}, ${sqlUuid(actorId)}, null::text
    );`,
    `No se pudo añadir la versión ${versionNumber} de ${plan.title} en la base de demostración`,
  );
}

async function ensureDocumentVersions(client, runtime, plan, actorId, moduleIds) {
  let document = await requireResult(
    client.from('documents').select('id, current_version_id, metadata').eq('id', plan.documentId).maybeSingle(),
    `No se pudo buscar ${plan.title}`,
  );
  if (document && document.metadata?.demoSeed !== DEMO_MARKER) {
    failure(`El identificador de ${plan.title} ya pertenece a un documento no demostrativo.`);
  }

  if (!document) {
    const storagePath = `demo/${plan.documentId}/version-1.pdf`;
    const file = await uploadPdf(client, runtime, storagePath, plan, 1);
    createGovernedDocument(runtime, plan, actorId, moduleIds, file, storagePath);
    document = { id: plan.documentId, current_version_id: plan.versionId };
  }

  for (let versionNumber = 2; versionNumber <= plan.versionCount; versionNumber += 1) {
    const versionId = stableUuid(`${plan.key}:version-${versionNumber}`);
    const existingVersion = await requireResult(
      client.from('document_versions').select('id, document_id').eq('id', versionId).maybeSingle(),
      `No se pudo revisar la versión ${versionNumber} de ${plan.title}`,
    );
    if (existingVersion) {
      if (existingVersion.document_id !== plan.documentId) {
        failure(`La versión ${versionNumber} de ${plan.title} pertenece a otro documento.`);
      }
      continue;
    }
    const storagePath = `demo/${plan.documentId}/version-${versionNumber}.pdf`;
    const file = await uploadPdf(client, runtime, storagePath, plan, versionNumber);
    addGovernedDocumentVersion(runtime, plan, actorId, versionId, versionNumber, file, storagePath);
  }
}

async function ensureUnreadableDemoVersion(client, runtime, plan, actorId) {
  if (plan.technicalStatus !== 'error') return;
  const document = await requireResult(
    client
      .from('documents')
      .select('current_version_id, metadata')
      .eq('id', plan.documentId)
      .maybeSingle(),
    `No se pudo leer la versión actual de ${plan.title}`,
  );
  if (document && document.metadata?.demoSeed !== DEMO_MARKER) {
    failure(`El identificador de ${plan.title} ya pertenece a un documento no demostrativo.`);
  }
  if (!document?.current_version_id) failure(`No existe una versión actual para ${plan.title}.`);
  const currentVersion = await requireResult(
    client
      .from('document_versions')
      .select('ingestion_status')
      .eq('id', document.current_version_id)
      .maybeSingle(),
    `No se pudo leer el estado de ${plan.title}`,
  );
  if (currentVersion?.ingestion_status === 'failed') return;

  const errorVersionId = stableUuid(`${plan.key}:unreadable-version`);
  const existingVersion = await requireResult(
    client.from('document_versions').select('id, document_id').eq('id', errorVersionId).maybeSingle(),
    `No se pudo revisar la versión ilegible de ${plan.title}`,
  );
  if (existingVersion) {
    if (existingVersion.document_id !== plan.documentId) {
      failure(`La versión ilegible de ${plan.title} pertenece a otro documento.`);
    }
    return;
  }
  const storagePath = `demo/${plan.documentId}/unreadable-version.pdf`;
  const file = await uploadPdf(client, runtime, storagePath, plan, 99);
  addGovernedDocumentVersion(runtime, plan, actorId, errorVersionId, 99, file, storagePath);
}

function synchronizeDemoDocumentPlan(runtime, plan, actorId, moduleIds) {
  executeSql(
    runtime,
    `
do $$
begin
  if not exists (
    select 1
    from public.documents
    where id = ${sqlUuid(plan.documentId)}
      and metadata ->> 'demoSeed' = ${sqlText(DEMO_MARKER)}
  ) then
    raise exception 'DEMO_DOCUMENT_OWNERSHIP_MISMATCH';
  end if;
end;
$$;

update public.documents
set
  metadata = ${sqlText(JSON.stringify(plan.metadata))}::jsonb,
  updated_at = now(),
  updated_by = ${sqlUuid(actorId)}
where id = ${sqlUuid(plan.documentId)}
  and metadata ->> 'demoSeed' = ${sqlText(DEMO_MARKER)};

insert into public.document_modules (document_id, module_id)
select ${sqlUuid(plan.documentId)}, module_id
from unnest(${sqlUuidArray(moduleIds)}) as module_id
where exists (
  select 1
  from public.documents
  where id = ${sqlUuid(plan.documentId)}
    and metadata ->> 'demoSeed' = ${sqlText(DEMO_MARKER)}
)
on conflict (document_id, module_id) do nothing;
`,
    `No se pudo sincronizar ${plan.title} en la base de demostración`,
  );
}

function executeSql(runtime, sql, label) {
  if (runtime.mode === 'production') {
    return runtime.executeSql(sql, label);
  }
  const execution = spawnSync(
    'docker',
    ['exec', '-i', runtime.databaseContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { cwd: repositoryRoot, encoding: 'utf8', input: sql },
  );
  if (execution.status !== 0) {
    failure(`${label}: ${(execution.stderr || execution.stdout || 'psql failed').trim()}`);
  }
  return execution.stdout;
}

async function indexReadyDocuments(client, runtime, superadministratorId) {
  const safeMarker = DEMO_MARKER.replaceAll("'", "''");
  executeSql(runtime, `
begin;
with ready_documents as (
  select document.id, document.current_version_id, document.title
  from public.documents as document
  where document.metadata ->> 'demoSeed' = '${safeMarker}'
    and document.metadata ->> 'demoTechnicalStatus' = 'ready'
)
insert into public.document_chunks (
  document_id, document_version_id, chunk_index, chunk_content, token_count,
  page_start, page_end, section_title, article_reference, numeral_reference,
  embedding
)
select
  ready.id,
  ready.current_version_id,
  0,
  format('Resumen demostrativo de %s. Este contenido ficticio permite mostrar fuentes y consultas históricas dentro del entorno local.', ready.title),
  50,
  1,
  1,
  'Resumen de demostración',
  null,
  null,
  array(
    select (
      (
        case when series.position % 2 = 0 then 0.01::real else -0.01::real end
      ) + (
        (
          get_byte(
            decode(md5(ready.id::text || ':' || series.position::text), 'hex'),
            0
          )::real - 127.5::real
        ) / 100000.0::real
      )
    )::real
    from generate_series(1, 1536) as series(position)
    order by series.position
  )::extensions.vector
from ready_documents as ready
on conflict (document_version_id, chunk_index) do update
set embedding = excluded.embedding
where public.document_chunks.document_id = excluded.document_id;

do $$
declare
  target record;
begin
  for target in
    select document.current_version_id, version.ingestion_status
    from public.documents as document
    join public.document_versions as version on version.id = document.current_version_id
    where document.metadata ->> 'demoSeed' = '${safeMarker}'
      and document.metadata ->> 'demoTechnicalStatus' = 'ready'
  loop
    if target.ingestion_status = 'pending'::public.document_ingestion_status then
      perform private.set_document_ingestion_status(target.current_version_id, 'processing');
    end if;
    if target.ingestion_status in ('pending'::public.document_ingestion_status, 'processing'::public.document_ingestion_status) then
      perform private.set_document_ingestion_status(target.current_version_id, 'indexed');
    end if;
    update public.document_ingestion_jobs
    set status = 'completed',
        completed_at = now(),
        updated_at = now(),
        last_error_code = null,
        last_error_message = null
    where document_version_id = target.current_version_id;
  end loop;
end;
$$;
commit;
`, 'No se pudo indexar el corpus de demostración local');

  const readyDocuments = await requireResult(
    client
      .from('documents')
      .select('id, approval_status')
      .contains('metadata', { demoSeed: DEMO_MARKER, demoTechnicalStatus: 'ready' }),
    'No se pudieron revisar los documentos listos',
  );
  for (const document of readyDocuments) {
    if (document.approval_status === 'ready') continue;
    await callRpc(client, 'set_document_technical_status', {
      p_actor_id: superadministratorId,
      p_document_id: document.id,
      p_technical_status: 'ready',
    });
  }
}

async function synchronizeDemoDocumentTechnicalStates(client, runtime, plans, superadministratorId) {
  const documents = await requireResult(
    client
      .from('documents')
      .select('id, current_version_id, approval_status, metadata')
      .contains('metadata', { demoSeed: DEMO_MARKER }),
    'No se pudieron leer los estados técnicos demostrativos',
  );
  const versions = await requireResult(
    client
      .from('document_versions')
      .select('id, ingestion_status')
      .in('id', documents.map((document) => document.current_version_id)),
    'No se pudieron leer las versiones demostrativas',
  );
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const ingestionUpdates = [];
  for (const plan of plans) {
    const document = documentById.get(plan.documentId);
    const version = document ? versionById.get(document.current_version_id) : null;
    if (!document || !version) failure(`No existe la versión técnica de ${plan.title}.`);
    const desiredApproval = plan.technicalStatus === 'ready' ? 'ready' : 'pending_approval';
    if (document.approval_status !== desiredApproval && desiredApproval === 'pending_approval') {
      await callRpc(client, 'set_document_technical_status', {
        p_actor_id: superadministratorId,
        p_document_id: plan.documentId,
        p_technical_status: 'pending_approval',
      });
    }
    const desiredIngestion = plan.technicalStatus === 'error'
      ? 'failed'
      : plan.technicalStatus === 'pending'
        ? 'pending'
        : version.ingestion_status === 'indexed'
          ? null
          : 'pending';
    if (desiredIngestion && version.ingestion_status !== desiredIngestion) {
      ingestionUpdates.push({ desiredIngestion, plan, versionId: document.current_version_id });
    }
  }
  if (!ingestionUpdates.length) return;

  const values = ingestionUpdates.map((update) => `(
    ${sqlUuid(update.versionId)},
    ${sqlText(update.desiredIngestion)},
    ${sqlText(update.plan.technicalStatus === 'error'
      ? 'DEMO_UNREADABLE_PDF'
      : null)},
    ${sqlText(update.plan.technicalStatus === 'error'
      ? 'El archivo de demostración no pudo leerse durante el procesamiento.'
      : null)}
  )`).join(',\n');
  executeSql(runtime, `
begin;
with targets (document_version_id, ingestion_status, error_code, error_message) as (
  values ${values}
)
select private.set_document_ingestion_status(
  target.document_version_id,
  target.ingestion_status
)
from targets as target;

with targets (document_version_id, ingestion_status, error_code, error_message) as (
  values ${values}
)
update public.document_ingestion_jobs as job
set
  status = case target.ingestion_status
    when 'failed' then 'failed'::public.document_ingestion_job_status
    else 'pending'::public.document_ingestion_job_status
  end,
  completed_at = case when target.ingestion_status = 'failed' then now() else null end,
  last_error_code = target.error_code,
  last_error_message = target.error_message,
  lease_token = null,
  leased_at = null,
  lease_expires_at = null,
  updated_at = now()
from targets as target
where job.document_version_id = target.document_version_id;
commit;
`, 'No se pudieron sincronizar los estados técnicos demostrativos');
}

async function loadDemoDocumentsWithModules(client) {
  const documents = await requireResult(
    client
      .from('documents')
      .select('id, current_version_id, metadata, situation')
      .contains('metadata', { demoSeed: DEMO_MARKER }),
    'No se pudieron leer los documentos de demostración',
  );
  const documentIds = documents.map((document) => document.id);
  const associations = documentIds.length
    ? await requireResult(
      client
        .from('document_modules')
        .select('document_id, module_id')
        .in('document_id', documentIds),
      'No se pudieron leer las asociaciones documentales de demostración',
    )
    : [];
  const moduleIdsByDocument = new Map();
  for (const association of associations) {
    const linkedModules = moduleIdsByDocument.get(association.document_id) ?? [];
    linkedModules.push(association.module_id);
    moduleIdsByDocument.set(association.document_id, linkedModules);
  }
  return documents.map((document) => ({
    ...document,
    moduleIds: moduleIdsByDocument.get(document.id) ?? [],
  }));
}

async function seedDocuments(client, runtime, moduleMap, superadministratorId, idsByKey) {
  const plans = documentPlans(moduleMap);
  const authors = administrativeUsers
    .filter((user) => user.key !== 'superadmin')
    .map((user) => idsByKey.get(user.key))
    .filter(Boolean);
  if (!authors.length) failure('No hay administradores de demostración para la trazabilidad documental.');

  const orderedPlans = [...plans].sort((first, second) => {
    const rank = { current: 0, replaced: 1, archived: 2 };
    return rank[first.situation] - rank[second.situation];
  });
  for (const [index, plan] of orderedPlans.entries()) {
    const moduleIds = plan.moduleCodes.map((code) => moduleMap.get(code)?.id).filter(Boolean);
    if (moduleIds.length !== plan.moduleCodes.length) {
      failure(`Falta una asociación de módulo para ${plan.key}.`);
    }
    const actorId = authors[index % authors.length] ?? superadministratorId;
    await ensureDocumentVersions(client, runtime, plan, actorId, moduleIds);
    await ensureUnreadableDemoVersion(client, runtime, plan, actorId);
    synchronizeDemoDocumentPlan(runtime, plan, actorId, moduleIds);
  }

  await synchronizeDemoDocumentTechnicalStates(client, runtime, plans, superadministratorId);
  await indexReadyDocuments(client, runtime, superadministratorId);
  return {
    documents: await loadDemoDocumentsWithModules(client),
    plans,
  };
}

function consultationPlans(moduleMap, documents) {
  const readyCurrentDocuments = documents.filter(
    (document) => document.metadata?.demoTechnicalStatus === 'ready'
      && document.situation === 'current'
      && document.current_version_id,
  );
  const readyHistoricalDocuments = documents.filter(
    (document) => document.metadata?.demoTechnicalStatus === 'ready'
      && document.situation === 'replaced'
      && document.current_version_id,
  );
  if (!readyCurrentDocuments.length || !readyHistoricalDocuments.length) {
    failure('No hay documentos vigentes y reemplazados listos para las consultas demostrativas.');
  }

  const weightedRoots = [
    ...Array(14).fill('EVALUACION_DOCENTE'),
    ...Array(9).fill('CONTRATACION_DESPLAZAMIENTOS'),
    ...Array(7).fill('SITUACIONES_ADMINISTRATIVAS'),
    ...Array(5).fill('REMUNERACIONES'),
    ...Array(4).fill('LEY_REGLAMENTO'),
    ...Array(3).fill('CARGOS_PLAZAS'),
    ...Array(2).fill('AUXILIAR_EDUCACION'),
  ];
  const leavesByRoot = new Map();
  for (const module of moduleMap.values()) {
    if (!module.parent_module_id) continue;
    const parent = [...moduleMap.values()].find((candidate) => candidate.id === module.parent_module_id);
    if (!parent) continue;
    const existing = leavesByRoot.get(parent.code) ?? [];
    existing.push(module);
    leavesByRoot.set(parent.code, existing);
  }

  return Array.from({ length: 44 }, (_, index) => {
    const rootCode = weightedRoots[index % weightedRoots.length];
    const choices = leavesByRoot.get(rootCode) ?? [];
    const leaf = choices[index % choices.length];
    const issue = ['support_insufficient', 'support_partial', 'stale_document', 'citation_insufficient', 'possible_contradiction', 'technical_error'][index % 6];
    const eligibleDocuments = issue === 'stale_document'
      ? readyHistoricalDocuments
      : readyCurrentDocuments;
    const sourcePool = eligibleDocuments.filter((document) => document.moduleIds.includes(leaf.id));
    if (!sourcePool.length) {
      failure(`No hay una fuente documental ${issue === 'stale_document' ? 'histórica' : 'vigente'} para ${leaf.name}.`);
    }
    const sourceDocument = sourcePool[index % sourcePool.length];
    const daysAgo = index < 6 ? 0 : index < 18 ? (index % 6) + 1 : index < 33 ? 8 + (index % 20) : 35 + (index % 48);
    return {
      daysAgo,
      documentId: sourceDocument.id,
      documentVersionId: sourceDocument.current_version_id,
      issue,
      key: `consultation-${String(index + 1).padStart(2, '0')}`,
      leaf,
      root: moduleMap.get(rootCode),
      title: `Consulta sobre ${leaf.name.toLowerCase()}: criterio aplicable y plazos del procedimiento`,
    };
  });
}

async function ensureConversation(client, input) {
  const existing = await requireResult(
    client
      .from('chat_conversations')
      .select('id, is_deleted, selected_module_id, title, user_id')
      .eq('id', input.conversationId)
      .maybeSingle(),
    'No se pudo buscar una conversación demostrativa',
  );
  if (
    existing
    && (
      existing.user_id !== input.userId
      || existing.selected_module_id !== input.selectedModuleId
      || existing.title !== input.title
      || existing.is_deleted
    )
  ) {
    failure(`El identificador de conversación ${input.conversationId} no pertenece a la demostración.`);
  }
  if (!existing) {
    await requireResult(
      client.from('chat_conversations').insert({
        id: input.conversationId,
        is_deleted: false,
        selected_module_id: input.selectedModuleId,
        title: input.title,
        user_id: input.userId,
      }),
      'No se pudo crear una conversación demostrativa',
    );
  }
}

async function ensureConsultationTurn(client, input) {
  await ensureConversation(client, input);
  const existingQuestion = await requireResult(
    client
      .from('chat_messages')
      .select('id, created_at')
      .eq('conversation_id', input.conversationId)
      .eq('role', 'user')
      .eq('content', input.question)
      .maybeSingle(),
    'No se pudo buscar una pregunta demostrativa',
  );

  let userMessageId = existingQuestion?.id;
  let answerMessageId = null;
  let turnId = null;
  const isNew = !userMessageId;
  if (userMessageId) {
    const turn = await requireResult(
      client
        .from('consultation_turns')
        .select('id, answer_message_id')
        .eq('user_message_id', userMessageId)
        .maybeSingle(),
      'No se pudo recuperar el turno demostrativo',
    );
    answerMessageId = turn?.answer_message_id ?? null;
    turnId = turn?.id ?? null;
  }
  const needsCompletion = !answerMessageId;

  if (!userMessageId) {
    const started = await callRpc(client, 'begin_chat_turn_with_consultation_routing', {
      p_conversation_id: input.conversationId,
      p_question: input.question,
      p_selected_module_id: input.selectedModuleId,
      p_user_id: input.userId,
    });
    const start = Array.isArray(started) ? started[0] : started;
    userMessageId = start?.user_message_id;
    if (!userMessageId) failure('El inicio de la consulta no devolvió su mensaje.');
    const turn = await requireResult(
      client
        .from('consultation_turns')
        .select('id, answer_message_id')
        .eq('user_message_id', userMessageId)
        .maybeSingle(),
      'No se pudo recuperar el turno recién iniciado',
    );
    turnId = turn?.id ?? null;
    answerMessageId = turn?.answer_message_id ?? null;
  }

  if (!turnId || !userMessageId) failure('No se encontró el turno demostrativo para completar.');

  // Demo documents are deliberately excluded from retrieval in every
  // environment, so seeded consultations must never cite them as evidence.
  const noEvidence = true;
  const retrievalScope = input.issue === 'stale_document' ? 'historical' : 'current';
  const topRelevanceScore = noEvidence ? 0.31 : 0.82;
  if (!answerMessageId) {
    const completed = await callRpc(client, 'complete_chat_turn', {
      p_answer: input.issue === 'technical_error'
        ? 'No se pudo completar la consulta por una incidencia técnica de demostración. Intente nuevamente o contacte al equipo administrador.'
        : noEvidence
          ? 'No se encontró sustento documental suficiente para responder con seguridad. Se recomienda precisar la entidad, el año y el procedimiento consultado.'
          : 'La orientación se basa en la fuente documental recuperada para el procedimiento indicado. [1]',
      p_answer_role: noEvidence ? 'no_evidence' : 'assistant',
      p_conversation_id: input.conversationId,
      p_sources: [],
      p_top_relevance_score: topRelevanceScore,
      p_unanswered_reason: noEvidence ? 'insufficient_evidence' : null,
      p_user_id: input.userId,
      p_user_message_id: userMessageId,
    });
    const result = Array.isArray(completed) ? completed[0] : completed;
    answerMessageId = result?.answer_message_id ?? null;
  }
  if (!answerMessageId) failure('La consulta demostrativa no devolvió una respuesta.');

  const turnUpdate = {
    answer_message_id: answerMessageId,
    answer_role: noEvidence ? 'no_evidence' : 'assistant',
    detected_module_id: input.root.id,
    detected_submodule_id: input.selectedModuleId,
    quality_excerpts: { [input.issue]: 'Señal preparada para la revisión demostrativa.' },
    quality_signals: [input.issue],
    retrieval_scope: retrievalScope,
    top_relevance_score: topRelevanceScore,
  };
  if (needsCompletion) turnUpdate.completed_at = new Date().toISOString();

  await requireResult(
    client
      .from('consultation_turns')
      .update(turnUpdate)
      .eq('id', turnId),
    'No se pudo completar la trazabilidad de la consulta demostrativa',
  );

  return {
    answerMessageId,
    conversationId: input.conversationId,
    isNew,
    turnId,
    userMessageCreatedAt: existingQuestion?.created_at ?? new Date().toISOString(),
    userMessageId,
  };
}

function addMinutesAtMostNow(value, minutes) {
  const candidate = Date.parse(value) + minutes * 60_000;
  return new Date(Math.min(candidate, Date.now() - 60_000)).toISOString();
}

async function backdateConsultation(client, input, turn) {
  const consultedAt = isoHistoricalDaysFromNow(-input.daysAgo, 10 + (input.daysAgo % 7));
  const answerAt = isoHistoricalDaysFromNow(-input.daysAgo, 11 + (input.daysAgo % 7));
  await requireResult(
    client.from('chat_conversations').update({ created_at: consultedAt, updated_at: answerAt }).eq('id', turn.conversationId),
    'No se pudo fechar la conversación demostrativa',
  );
  await requireResult(
    client.from('chat_messages').update({ created_at: consultedAt }).eq('id', turn.userMessageId),
    'No se pudo fechar la pregunta demostrativa',
  );
  if (turn.answerMessageId) {
    await requireResult(
      client.from('chat_messages').update({ created_at: answerAt }).eq('id', turn.answerMessageId),
      'No se pudo fechar la respuesta demostrativa',
    );
  }
  await requireResult(
    client
      .from('consultation_turns')
      .update({ completed_at: turn.answerMessageId ? answerAt : consultedAt, created_at: consultedAt })
      .eq('user_message_id', turn.userMessageId),
    'No se pudo fechar el turno demostrativo',
  );
  await requireResult(
    client.from('unanswered_questions').update({ created_at: consultedAt }).eq('message_id', turn.userMessageId),
    'No se pudo fechar una consulta sin respuesta',
  );
  return {
    answerAt,
    caseCreatedAt: addMinutesAtMostNow(answerAt, 20),
    consultedAt,
  };
}

function caseStatusFor(index, daysAgo) {
  if (daysAgo === 0) return index % 2 === 0 ? 'pending' : 'in_review';
  return ['pending', 'in_review', 'resolved', 'discarded'][index % 4];
}

function caseReviewExcerpt(issue) {
  return {
    citation_insufficient: 'La referencia requiere una revisión humana de su relación con la respuesta.',
    possible_contradiction: 'Se identificó una posible contradicción entre antecedentes normativos.',
    stale_document: 'Posible uso de documentación no vigente: corresponde contrastar la fuente histórica.',
    support_insufficient: 'No se encontró sustento documental suficiente para responder la consulta.',
    support_partial: 'La respuesta requiere reforzar el sustento de sus afirmaciones principales.',
    technical_error: 'La consulta no se completó por un fallo técnico y requiere seguimiento.',
  }[issue] ?? 'Caso preparado para revisión demostrativa.';
}

function buildConsultationCasePlans(turns) {
  const cases = turns.map((turn, index) => {
    const status = caseStatusFor(index, turn.daysAgo);
    const statusAt = status === 'pending'
      ? turn.caseCreatedAt
      : addMinutesAtMostNow(turn.caseCreatedAt, 120);
    return {
      caseCreatedEventId: stableUuid(`${DEMO_CONSULTATION_REVISION}:automatic:${turn.key}:created`),
      caseId: stableUuid(`${DEMO_CONSULTATION_REVISION}:automatic:${turn.key}:${turn.issue}`),
      createdAt: turn.caseCreatedAt,
      kind: 'automatic_alert',
      issue: turn.issue,
      reportReason: null,
      reporterComment: null,
      reviewExcerpt: caseReviewExcerpt(turn.issue),
      status,
      statusAt,
      statusEventId: status === 'pending' ? null : stableUuid(`${DEMO_CONSULTATION_REVISION}:automatic:${turn.key}:status`),
      submissionId: null,
      turn,
    };
  });

  const assistantTurns = turns.filter((turn) => turn.answerMessageId);
  // Keep one report in the current month but outside the current week so the
  // dashboard's Hoy, Esta semana and Este mes values remain visibly distinct.
  const reportSlots = [0, 6, 12, 16, 36];
  const suggestionSlots = [1, 6, 13, 20, 40];
  if (
    reportSlots.some((slot) => !assistantTurns[slot])
    || suggestionSlots.some((slot) => !assistantTurns[slot])
  ) {
    failure('No hay suficientes consultas respondidas para crear los reportes y sugerencias demostrativos.');
  }

  const reportReasons = [
    'information_outdated',
    'citation_does_not_support',
    'answer_unclear',
    'missing_information',
    'answer_not_relevant',
  ];
  for (const [index, slot] of reportSlots.entries()) {
    const turn = assistantTurns[slot];
    const status = caseStatusFor(index + 44, turn.daysAgo);
    const statusAt = status === 'pending' ? turn.caseCreatedAt : addMinutesAtMostNow(turn.caseCreatedAt, 120);
    cases.push({
      caseCreatedEventId: stableUuid(`${DEMO_CONSULTATION_REVISION}:report:${index + 1}:created`),
      caseId: stableUuid(`${DEMO_CONSULTATION_REVISION}:report:${index + 1}`),
      createdAt: turn.caseCreatedAt,
      kind: 'teacher_report',
      issue: 'teacher_report',
      reportReason: reportReasons[index],
      reporterComment: 'Solicito revisar esta respuesta porque necesito confirmar el sustento aplicable a mi caso.',
      reviewExcerpt: null,
      status,
      statusAt,
      statusEventId: status === 'pending' ? null : stableUuid(`${DEMO_CONSULTATION_REVISION}:report:${index + 1}:status`),
      submissionId: stableUuid(`${DEMO_CONSULTATION_REVISION}:teacher-report:${index + 1}`),
      turn,
    });
  }
  for (const [index, slot] of suggestionSlots.entries()) {
    const turn = assistantTurns[slot];
    const status = caseStatusFor(index + 49, turn.daysAgo);
    const statusAt = status === 'pending' ? turn.caseCreatedAt : addMinutesAtMostNow(turn.caseCreatedAt, 120);
    cases.push({
      caseCreatedEventId: stableUuid(`${DEMO_CONSULTATION_REVISION}:suggestion:${index + 1}:created`),
      caseId: stableUuid(`${DEMO_CONSULTATION_REVISION}:suggestion:${index + 1}`),
      createdAt: turn.caseCreatedAt,
      kind: 'teacher_suggestion',
      issue: 'teacher_suggestion',
      reportReason: null,
      reporterComment: `Sugiero incorporar una guía actualizada sobre el procedimiento ${index + 1} para facilitar las consultas docentes.`,
      reviewExcerpt: null,
      status,
      statusAt,
      statusEventId: status === 'pending' ? null : stableUuid(`${DEMO_CONSULTATION_REVISION}:suggestion:${index + 1}:status`),
      submissionId: stableUuid(`${DEMO_CONSULTATION_REVISION}:teacher-suggestion:${index + 1}`),
      turn,
    });
  }
  return cases;
}

function casePlanTuple(casePlan) {
  return `(
    ${sqlUuid(casePlan.caseId)},
    ${sqlText(casePlan.kind)}::public.consultation_case_kind,
    ${sqlText(casePlan.issue)}::public.consultation_case_issue,
    ${sqlText(casePlan.status)}::public.consultation_case_status,
    ${sqlUuid(casePlan.turn.turnId)},
    ${casePlan.submissionId ? sqlUuid(casePlan.submissionId) : 'null::uuid'},
    ${casePlan.reportReason ? `${sqlText(casePlan.reportReason)}::public.consultation_report_reason` : 'null::public.consultation_report_reason'},
    ${sqlText(casePlan.reporterComment)},
    ${sqlText(casePlan.reviewExcerpt)},
    ${sqlText(casePlan.createdAt)}::timestamptz,
    ${sqlText(casePlan.statusAt)}::timestamptz
  )`;
}

async function seedConsultationCaseRows(client, runtime, superadministratorId, casePlans) {
  const planByCaseId = new Map(casePlans.map((casePlan) => [casePlan.caseId, casePlan]));
  const existingCases = await selectRowsInChunks(
    client,
    'consultation_cases',
    'id, conversation_id, user_id',
    'id',
    casePlans.map((casePlan) => casePlan.caseId),
    'No se pudieron validar los casos demostrativos existentes',
  );
  for (const existingCase of existingCases) {
    const plan = planByCaseId.get(existingCase.id);
    if (
      !plan
      || existingCase.conversation_id !== plan.turn.conversationId
      || existingCase.user_id !== plan.turn.userId
    ) {
      failure(`El identificador de caso ${existingCase.id} no pertenece a la demostración.`);
    }
  }

  const expectedEventCaseIds = new Map(
    casePlans.flatMap((casePlan) => [
      [casePlan.caseCreatedEventId, casePlan.caseId],
      ...(casePlan.statusEventId ? [[casePlan.statusEventId, casePlan.caseId]] : []),
    ]),
  );
  const existingEvents = await selectRowsInChunks(
    client,
    'consultation_case_events',
    'id, consultation_case_id',
    'id',
    [...expectedEventCaseIds.keys()],
    'No se pudieron validar los eventos demostrativos existentes',
  );
  for (const existingEvent of existingEvents) {
    if (expectedEventCaseIds.get(existingEvent.id) !== existingEvent.consultation_case_id) {
      failure(`El identificador de evento ${existingEvent.id} no pertenece a la demostración.`);
    }
  }

  const tuples = casePlans.map(casePlanTuple).join(',\n');
  const createdEvents = casePlans.map((casePlan) => `(
    ${sqlUuid(casePlan.caseCreatedEventId)},
    ${sqlUuid(casePlan.caseId)},
    ${casePlan.kind === 'automatic_alert' ? 'null::uuid' : sqlUuid(casePlan.turn.userId)},
    'case_created',
    null::text,
    ${sqlText(JSON.stringify({ issueType: casePlan.issue, kind: casePlan.kind, origin: 'demo_seed' }))}::jsonb,
    ${sqlText(casePlan.createdAt)}::timestamptz
  )`).join(',\n');
  const statusEvents = casePlans
    .filter((casePlan) => casePlan.statusEventId)
    .map((casePlan) => `(
      ${sqlUuid(casePlan.statusEventId)},
      ${sqlUuid(casePlan.caseId)},
      ${sqlUuid(superadministratorId)},
      'status_changed',
      ${sqlText(casePlan.status === 'resolved'
        ? 'Caso resuelto durante la revisión demostrativa.'
        : casePlan.status === 'discarded'
          ? 'Caso descartado por tratarse de una prueba demostrativa.'
          : 'Caso asignado para seguimiento demostrativo.')},
      ${sqlText(JSON.stringify({ origin: 'demo_seed', previousStatus: 'pending', status: casePlan.status }))}::jsonb,
      ${sqlText(casePlan.statusAt)}::timestamptz
    )`).join(',\n');

  executeSql(runtime, `
begin;
with plans (
  id, kind, issue_type, status, turn_id, client_submission_id, report_reason,
  reporter_comment, review_excerpt, created_at, updated_at
) as (
  values ${tuples}
)
insert into public.consultation_cases (
  id, kind, issue_type, status, consultation_turn_id, conversation_id, user_id,
  user_message_id, answer_message_id, requested_module_id, detected_module_id,
  detected_submodule_id, requested_module_name, detected_module_name,
  detected_submodule_name, retrieval_scope, top_relevance_score,
  question_snapshot, answer_snapshot, review_excerpt, report_reason,
  reporter_comment, client_submission_id, snapshot_complete, created_at, updated_at
)
select
  plans.id,
  plans.kind,
  plans.issue_type,
  plans.status,
  case when plans.kind = 'teacher_suggestion'::public.consultation_case_kind then null else turn.id end,
  turn.conversation_id,
  turn.user_id,
  case when plans.kind = 'teacher_suggestion'::public.consultation_case_kind then null else turn.user_message_id end,
  case when plans.kind = 'teacher_suggestion'::public.consultation_case_kind then null else turn.answer_message_id end,
  turn.requested_module_id,
  turn.detected_module_id,
  turn.detected_submodule_id,
  coalesce(requested_parent.name, requested_module.name),
  coalesce(detected_parent.name, detected_module.name),
  case when detected_parent.id is null then null else detected_module.name end,
  turn.retrieval_scope,
  turn.top_relevance_score,
  case when plans.kind = 'teacher_suggestion'::public.consultation_case_kind then null else question.content end,
  case when plans.kind = 'teacher_suggestion'::public.consultation_case_kind then null else answer.content end,
  plans.review_excerpt,
  plans.report_reason,
  plans.reporter_comment,
  plans.client_submission_id,
  true,
  plans.created_at,
  plans.updated_at
from plans
join public.consultation_turns as turn on turn.id = plans.turn_id
left join public.chat_messages as question on question.id = turn.user_message_id
left join public.chat_messages as answer on answer.id = turn.answer_message_id
left join public.modules as requested_module on requested_module.id = turn.requested_module_id
left join public.modules as requested_parent on requested_parent.id = requested_module.parent_module_id
left join public.modules as detected_module on detected_module.id = turn.detected_submodule_id
left join public.modules as detected_parent on detected_parent.id = detected_module.parent_module_id
on conflict do nothing;

insert into public.consultation_case_sources (
  consultation_case_id, chat_source_id, document_id, document_version_id,
  root_module_id, submodule_id, document_title, document_situation,
  version_number, page_start, page_end, section_title, article_reference,
  numeral_reference, evidence_excerpt, relevance_score, source_rank, created_at
)
select
  consultation_case.id,
  source.id,
  source.document_id,
  source.document_version_id,
  turn.detected_module_id,
  turn.detected_submodule_id,
  source.document_title,
  source.document_situation,
  source.version_number,
  source.page_start,
  source.page_end,
  source.section_title,
  source.article_reference,
  source.numeral_reference,
  nullif(left(chunk.chunk_content, 2000), ''),
  source.relevance_score,
  source.source_rank,
  consultation_case.created_at
from public.consultation_cases as consultation_case
join public.consultation_turns as turn on turn.id = consultation_case.consultation_turn_id
join public.chat_message_sources as source on source.message_id = consultation_case.answer_message_id
left join public.document_chunks as chunk on chunk.id = source.chunk_id
where consultation_case.id in (${casePlans.map((casePlan) => sqlUuid(casePlan.caseId)).join(', ')})
on conflict (consultation_case_id, chat_source_id) do nothing;

insert into public.consultation_case_events (
  id, consultation_case_id, actor_id, event_type, note, metadata, created_at
)
values ${createdEvents}
on conflict (id) do nothing;
${statusEvents ? `
insert into public.consultation_case_events (
  id, consultation_case_id, actor_id, event_type, note, metadata, created_at
)
values ${statusEvents}
on conflict (id) do nothing;
` : ''}
commit;
`, 'No se pudieron crear los casos demostrativos con trazabilidad histórica');
}

async function seedCaseAttachments(client, runtime, casePlans) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9J4wAAAABJRU5ErkJggg==', 'base64');
  const attachmentPlans = [];
  for (const [index, casePlan] of casePlans.filter((item) => item.kind !== 'automatic_alert').entries()) {
    const report = casePlan.kind === 'teacher_report';
    const content = report ? png : await createPdf(`Sugerencia docente ${index + 1}`, 1, runtime.pdfEnvironment);
    const mimeType = report ? 'image/png' : 'application/pdf';
    const kind = report ? 'report_image' : 'suggestion_file';
    const sha256 = createHash('sha256').update(content).digest('hex');
    const storagePath = `${casePlan.caseId}/attachment.${report ? 'png' : 'pdf'}`;
    const attachmentId = stableUuid(`${DEMO_CONSULTATION_REVISION}:attachment:${casePlan.caseId}`);
    const existingAttachment = await requireResult(
      client
        .from('consultation_case_attachments')
        .select('id, consultation_case_id, storage_path')
        .eq('id', attachmentId)
        .maybeSingle(),
      'No se pudo validar un adjunto demostrativo existente',
    );
    if (
      existingAttachment
      && (
        existingAttachment.consultation_case_id !== casePlan.caseId
        || existingAttachment.storage_path !== storagePath
      )
    ) {
      failure(`El identificador de adjunto ${attachmentId} no pertenece a la demostración.`);
    }
    if (!existingAttachment) {
      await requireResult(
        client.storage.from('consultation-case-attachments').upload(
          storagePath,
          new Blob([content], { type: mimeType }),
          { contentType: mimeType, upsert: runtime.mode !== 'production' },
        ),
        'No se pudo cargar un adjunto demostrativo',
      );
    }
    attachmentPlans.push({
      attachmentAt: addMinutesAtMostNow(casePlan.createdAt, 35),
      attachmentEventId: stableUuid(`${DEMO_CONSULTATION_REVISION}:attachment:${casePlan.caseId}:event`),
      attachmentId,
      casePlan,
      content,
      kind,
      mimeType,
      originalFileName: report ? `captura-reporte-${index + 1}.png` : `sugerencia-normativa-${index + 1}.pdf`,
      sha256,
      storagePath,
    });
  }
  if (!attachmentPlans.length) return;

  const expectedAttachmentEventCaseIds = new Map(
    attachmentPlans.map((attachment) => [attachment.attachmentEventId, attachment.casePlan.caseId]),
  );
  const existingAttachmentEvents = await selectRowsInChunks(
    client,
    'consultation_case_events',
    'id, consultation_case_id',
    'id',
    [...expectedAttachmentEventCaseIds.keys()],
    'No se pudieron validar los eventos de adjuntos demostrativos',
  );
  for (const existingEvent of existingAttachmentEvents) {
    if (expectedAttachmentEventCaseIds.get(existingEvent.id) !== existingEvent.consultation_case_id) {
      failure(`El identificador de evento ${existingEvent.id} no pertenece a la demostración.`);
    }
  }

  const attachments = attachmentPlans.map((attachment) => `(
    ${sqlUuid(attachment.attachmentId)},
    ${sqlUuid(attachment.casePlan.caseId)},
    ${sqlUuid(attachment.casePlan.turn.userId)},
    ${sqlText(attachment.kind)}::public.consultation_attachment_kind,
    'consultation-case-attachments',
    ${sqlText(attachment.storagePath)},
    ${sqlText(attachment.originalFileName)},
    ${sqlText(attachment.mimeType)},
    ${sqlBigint(attachment.content.byteLength)},
    ${sqlText(attachment.sha256)},
    ${sqlText(attachment.attachmentAt)}::timestamptz
  )`).join(',\n');
  const events = attachmentPlans.map((attachment) => `(
    ${sqlUuid(attachment.attachmentEventId)},
    ${sqlUuid(attachment.casePlan.caseId)},
    ${sqlUuid(attachment.casePlan.turn.userId)},
    'note_added',
    null::text,
    ${sqlText(JSON.stringify({
      attachmentId: attachment.attachmentId,
      attachmentKind: attachment.kind,
      mimeType: attachment.mimeType,
      origin: 'demo_seed',
    }))}::jsonb,
    ${sqlText(attachment.attachmentAt)}::timestamptz
  )`).join(',\n');
  executeSql(runtime, `
begin;
insert into public.consultation_case_attachments (
  id, consultation_case_id, uploaded_by, attachment_kind, storage_bucket,
  storage_path, original_file_name, mime_type, file_size_bytes, sha256, created_at
)
values ${attachments}
on conflict do nothing;

insert into public.consultation_case_events (
  id, consultation_case_id, actor_id, event_type, note, metadata, created_at
)
values ${events}
on conflict (id) do nothing;
commit;
`, 'No se pudieron registrar los adjuntos demostrativos');
}

function demoConversationId(plan) {
  return stableUuid(`${DEMO_CONSULTATION_REVISION}:${plan.key}:${plan.leaf.code}:conversation`);
}

async function seedConsultations(client, runtime, moduleMap, documents, superadministratorId, idsByKey) {
  const activeTeacherIds = demoUsers()
    .filter((user) => user.role === 'docente' && user.state === 'active')
    .map((user) => idsByKey.get(user.key))
    .filter(Boolean);
  const turns = [];
  for (const [index, plan] of consultationPlans(moduleMap, documents).entries()) {
    const userId = activeTeacherIds[index % activeTeacherIds.length];
    const conversationId = demoConversationId(plan);
    const turn = await ensureConsultationTurn(client, {
      ...plan,
      conversationId,
      question: plan.title,
      selectedModuleId: plan.leaf.id,
      title: plan.title,
      userId,
    });
    const chronology = turn.isNew
      ? await backdateConsultation(client, plan, turn)
      : {
        answerAt: addMinutesAtMostNow(turn.userMessageCreatedAt, 60),
        caseCreatedAt: addMinutesAtMostNow(turn.userMessageCreatedAt, 80),
        consultedAt: turn.userMessageCreatedAt,
      };
    turns.push({ ...plan, ...turn, ...chronology, userId });
  }
  const casePlans = buildConsultationCasePlans(turns);
  await seedConsultationCaseRows(client, runtime, superadministratorId, casePlans);
  await seedCaseAttachments(client, runtime, casePlans);
  return {
    activeTeacherIds,
    casePlans,
    demoConversationIds: turns.map((turn) => turn.conversationId),
    turns,
  };
}

async function selectRowsInChunks(client, table, fields, column, ids, label) {
  if (!ids.length) return [];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 25) {
    rows.push(...await requireResult(
      client.from(table).select(fields).in(column, ids.slice(offset, offset + 25)),
      label,
    ));
  }
  return rows;
}

function verifyDemoRagRetrieval(runtime) {
  const safeMarker = DEMO_MARKER.replaceAll("'", "''");
  executeSql(runtime, `
do $$
declare
  target record;
  retrieval_scope text;
  found_contextual boolean;
  found_legacy boolean;
  target_count integer := 0;
begin
  if to_regprocedure(
    'public.search_document_chunks_with_consultation_context(extensions.vector,text,uuid,real,integer,text)'
  ) is null then
    raise exception 'DEMO_RAG_CONTEXT_SEARCH_IS_UNAVAILABLE';
  end if;

  for target in
    select distinct on (document.situation)
      document.id as document_id,
      document.situation,
      chunk.embedding,
      (
        select document_module.module_id
        from public.document_modules as document_module
        where document_module.document_id = document.id
        order by document_module.module_id
        limit 1
      ) as selected_module_id
    from public.documents as document
    join public.document_versions as version
      on version.id = document.approved_version_id
      and version.ingestion_status = 'indexed'
    join public.document_chunks as chunk
      on chunk.document_id = document.id
      and chunk.document_version_id = version.id
    where document.metadata ->> 'demoSeed' = '${safeMarker}'
      and document.situation in ('current', 'replaced', 'archived')
    order by document.situation, document.id
  loop
    target_count := target_count + 1;
    if (target.embedding operator(extensions.<=>) target.embedding) is distinct from 0::real then
      raise exception 'DEMO_RAG_EMBEDDING_IS_NOT_USABLE for %', target.document_id;
    end if;

    foreach retrieval_scope in array array['current', 'historical', 'archived_explicit'] loop
      select exists (
        select 1
        from public.search_document_chunks_with_consultation_context(
          target.embedding,
          'consulta demostrativa de verificación',
          target.selected_module_id,
          0.999::real,
          10,
          retrieval_scope
        ) as result
        where result.document_id = target.document_id
      ) into found_contextual;
      if found_contextual then
        raise exception 'DEMO_RAG_CONTEXTUAL_LEAK for %, scope %', target.document_id, retrieval_scope;
      end if;
    end loop;

    select exists (
      select 1
      from public.search_document_chunks(
        target.embedding,
        'consulta demostrativa de verificación',
        target.selected_module_id,
        0.999::real,
        10
      ) as result
      where result.document_id = target.document_id
    ) into found_legacy;
    if found_legacy then
      raise exception 'DEMO_RAG_LEGACY_LEAK for %', target.document_id;
    end if;
  end loop;
  if target_count <> 3 then
    raise exception 'DEMO_RAG_DOCUMENT_SITUATIONS_ARE_INCOMPLETE';
  end if;
end;
$$;
`, 'No se pudo verificar el aislamiento RAG de la demostración');
}

async function verifyDemo(client, runtime, state) {
  const profiles = await requireResult(
    client.from('profiles').select('id, role, account_status, access_expires_at').in('id', [...state.idsByKey.values()]),
    'No se pudieron verificar perfiles demostrativos',
  );
  const now = Date.now();
  const teachersOnly = profiles.filter((profile) => profile.role === 'docente');
  const administrators = profiles.filter((profile) => profile.role === 'admin');
  const superadministrators = profiles.filter((profile) => profile.role === 'superadmin');
  const active = teachersOnly.filter((profile) => profile.account_status === 'active' && (!profile.access_expires_at || Date.parse(profile.access_expires_at) >= now));
  const expiring = teachersOnly.filter((profile) => {
    const expiry = profile.access_expires_at ? Date.parse(profile.access_expires_at) : Number.NaN;
    return profile.account_status === 'active' && Number.isFinite(expiry) && expiry >= now && expiry <= now + EXPIRING_SOON_DAYS * 86_400_000;
  });
  const expired = teachersOnly.filter((profile) => profile.access_expires_at && Date.parse(profile.access_expires_at) < now);
  const suspended = teachersOnly.filter((profile) => profile.account_status === 'suspended');
  if (
    teachersOnly.length !== 56
    || superadministrators.length !== 1
    || administrators.length < 5
    || !active.length
    || !expiring.length
    || !expired.length
    || !suspended.length
  ) {
    failure('La distribución de docentes no cubre todos los estados requeridos.');
  }

  const requiredEvaluationSubmodules = [
    'NOMBRAMIENTO_DOCENTE_INGRESO_CPM',
    'CONTRATACION_DOCENTE',
    'ASCENSO_ESCALA_MAGISTERIAL',
    'ACCESO_CARGOS_DIRECTIVOS',
    'ACCESO_ESPECIALISTA_EDUCACION',
    'EVALUACION_DESEMPENO_DOCENTE',
    'EVALUACION_DESEMPENO_DIRECTIVOS',
    'PROCESOS_ESPECIFICOS',
  ];
  requireCanonicalRoots(state.moduleMap);
  if ([...rootModules, ...requiredEvaluationSubmodules].some((code) => !state.moduleMap.has(code))) {
    failure('La jerarquía canónica de módulos de demostración está incompleta.');
  }

  const documents = await requireResult(
    client
      .from('documents')
      .select('id, current_version_id, situation, approval_status, metadata, document_type, issuing_entity, replacement_document_id, replacement_date, replacement_reason, archive_reason_code, created_by, updated_by')
      .contains('metadata', { demoSeed: DEMO_MARKER }),
    'No se pudieron verificar documentos demostrativos',
  );
  const versions = await requireResult(
    client.from('document_versions').select('id, document_id, ingestion_status').in('document_id', documents.map((document) => document.id)),
    'No se pudieron verificar versiones demostrativas',
  );
  const documentLinks = await requireResult(
    client.from('document_modules').select('document_id, module_id').in('document_id', documents.map((document) => document.id)),
    'No se pudieron verificar asociaciones demostrativas',
  );
  const chunks = await requireResult(
    client.from('document_chunks').select('id, document_id, document_version_id').in('document_id', documents.map((document) => document.id)),
    'No se pudieron verificar fragmentos demostrativos',
  );
  const documentsBySituation = new Map();
  for (const document of documents) {
    documentsBySituation.set(document.situation, (documentsBySituation.get(document.situation) ?? 0) + 1);
  }
  const currentVersionByDocument = new Map(versions.map((version) => [version.id, version]));
  const readyDocuments = documents.filter((document) => {
    const version = currentVersionByDocument.get(document.current_version_id);
    return document.approval_status === 'ready' && version?.ingestion_status === 'indexed';
  });
  const pendingDocuments = documents.filter((document) => {
    const version = currentVersionByDocument.get(document.current_version_id);
    return document.approval_status === 'pending_approval' && version?.ingestion_status === 'pending';
  });
  const errorDocuments = documents.filter((document) => {
    const version = currentVersionByDocument.get(document.current_version_id);
    return version?.ingestion_status === 'failed';
  });
  const indexedReadyDocumentVersions = new Set(
    chunks.map((chunk) => `${chunk.document_id}:${chunk.document_version_id}`),
  );
  const linksByDocument = new Map();
  for (const link of documentLinks) {
    linksByDocument.set(link.document_id, (linksByDocument.get(link.document_id) ?? 0) + 1);
  }
  const administrativeIds = new Set([...administrators, ...superadministrators].map((profile) => profile.id));
  const expectedEntities = new Set(entityDetails.map(([entity]) => entity));
  const expectedTypes = new Set(documentTypes);
  const actualEntities = new Set(documents.map((document) => document.issuing_entity));
  const actualTypes = new Set(documents.map((document) => document.document_type));
  if (
    documents.length !== 96
    || documentsBySituation.get('current') !== 70
    || documentsBySituation.get('replaced') !== 16
    || documentsBySituation.get('archived') !== 10
    || versions.length < 115
    || readyDocuments.length !== 75
    || pendingDocuments.length !== 15
    || errorDocuments.length !== 6
    || !readyDocuments.some((document) => document.situation === 'replaced')
    || !readyDocuments.some((document) => document.situation === 'archived')
    || documentLinks.length <= documents.length
    || [...linksByDocument.values()].filter((count) => count > 1).length < 10
    || !chunks.length
    || readyDocuments.some((document) => !indexedReadyDocumentVersions.has(`${document.id}:${document.current_version_id}`))
    || actualTypes.size !== expectedTypes.size
    || actualEntities.size !== expectedEntities.size
    || [...expectedTypes].some((type) => !actualTypes.has(type))
    || [...expectedEntities].some((entity) => !actualEntities.has(entity))
    || documents.some((document) => !administrativeIds.has(document.created_by) || !administrativeIds.has(document.updated_by))
    || documents.some((document) => document.situation === 'replaced' && (!document.replacement_document_id || !document.replacement_date || !document.replacement_reason))
    || documents.some((document) => document.situation === 'archived' && !document.archive_reason_code)
  ) {
    failure('El catálogo documental de demostración está incompleto.');
  }
  verifyDemoRagRetrieval(runtime);

  if (!state.demoConversationIds?.length) {
    failure('No se identificaron las conversaciones demostrativas para la verificación.');
  }
  const cases = await requireResult(
    client
      .from('consultation_cases')
      .select('id, kind, issue_type, status, created_at, conversation_id')
      .in('conversation_id', state.demoConversationIds),
    'No se pudieron verificar los casos demostrativos',
  );
  const attachments = await selectRowsInChunks(
    client,
    'consultation_case_attachments',
    'id, consultation_case_id, attachment_kind, created_at',
    'consultation_case_id',
    cases.map((consultationCase) => consultationCase.id),
    'No se pudieron verificar adjuntos demostrativos',
  );
  const events = await selectRowsInChunks(
    client,
    'consultation_case_events',
    'id, consultation_case_id, event_type, created_at',
    'consultation_case_id',
    cases.map((consultationCase) => consultationCase.id),
    'No se pudieron verificar los eventos demostrativos',
  );
  const requiredIssues = new Set(['support_insufficient', 'support_partial', 'stale_document', 'citation_insufficient', 'possible_contradiction', 'technical_error']);
  const foundIssues = new Set(cases.map((consultationCase) => consultationCase.issue_type));
  const foundStates = new Set(cases.map((consultationCase) => consultationCase.status));
  const reportCount = cases.filter((consultationCase) => consultationCase.kind === 'teacher_report').length;
  const suggestionCount = cases.filter((consultationCase) => consultationCase.kind === 'teacher_suggestion').length;
  const automaticCount = cases.filter((consultationCase) => consultationCase.kind === 'automatic_alert').length;
  const attachmentKinds = new Set(attachments.map((attachment) => attachment.attachment_kind));
  const caseCreatedAtById = new Map(cases.map((consultationCase) => [consultationCase.id, Date.parse(consultationCase.created_at)]));
  if (
    cases.length !== 54
    || automaticCount !== 44
    || attachments.length !== 10
    || reportCount !== 5
    || suggestionCount !== 5
    || !attachmentKinds.has('report_image')
    || !attachmentKinds.has('suggestion_file')
    || [...requiredIssues].some((issue) => !foundIssues.has(issue))
    || foundStates.size !== 4
    || events.filter((event) => event.event_type === 'case_created').length !== cases.length
    || attachments.some((attachment) => Date.parse(attachment.created_at) < caseCreatedAtById.get(attachment.consultation_case_id))
    || events.some((event) => Date.parse(event.created_at) < caseCreatedAtById.get(event.consultation_case_id))
  ) {
    failure('Los casos, incidencias, adjuntos o estados de demostración están incompletos.');
  }

  const home = await callRpc(client, 'get_admin_home_dashboard_metrics', {
    p_administrator_id: state.superadministratorId,
    p_expiring_soon_days: EXPIRING_SOON_DAYS,
  });
  const dashboard = Array.isArray(home) ? home[0] : home;
  if (!dashboard || Number(dashboard.total_users) < profiles.length || Number(dashboard.total_documents) < documents.length) {
    failure('Las métricas de Inicio no reflejan los datos demostrativos.');
  }

  const periodMetrics = [];
  const periodRows = [];
  for (const period of ['today', 'week', 'month']) {
    const result = await callRpc(client, 'get_consultation_reports_dashboard', {
      p_actor_id: state.superadministratorId,
      p_period: period,
    });
    const row = Array.isArray(result) ? result[0] : result;
    periodRows.push(row);
    periodMetrics.push({
      incidents: Number(row?.answers_with_incidents ?? 0),
      reports: Number(row?.teacher_reports ?? 0),
      suggestions: Number(row?.teacher_suggestions ?? 0),
      suggestedDocuments: Number(row?.documents_suggested ?? 0),
      periodStart: String(row?.period_start ?? ''),
      total: Number(row?.total_questions ?? 0),
    });
  }
  const [todayMetric, weekMetric, monthMetric] = periodMetrics;
  const weekBeginsToday = todayMetric.periodStart === weekMetric.periodStart;
  if (
    todayMetric.total > weekMetric.total
    || (!weekBeginsToday && todayMetric.total >= weekMetric.total)
    || weekMetric.total >= monthMetric.total
  ) {
    failure('Las métricas de Hoy, Semana y Mes no se distribuyeron correctamente.');
  }
  for (const metric of ['incidents', 'reports', 'suggestions', 'suggestedDocuments']) {
    const today = todayMetric[metric];
    const week = weekMetric[metric];
    const month = monthMetric[metric];
    if (
      today > week
      || (!weekBeginsToday && today >= week)
      || week >= month
    ) {
      failure(`La métrica demostrativa ${metric} no diferencia Hoy, Semana y Mes.`);
    }
  }
  const monthlyRanking = Array.isArray(periodRows[2]?.consultation_modules)
    ? periodRows[2].consultation_modules
    : [];
  if (monthlyRanking.length < 2 || monthlyRanking[0]?.count === monthlyRanking[1]?.count) {
    failure('El ranking demostrativo de consultas no muestra diferencias entre módulos.');
  }

  const activeTeacher = demoUsers().find((user) => user.role === 'docente' && user.state === 'active');
  const expiredTeacher = demoUsers().find((user) => user.role === 'docente' && user.state === 'expired');
  const suspendedTeacher = demoUsers().find((user) => user.role === 'docente' && user.state === 'suspended');
  if (!activeTeacher || !expiredTeacher || !suspendedTeacher) failure('No se encontraron perfiles para verificar vigencia.');
  const activeTeacherId = state.idsByKey.get(activeTeacher.key);
  const expiredTeacherId = state.idsByKey.get(expiredTeacher.key);
  const suspendedTeacherId = state.idsByKey.get(suspendedTeacher.key);
  executeSql(runtime, `
begin;
select * from public.begin_chat_turn_with_consultation_routing(
  '${activeTeacherId}', null, null, 'Verificación transaccional de acceso activo'
);
do $$
begin
  begin
    perform public.begin_chat_turn_with_consultation_routing(
      '${expiredTeacherId}', null, null, 'Verificación transaccional de acceso vencido'
    );
    raise exception 'EXPIRED_DEMO_USER_WAS_ALLOWED';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.begin_chat_turn_with_consultation_routing(
      '${suspendedTeacherId}', null, null, 'Verificación transaccional de acceso suspendido'
    );
    raise exception 'SUSPENDED_DEMO_USER_WAS_ALLOWED';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback;
`, 'No se pudo verificar el enforcement de vigencia de demostración');

  if (state.verifyActiveLogin) {
    const publicClient = createClient(runtime.apiUrl, runtime.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const login = await publicClient.auth.signInWithPassword({
      email: activeTeacher.email,
      password: runtime.demoPassword,
    });
    if (login.error || !login.data.session) failure('La docente activa de demostración no puede iniciar sesión.');
  }

  return {
    activeTeachers: active.length,
    attachments: attachments.length,
    cases: cases.length,
    documents: documents.length,
    expiringTeachers: expiring.length,
    expiredTeachers: expired.length,
    profiles: profiles.length,
    periodTotals: periodMetrics.map((metric) => metric.total),
    suspendedTeachers: suspended.length,
    versions: versions.length,
  };
}

export async function runDemoSeed(runtime, { verifyOnly = false, verifyActiveLogin = true } = {}) {
  const client = createClient(runtime.apiUrl, runtime.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (verifyOnly) {
    const users = demoUsers();
    const existing = await listAllAuthUsers(client);
    const idsByKey = new Map(
      users.map((user) => [user.key, existing.find((candidate) => candidate.email === user.email)?.id]).filter(([, id]) => id),
    );
    const superadministratorId = idsByKey.get('superadmin');
    if (!superadministratorId) failure('La superadministradora demostrativa no existe. Ejecute primero demo:seed.');
    const moduleMap = await loadModuleMap(client, runtime);
    const documents = await loadDemoDocumentsWithModules(client);
    const demoConversationIds = consultationPlans(moduleMap, documents).map(demoConversationId);
    const activeTeacherIds = users
      .filter((user) => user.role === 'docente' && user.state === 'active')
      .map((user) => idsByKey.get(user.key))
      .filter(Boolean);
    return verifyDemo(client, runtime, {
      activeTeacherIds,
      demoConversationIds,
      documents,
      idsByKey,
      moduleMap,
      superadministratorId,
      verifyActiveLogin: false,
    });
  }

  const users = await seedUsers(client, runtime);
  const moduleMap = await ensureModules(client, runtime, users.superadministratorId);
  const documents = await seedDocuments(client, runtime, moduleMap, users.superadministratorId, users.idsByKey);
  const consultations = await seedConsultations(
    client,
    runtime,
    moduleMap,
    documents.documents,
    users.superadministratorId,
    users.idsByKey,
  );
  return verifyDemo(client, runtime, {
    ...users,
    ...consultations,
    documents: documents.documents,
    moduleMap,
    verifyActiveLogin,
  });
}

async function main() {
  const runtime = getLocalRuntime();
  const verifyOnly = process.argv.includes('--verify');
  const summary = await runDemoSeed(runtime, {
    verifyActiveLogin: !verifyOnly,
    verifyOnly,
  });
  console.log(`${verifyOnly ? 'Verificación' : 'Seed'} demo local correcto: ${JSON.stringify(summary)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { DEMO_MARKER, demoUsers };
