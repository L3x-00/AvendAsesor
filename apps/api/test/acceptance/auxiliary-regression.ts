/**
 * Regresión semántica y de correspondencia normativa de las siete consultas
 * del módulo Auxiliar de educación (AUX-01…AUX-07).
 *
 * Uso (desde apps/api):
 *   ACCEPTANCE_ENV_FILE=.env.staging.local npm run acceptance:auxiliares
 *
 * Comprueba, contra el corpus real y el pipeline real, que cada respuesta:
 *  - se sustente en el documento que regula el concepto consultado;
 *  - no confunda contratación 2026 con nombramiento ni nombrados con contratados;
 *  - no invente cifras, plazos ni requisitos ausentes de la fuente;
 *  - cite las fuentes que respaldan los datos que afirma.
 *
 * No escribe en el corpus ni en el historial. Consume saldo del proveedor
 * (siete consultas).
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuthorizationContext } from '../../src/authorization';
import type {
  ChatHistoryGateway,
  ChatReplyRole,
} from '../../src/chat/chat-history.gateway';
import { ChatCatalogService } from '../../src/chat/catalog/chat-catalog.service';
import { ChatService, type ChatStreamEvent } from '../../src/chat/chat.service';
import { validateEnvironment } from '../../src/config/environment.validation';
import { OpenAiEmbeddingsGateway } from '../../src/ingestion/openai-embeddings.gateway';
import { OpenAiAnswerGateway } from '../../src/rag/openai-answer.gateway';
import { RagService } from '../../src/rag/rag.service';
import { normalizeSpanishText } from '../../src/rag/text-normalization';
import { SupabaseChatCatalogGatewayAdapter } from '../../src/supabase/supabase-chat-catalog.gateway';
import { SupabaseChatGatewayAdapter } from '../../src/supabase/supabase-chat.gateway';
import { SupabaseRetrievalGatewayAdapter } from '../../src/supabase/supabase-retrieval.gateway';
import { createSupabaseServerClient } from '../../src/supabase/supabase.server-client';

interface SourceView {
  documentId: string;
  documentVersionId: string;
  page: number;
  pageEnd: number;
  title: string;
}

interface TurnResult {
  answer: string;
  clarificationModules: string[];
  events: string[];
  moduleId: string | null | undefined;
  question: string;
  sources: SourceView[];
}

interface CaseResult {
  checks: Array<{ label: string; pass: boolean }>;
  id: string;
  notes: string;
  pass: boolean;
  title: string;
  turn: TurnResult;
  verdict: 'PASA' | 'FALLA';
}

function readEnvironmentFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line);
    if (match?.[1]) env[match[1]] = (match[2] ?? '').trim();
  }
  return env;
}

async function main(): Promise<void> {
  const envFile = process.env.ACCEPTANCE_ENV_FILE;
  if (!envFile) {
    throw new Error('Define ACCEPTANCE_ENV_FILE con el archivo de entorno.');
  }
  const env = readEnvironmentFile(envFile);
  const values = validateEnvironment({
    ...env,
    RAG_INGESTION_WORKER_ENABLED: 'false',
  }) as Record<string, unknown>;
  const config = { get: (key: string) => values[key] } as never;
  const client = createSupabaseServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!client) {
    throw new Error('La campaña requiere una conexión de corpus configurada.');
  }

  const modulesGateway = new SupabaseChatGatewayAdapter(client);
  const activeModules = await modulesGateway.listActiveModules();
  const auxiliaresModuleId = activeModules.find(
    (module) => module.name === 'Auxiliar de educación' && !module.parentModuleId,
  )?.id;
  if (!auxiliaresModuleId) {
    throw new Error(
      'Precondición incumplida: falta el módulo activo «Auxiliar de educación».',
    );
  }

  const conversations = new Map<string, Array<{ content: string; role: string }>>();
  const history = {
    beginTurn: (input: { conversationId: string | null }) => {
      const id = input.conversationId ?? randomUUID();
      if (!conversations.has(id)) conversations.set(id, []);
      return Promise.resolve({ conversationId: id, userMessageId: randomUUID() });
    },
    completeTurn: (input: {
      answer: string;
      conversationId: string;
      userMessageId: string;
    }) => {
      conversations.get(input.conversationId)?.push({
        content: input.answer,
        role: 'assistant',
      });
      return Promise.resolve({ answerMessageId: randomUUID() });
    },
    getConversationContext: (input: { conversationId: string }) =>
      Promise.resolve({
        conversationId: input.conversationId,
        messages: conversations.get(input.conversationId) ?? [],
        selectedModuleId: null,
      }),
    listActiveModules: () => modulesGateway.listActiveModules(),
    recordTechnicalFailure: () => Promise.resolve(),
  } as unknown as ChatHistoryGateway;

  const chat = new ChatService(
    new OpenAiAnswerGateway(config),
    history,
    new RagService(
      new OpenAiEmbeddingsGateway(config),
      new SupabaseRetrievalGatewayAdapter(client),
      config,
    ),
    config,
    { prepare: () => null } as never,
    new ChatCatalogService(new SupabaseChatCatalogGatewayAdapter(client), {
      suggest: () => Promise.resolve([]),
    }),
  );

  const teacher: AuthorizationContext = {
    email: 'qa-auxiliar@example.com',
    emailConfirmedAt: null,
    role: 'docente',
    userId: randomUUID(),
  };

  async function ask(question: string): Promise<TurnResult> {
    const events: ChatStreamEvent[] = [];
    for await (const event of chat.stream({
      authorization: teacher,
      conversationId: null,
      question,
      selectedModuleId: auxiliaresModuleId as string,
    })) {
      events.push(event);
    }
    let answer = '';
    let moduleId: string | null | undefined;
    let clarificationModules: string[] = [];
    let sources: SourceView[] = [];
    for (const event of events) {
      if (event.type === 'token') answer += event.data.text;
      if (event.type === 'answer') answer = event.data.text;
      if (
        event.type === 'conversational' ||
        event.type === 'no_evidence' ||
        event.type === 'clarification'
      ) {
        answer += event.data.message;
      }
      if (event.type === 'clarification') {
        clarificationModules = event.data.modules.map((item) => item.name);
      }
      if (event.type === 'conversation') moduleId = event.data.moduleId;
      if (event.type === 'sources') {
        sources = event.data.sources.map((source) => ({
          documentId: source.documentId,
          documentVersionId: source.documentVersionId,
          page: source.pageStart,
          pageEnd: source.pageEnd,
          title: source.documentTitle,
        }));
      }
    }
    return {
      answer,
      clarificationModules,
      events: [...new Set(events.map((event) => event.type))],
      moduleId,
      question,
      sources,
    };
  }

  const results: CaseResult[] = [];
  const record = (
    id: string,
    title: string,
    turn: TurnResult,
    checks: Array<{ label: string; pass: boolean }>,
    notes: string,
  ) => {
    const pass = checks.every((check) => check.pass) && !turn.events.includes('technical_error');
    results.push({
      checks,
      id,
      notes,
      pass,
      title,
      turn,
      verdict: pass ? 'PASA' : 'FALLA',
    });
    console.log(
      `${(pass ? 'PASA' : 'FALLA').padEnd(6)} ${id} ${title} :: ${checks
        .map((check) => `${check.label}=${check.pass}`)
        .join(' ')}`,
    );
  };

  const has = (turn: TurnResult, type: string) => turn.events.includes(type);
  const answer = (turn: TurnResult) => normalizeSpanishText(turn.answer);
  const sourcesInclude =
    (turn: TurnResult, pattern: RegExp) =>
    (): boolean => turn.sources.some((source) => pattern.test(source.title));
  const cites = (turn: TurnResult): boolean => /\[\d+\]/u.test(turn.answer);
  const noClarification = (turn: TurnResult): boolean =>
    !has(turn, 'clarification');

  // Correspondencia normativa: cada cifra que afirma la respuesta debe existir
  // en el texto de las páginas que la propia respuesta cita. No valida la
  // interpretación, pero impide que un número, plazo o edad inventados pasen
  // como si tuvieran respaldo documental.
  const chunkCache = new Map<
    string,
    Array<{ content: string; pageEnd: number; pageStart: number }>
  >();
  const versionChunks = async (versionId: string) => {
    const cached = chunkCache.get(versionId);
    if (cached) return cached;
    const { data, error } = await client
      .from('document_chunks')
      .select('chunk_content,page_start,page_end')
      .eq('document_version_id', versionId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((row) => ({
      content: row.chunk_content,
      pageEnd: row.page_end,
      pageStart: row.page_start,
    }));
    chunkCache.set(versionId, rows);
    return rows;
  };
  const figureSupport = async (
    turn: TurnResult,
  ): Promise<{ label: string; pass: boolean }> => {
    const cited = (
      await Promise.all(
        turn.sources.map(async (source) => {
          const rows = await versionChunks(source.documentVersionId);
          return rows
            .filter(
              (row) =>
                row.pageStart <= source.pageEnd && row.pageEnd >= source.page,
            )
            .map((row) => row.content)
            .join('\n');
        }),
      )
    ).join('\n');
    const evidence = normalizeSpanishText(cited);
    const body = turn.answer.replace(/\[\d+\]/gu, ' ');
    const figures = new Set(body.match(/\d+(?:[.,]\d+)?/gu) ?? []);
    const unsupported = [...figures].filter(
      (figure) =>
        !evidence.includes(figure) &&
        !evidence.includes(figure.replace(',', '.')) &&
        !evidence.includes(figure.replace('.', ',')),
    );
    return { label: `cifras-respaldadas${unsupported.length ? `(${unsupported.join('|')})` : ''}`, pass: unsupported.length === 0 };
  };

  // Permite repetir un solo caso durante el diagnóstico:
  //   ACCEPTANCE_ONLY=AUX-07 npm run acceptance:auxiliares
  const only = (process.env.ACCEPTANCE_ONLY ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const shouldRun = (id: string): boolean =>
    only.length === 0 || only.includes(id);

  // AUX-01 — Contratación 2026: requisitos generales y específicos.
  if (shouldRun('AUX-01')) {
    const turn = await ask(
      'Quiero trabajar como auxiliar de educación, ¿qué requisitos necesito?',
    );
    const text = answer(turn);
    record(
      'AUX-01',
      'Contratación 2026: requisitos por nivel, edad y expediente',
      turn,
      [
        { label: 'fuente-contratacion-2026', pass: sourcesInclude(turn, /158.*2025.*auxiliares|contratat?cion.*aux.*2026/iu)() },
        { label: 'edad-70', pass: /\b70\b/u.test(text) },
        { label: 'capacitacion-50-inicial', pass: /\b50\b/u.test(text) && /\b(?:inicial|cincuenta)\b/u.test(text) },
        { label: 'expediente-anexo', pass: /\banexo\b|\bexpediente\b|\bdeclaracion jurada\b/u.test(text) },
        { label: 'sin-nombramiento-65', pass: !/\b65\b/u.test(text) },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'Debe describir los requisitos de la contratación 2026 (RVM 158-2025 o FAQ de contratación), no los del nombramiento.',
    );
  }

  // AUX-02 — Remuneración: sin cifra si el corpus no la contiene.
  if (shouldRun('AUX-02')) {
    const turn = await ask(
      '¿Cuánto gana actualmente un auxiliar de educación nombrado?',
    );
    const text = answer(turn);
    record(
      'AUX-02',
      'Remuneración: conserva el límite sin inventar un monto',
      turn,
      [
        {
          label: 'declara-limite',
          pass: /no (?:tengo|encontre|figura|se encuentra)|no.{0,80}monto|documentos disponibles/u.test(text),
        },
        { label: 'sin-cifra-inventada', pass: !/s\/\.?\s*\d{3,}/iu.test(turn.answer) },
        {
          label: 'fuente-remuneracion-auxiliar',
          pass:
            !turn.sources.length ||
            sourcesInclude(turn, /158.*2025.*auxiliares|126.*2023.*auxiliares/iu)(),
        },
        await figureSupport(turn),
      ],
      'La cifra no está en el corpus: debe declararlo sin inventar importes.',
    );
  }

  // AUX-03 — Licencia por enfermedad.
  if (shouldRun('AUX-03')) {
    const turn = await ask(
      'Soy auxiliar contratado, ¿tengo derecho a licencia por enfermedad?',
    );
    const text = answer(turn);
    record(
      'AUX-03',
      'Licencia: incapacidad temporal, CITT/CM y vínculo contratado',
      turn,
      [
        { label: 'fuente-126-2023', pass: sourcesInclude(turn, /126.*2023.*auxiliares/iu)() },
        { label: 'incapacidad-temporal', pass: /incapacidad temporal/u.test(text) },
        { label: 'citt', pass: /\bcitt\b/u.test(text) },
        { label: 'certificado-medico', pass: /certificado medico|\bcm\b/u.test(text) },
        { label: 'plazo-2-5-dias', pass: /dos \(2\) dias|2 dias/u.test(text) && /cinco \(5\)|5 dias/u.test(text) },
        { label: 'distingue-contratado', pass: /\bcontratad/u.test(text) },
        { label: 'vigencia-contrato', pass: /vigencia (?:de (?:tu|su)|del) contrato/u.test(text) },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'RVM 126-2023: CITT desde el primer día, CM hasta 20 días, plazos 2/5 días hábiles y licencia dentro de la vigencia del contrato.',
    );
  }

  // AUX-04 — Nombramiento: concurso, no contratación.
  if (shouldRun('AUX-04')) {
    const turn = await ask(
      '¿Puedo nombrarme como auxiliar si ya llevo varios años contratado?',
    );
    const text = answer(turn);
    record(
      'AUX-04',
      'Nombramiento: concurso público y requisitos propios',
      turn,
      [
        {
          label: 'fuente-nombramiento',
          pass: sourcesInclude(turn, /nombrameinto.*auxiliares|nombramiento.*auxiliares|013.*2021/iu)(),
        },
        { label: 'concurso-publico', pass: /concurso publico/u.test(text) },
        { label: 'requisitos-nombramiento', pass: /65|requisitos generales|declaracion jurada/u.test(text) },
        { label: 'no-automatico', pass: /(?:no|nunca).{0,100}(?:automatic|por si sol|de forma directa|solo por)/u.test(text) },
        { label: 'sin-experiencia-contratacion-2016', pass: !/\b2016\b/u.test(text) },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'FAQ de nombramiento/DS 013-2021: concurso público, edad menor de 65 y requisitos generales; la experiencia de contratación no nombra automáticamente.',
    );
  }

  // AUX-05 — Reasignación: primero posibilidad y condiciones generales.
  if (shouldRun('AUX-05')) {
    const turn = await ask(
      '¿Un auxiliar puede pedir reasignación para irse a otra UGEL?',
    );
    const text = answer(turn);
    record(
      'AUX-05',
      'Reasignación: posibilidad y condiciones antes de la causal',
      turn,
      [
        { label: 'sin-aclaracion-vacia', pass: noClarification(turn) },
        { label: 'fuente-126-2023', pass: sourcesInclude(turn, /126.*2023.*auxiliares/iu)() },
        { label: 'responde-posibilidad', pass: /\b(?:si|puede|pueden|es posible)\b/u.test(text) },
        { label: 'nombrado', pass: /\bnombrad/u.test(text) },
        { label: 'mismo-nivel-modalidad', pass: /mismo (?:cargo, )?nivel y modalidad/u.test(text) },
        { label: 'ugel-destino', pass: /\bugel\b/u.test(text) && /destino/u.test(text) },
        { label: 'causal-despues', pass: /causal/u.test(text) },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'RVM 126-2023 7.1: solo auxiliar nombrado, misma plaza/cargo/nivel/modalidad y causal; la pregunta por la causal va después de responder.',
    );
  }

  // AUX-06 — Vacaciones: nombrados y contratados.
  if (shouldRun('AUX-06')) {
    const turn = await ask(
      '¿El auxiliar tiene vacaciones pagadas igual que un profesor?',
    );
    const text = answer(turn);
    record(
      'AUX-06',
      'Vacaciones: nombrados (60 días) y contratados (truncas)',
      turn,
      [
        { label: 'fuente-126-2023', pass: sourcesInclude(turn, /126.*2023.*auxiliares/iu)() },
        { label: 'nombrado-60-dias', pass: /nombrad/u.test(text) && /\bsesenta \(60\)|\b60\b/u.test(text) },
        { label: 'contratado-truncas', pass: /contratad/u.test(text) && /truncas/u.test(text) },
        { label: 'enero-febrero', pass: /enero y febrero/u.test(text) },
        { label: 'no-confunde-regimenes', pass: !/(?:contratad[oa]s?).{0,120}(?:sesenta \(60\)|60 dias calendario)/u.test(text) },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'RVM 126-2023 6.4: 60 días para nombrados; vacaciones truncas proporcionales para contratados en enero y febrero.',
    );
  }

  // AUX-07 — Permuta: requisitos, plazos y trazabilidad.
  if (shouldRun('AUX-07')) {
    const turn = await ask(
      'Soy auxiliar, ¿puedo hacer permuta con otra auxiliar de otra provincia?',
    );
    const text = answer(turn);
    record(
      'AUX-07',
      'Permuta: requisitos, plazos y vigencia con citas',
      turn,
      [
        { label: 'fuente-126-2023', pass: sourcesInclude(turn, /126.*2023.*auxiliares/iu)() },
        { label: 'mismo-nivel-modalidad', pass: /mismo nivel y modalidad/u.test(text) },
        { label: 'nombrado-5-anios', pass: /cinco(?: \(5\))? a(?:n|ñ)os|\b5 a(?:n|ñ)os\b/iu.test(text) },
        { label: 'tres-anios-ultimo-lugar', pass: /tres(?: \(3\))? a(?:n|ñ)os|\b3 a(?:n|ñ)os\b/iu.test(text) },
        { label: 'impedimento-61', pass: /\b61\b/u.test(text) },
        { label: 'informe-escalafonario', pass: /informe escalafonario/u.test(text) },
        { label: 'plazo-octubre', pass: /octubre/u.test(text) },
        { label: 'vigencia-marzo', pass: /marzo/u.test(text) },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'RVM 126-2023 7.2: mismo nivel/modalidad, nombrado ≥5 años, 3 años en el último lugar, <61 años, informe escalafonario, solicitud hasta la segunda semana de octubre y vigencia en marzo.',
    );
  }

  const out =
    process.env.ACCEPTANCE_OUT ?? 'test/acceptance/out/auxiliares-regression';
  mkdirSync(dirname(out), { recursive: true });
  const metadata = {
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    codeHash: createHash('sha256')
      .update(
        [
          'test/acceptance/auxiliary-regression.ts',
          'src/rag/rag.service.ts',
          'src/rag/auxiliary-retrieval.ts',
          'src/rag/process-clarification.ts',
          'src/rag/prompt.builder.ts',
        ]
          .map((path) => readFileSync(path, 'utf8'))
          .join('\n'),
      )
      .digest('hex'),
    project: new URL(env.SUPABASE_URL).hostname,
    generationModel: values.RAG_ANSWER_MODEL ?? null,
    persistence: 'in_memory',
    corpusWrites: false,
  };
  writeFileSync(
    out + '.json',
    JSON.stringify({ metadata, results, complete: true }, null, 2),
  );
  const lines = [
    '# Regresión de Auxiliar de educación (AUX-01…AUX-07)',
    '',
    `Revisión: ${metadata.gitRevision} · Proyecto: ${metadata.project} · Modelo: ${metadata.generationModel ?? 'n/d'}`,
    '',
    `Resumen: PASA ${results.filter((result) => result.pass).length} · FALLA ${results.filter((result) => !result.pass).length}`,
    '',
    '| Caso | Resultado | Comprobaciones |',
    '| --- | --- | --- |',
    ...results.map(
      (result) =>
        `| ${result.id} ${result.title} | ${result.verdict} | ${result.checks
          .map((check) => `${check.label}: ${check.pass ? 'sí' : 'NO'}`)
          .join('; ')} |`,
    ),
    '',
    ...results.flatMap((result) => [
      `## ${result.id} — ${result.title} (${result.verdict})`,
      `**Pregunta:** ${result.turn.question}`,
      '',
      `**Eventos:** ${result.turn.events.join(', ')}`,
      '',
      `**Fuentes:** ${result.turn.sources.map((source) => `${source.title} (p. ${source.page})`).join('; ') || 'ninguna'}`,
      '',
      `**Respuesta:** ${result.turn.answer}`,
      '',
      `**Criterio:** ${result.notes}`,
      '',
    ]),
  ];
  writeFileSync(out + '.md', lines.join('\n'));
  console.log(`Informe: ${out}.md`);
  if (results.some((result) => !result.pass)) process.exitCode = 1;
}

void main();
