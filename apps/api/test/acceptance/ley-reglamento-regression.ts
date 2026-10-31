/**
 * Regresión semántica y de correspondencia normativa del módulo
 * «Ley y reglamento» (LEY-01…LEY-07).
 *
 * Uso (desde apps/api):
 *   ACCEPTANCE_ENV_FILE=.env.staging.local npm run acceptance:ley
 *   ACCEPTANCE_ONLY=LEY-07 npm run acceptance:ley
 *
 * Comprueba, contra el corpus real y el pipeline real, que cada respuesta:
 *  - conserva el módulo seleccionado y no lo convierte en cambio de tema;
 *  - distingue la Ley 29944 de su reglamento y de las normas modificatorias;
 *  - no inventa derechos, deberes, sanciones ni artículos ausentes;
 *  - usa normas relacionadas solo cuando regulan de verdad la materia;
 *  - cita las fuentes que respaldan los datos que afirma.
 *
 * No escribe en el corpus ni en el historial.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuthorizationContext } from '../../src/authorization';
import type { ChatHistoryGateway } from '../../src/chat/chat-history.gateway';
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
  const legalModuleId = activeModules.find(
    (module) => module.name === 'Ley y reglamento' && !module.parentModuleId,
  )?.id;
  if (!legalModuleId) {
    throw new Error(
      'Precondición incumplida: falta el módulo activo «Ley y reglamento».',
    );
  }

  const conversations = new Map<
    string,
    Array<{ content: string; role: string }>
  >();
  const history = {
    beginTurn: (input: { conversationId: string | null }) => {
      const id = input.conversationId ?? randomUUID();
      if (!conversations.has(id)) conversations.set(id, []);
      return Promise.resolve({
        conversationId: id,
        userMessageId: randomUUID(),
      });
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
    email: 'qa-ley@example.com',
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
      selectedModuleId: legalModuleId as string,
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
    const pass =
      checks.every((check) => check.pass) &&
      !turn.events.includes('technical_error');
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
  const sourcesInclude = (turn: TurnResult, pattern: RegExp) => (): boolean =>
    turn.sources.some((source) => pattern.test(source.title));
  const cites = (turn: TurnResult): boolean => /\[\d+\]/u.test(turn.answer);
  const common = (turn: TurnResult) => [
    {
      label: 'modulo-legal',
      pass: turn.moduleId === legalModuleId,
    },
    { label: 'sin-aclaracion', pass: !has(turn, 'clarification') },
  ];

  // Correspondencia normativa: cada cifra que afirma la respuesta debe existir
  // en el texto de las páginas que la propia respuesta cita.
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
    const citedIndexes = new Set(
      [...turn.answer.matchAll(/\[(\d+)\]/gu)].map((match) => Number(match[1])),
    );
    const citedSources = turn.sources.filter((_source, index) =>
      citedIndexes.has(index + 1),
    );
    const cited = (
      await Promise.all(
        citedSources.map(async (source) => {
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
    return {
      label: `cifras-respaldadas${unsupported.length ? `(${unsupported.join('|')})` : ''}`,
      pass: unsupported.length === 0,
    };
  };

  // Permite repetir un solo caso durante el diagnóstico:
  //   ACCEPTANCE_ONLY=LEY-07 npm run acceptance:ley
  const only = (process.env.ACCEPTANCE_ONLY ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const shouldRun = (id: string): boolean =>
    only.length === 0 || only.includes(id);

  let ley01Text = '';

  // LEY-01 — Consulta general sobre la Ley 29944.
  if (shouldRun('LEY-01')) {
    const turn = await ask(
      '¿Qué es la Ley N.º 29944, Ley de Reforma Magisterial?',
    );
    const text = answer(turn);
    ley01Text = text;
    record(
      'LEY-01',
      'Ley 29944: identifica la norma y declara el límite documental',
      turn,
      [
        ...common(turn),
        { label: 'nombra-ley-29944', pass: /\b29944\b/u.test(text) },
        {
          label: 'declara-carencia',
          pass:
            /no encontre|no esta|no se encuentra|no dispongo|no cuento/u.test(
              text,
            ) && /texto/u.test(text),
        },
        {
          label: 'sin-articulo-inventado',
          pass: !/\barticulo\s+\d+/u.test(text),
        },
      ],
      'Con la ley ausente del corpus, debe identificar la norma y declarar que su texto no está cargado, sin inventar artículos.',
    );
  }

  // LEY-02 — Diferencia entre la ley y su reglamento.
  if (shouldRun('LEY-02')) {
    const turn = await ask(
      '¿Cuál es la diferencia entre la Ley N.º 29944 y su reglamento?',
    );
    const text = answer(turn);
    record(
      'LEY-02',
      'Ley y reglamento: distingue ambas normas y mantiene la misma disponibilidad',
      turn,
      [
        ...common(turn),
        { label: 'nombra-ley-29944', pass: /\b29944\b/u.test(text) },
        {
          label: 'nombra-reglamento',
          pass: /reglamento/u.test(text) && /004-2013/u.test(text),
        },
        {
          label: 'distingue-normas',
          pass: /dos normas distintas|norma distinta|la ley y su reglamento/u.test(
            text,
          ),
        },
        {
          label: 'consistente-con-ley-01',
          pass:
            !ley01Text ||
            (/no encontre|no esta|no se encuentra/u.test(ley01Text) &&
              /no encontre|no esta|no se encuentra/u.test(text)),
        },
        {
          label: 'sin-articulo-inventado',
          pass: !/\barticulo\s+\d+/u.test(text),
        },
      ],
      'Debe distinguir la ley de su reglamento y no afirmar en una consulta que una está disponible y en otra que falta.',
    );
  }

  // LEY-03 — Efecto de una modificación sobre el texto original.
  if (shouldRun('LEY-03')) {
    const turn = await ask(
      'Si se modifica un artículo de la Ley N.º 29944, ¿sigue vigente el texto original?',
    );
    const text = answer(turn);
    record(
      'LEY-03',
      'Modificaciones: no asume que el texto original sigue vigente',
      turn,
      [
        ...common(turn),
        {
          label: 'plantea-modificacion',
          pass: /modific/u.test(text) && /vigente/u.test(text),
        },
        {
          label: 'condiciona-vigencia',
          pass: /no puedo determinar|no es posible determinar|no consta/u.test(
            text,
          ),
        },
        {
          label: 'declara-limite',
          pass: /no puedo determinar|no es posible determinar|no consta|no encontre/u.test(
            text,
          ),
        },
      ],
      'Sin la norma modificatoria cargada, debe decir que no puede determinar el cambio ni la vigencia del texto original.',
    );
  }

  // LEY-04 — Sanctions and loss of appointment.
  if (shouldRun('LEY-04')) {
    const turn = await ask('¿En qué casos un docente pierde el nombramiento?');
    const text = answer(turn);
    record(
      'LEY-04',
      'Sanciones: reconoce el régimen disciplinario y sus causales',
      turn,
      [
        ...common(turn),
        {
          label: 'fuente-disciplinaria',
          pass: sourcesInclude(
            turn,
            /proceso administrativo disciplinario|29988/iu,
          )(),
        },
        {
          label: 'explica-destitucion',
          pass:
            /destitucion/u.test(text) && /sancion|pad|disciplinari/u.test(text),
        },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'Debe reconocer el PAD y explicar las causales de destitución con la norma disciplinaria, no derivar a otro módulo.',
    );
  }

  // LEY-05 — Derechos docentes.
  if (shouldRun('LEY-05')) {
    const turn = await ask('¿Cuáles son los derechos de los docentes?');
    const text = answer(turn);
    record(
      'LEY-05',
      'Derechos: declara la falta del artículo y no inventa un listado',
      turn,
      [
        ...common(turn),
        { label: 'nombra-derechos', pass: /derechos/u.test(text) },
        {
          label: 'declara-carencia',
          pass: /(?:no encontre|no se encuentra|no esta).{0,80}texto|no puedo enumerar/u.test(
            text,
          ),
        },
        {
          label: 'sin-lista-inventada',
          pass: !/^\s*[-*\d]/mu.test(turn.answer),
        },
      ],
      'Sin el texto de la ley no debe enumerar derechos; debe declarar la carencia y no redirigir.',
    );
  }

  // LEY-06 — Deberes docentes.
  if (shouldRun('LEY-06')) {
    const turn = await ask('¿Cuáles son los deberes de los docentes?');
    const text = answer(turn);
    record(
      'LEY-06',
      'Deberes: declara la falta del artículo y no infiere obligaciones',
      turn,
      [
        ...common(turn),
        { label: 'nombra-deberes', pass: /deberes/u.test(text) },
        {
          label: 'declara-carencia',
          pass: /(?:no encontre|no se encuentra|no esta).{0,80}texto|no puedo enumerar/u.test(
            text,
          ),
        },
        {
          label: 'sin-lista-inventada',
          pass: !/^\s*[-*\d]/mu.test(turn.answer),
        },
      ],
      'Sin el texto de la ley o del reglamento no debe inferir deberes de otras normas; debe declarar la carencia.',
    );
  }

  // LEY-07 — Licencia por motivos particulares.
  if (shouldRun('LEY-07')) {
    const turn = await ask(
      '¿Puedo solicitar licencia por motivos particulares?',
    );
    const text = answer(turn);
    record(
      'LEY-07',
      'Licencias: base legal, condiciones y requisitos del 5.20',
      turn,
      [
        ...common(turn),
        {
          label: 'fuente-licencias-profesores',
          pass: sourcesInclude(
            turn,
            /licencias, permisos y vacaciones de profesores/iu,
          )(),
        },
        {
          label: 'motivos-particulares',
          pass: /motivos particulares/u.test(text),
        },
        {
          label: 'condicion-anios',
          pass:
            /(?:mas de un|mas de 1|un \(01\)|1)[^.]{0,16}\banos?\b/u.test(
              text,
            ) && /(?:dos|2)[^.]{0,16}\banos\b/u.test(text),
        },
        {
          label: 'referencia-numeral',
          pass: /5\.20/u.test(text) || /periodo de cinco/u.test(text),
        },
        { label: 'citas', pass: cites(turn) },
        { label: 'sin-no-evidencia', pass: !has(turn, 'no_evidence') },
        await figureSupport(turn),
      ],
      'Debe usar la Norma Técnica de licencias de profesores y explicar las condiciones del 5.20, sin derivar a otro módulo.',
    );
  }

  const out =
    process.env.ACCEPTANCE_OUT ?? 'test/acceptance/out/ley-reglamento';
  mkdirSync(dirname(out), { recursive: true });
  const metadata = {
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    codeHash: createHash('sha256')
      .update(
        [
          'test/acceptance/ley-reglamento-regression.ts',
          'src/rag/rag.service.ts',
          'src/rag/legal-retrieval.ts',
          'src/rag/prompt.builder.ts',
          'src/chat/chat.service.ts',
        ]
          .map((path) => readFileSync(path, 'utf8'))
          .join('\n'),
      )
      .digest('hex'),
    project: new URL(env.SUPABASE_URL).hostname,
    generationModel:
      typeof values.RAG_ANSWER_MODEL === 'string'
        ? values.RAG_ANSWER_MODEL
        : null,
    persistence: 'in_memory',
    corpusWrites: false,
  };
  writeFileSync(
    out + '.json',
    JSON.stringify({ metadata, results, complete: true }, null, 2),
  );
  const lines = [
    '# Regresión de Ley y reglamento (LEY-01…LEY-07)',
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
  ];
  for (const result of results) {
    lines.push(
      '',
      `## ${result.id} — ${result.title} (${result.verdict})`,
      `**Pregunta:** ${result.turn.question}`,
      '',
      `**Eventos:** ${result.turn.events.join(', ')}`,
      '',
      `**Fuentes:** ${
        result.turn.sources.length
          ? result.turn.sources
              .map((source) => `${source.title} (p. ${source.page})`)
              .join('; ')
          : 'ninguna'
      }`,
      '',
      `**Respuesta:** ${result.turn.answer}`,
      '',
      `**Criterio:** ${result.notes}`,
    );
  }
  writeFileSync(out + '.md', lines.join('\n'));
  console.log(`Informe: ${out}.md`);
  if (results.some((result) => !result.pass)) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
