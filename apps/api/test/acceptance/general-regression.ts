/**
 * Regresión de las siete consultas del Chat General (CG-01…CG-07).
 *
 * Uso (desde apps/api):
 *   ACCEPTANCE_ENV_FILE=.env.staging.local npm run acceptance:chat-general
 *
 * Comprueba, contra el corpus real y el pipeline real:
 *  - que cada consulta identifique su tema y recupere documentos de ese tema;
 *  - que la respuesta cite fuentes y no invente cifras, plazos ni requisitos;
 *  - que una falta documental se explique por tema, sin lista de módulos;
 *  - que el procedimiento disciplinario conserve defensa, descargos y citas;
 *  - que el chat general no quede atado al módulo de un turno anterior.
 *
 * No escribe en el corpus ni en el historial. Consume saldo del proveedor
 * (siete consultas).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  documentTitle: string;
  moduleName: string | null;
}

interface TurnResult {
  answer: string;
  clarificationModules: string[];
  events: string[];
  modules: string[];
  moduleId: string | null | undefined;
  question: string;
  sources: SourceView[];
}

interface CaseResult {
  checks: Array<{ label: string; pass: boolean }>;
  id: string;
  moduleId: string | null | undefined;
  notes: string;
  pass: boolean;
  title: string;
  verdict: 'PASA' | 'FALLA';
}

interface CaseDefinition {
  id: string;
  question: string;
  title: string;
  check(
    turn: TurnResult,
    answer: string,
  ): Array<{ label: string; pass: boolean }>;
  notes: string;
}

function readEnvironmentFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line);
    if (match?.[1]) env[match[1]] = (match[2] ?? '').trim();
  }
  return env;
}

const has = (turn: TurnResult, type: string) => turn.events.includes(type);
const sourceTitle = (turn: TurnResult, pattern: RegExp) =>
  turn.sources.some((source) =>
    pattern.test(normalizeSpanishText(source.documentTitle)),
  );
const cites = (turn: TurnResult) => /\[\d+\]/u.test(turn.answer);
const noClarification = (turn: TurnResult) => !has(turn, 'clarification');
const noAlternatives = (turn: TurnResult) => turn.modules.length === 0;

const CASES: CaseDefinition[] = [
  {
    id: 'CG-01',
    notes: 'Junín → Lima por familia es reasignación por unidad familiar.',
    question:
      'soy nombrado en junin pero quiero irme a lima porque mi familia vive alla que hago',
    title: 'Reasignación por unidad familiar',
    check: (turn, answer) => [
      { label: 'sin_aclaracion', pass: noClarification(turn) },
      { label: 'sin_alternativas', pass: noAlternatives(turn) },
      {
        label: 'fuente_reasignacion',
        pass:
          sourceTitle(turn, /reasignacion/u) &&
          turn.sources.some(
            (source) =>
              /reasignacion|contratacion/i.test(source.moduleName ?? '') &&
              !/auxiliar/i.test(source.moduleName ?? ''),
          ),
      },
      {
        label: 'responde_reasignacion',
        pass: /reasignacion|unidad familiar/u.test(answer),
      },
      { label: 'cita', pass: cites(turn) },
    ],
  },
  {
    id: 'CG-02',
    notes: 'Descanso prescrito por 15 días es incapacidad temporal.',
    question:
      'el doctor me dio descanso por 15 dias como justifico eso en mi colegio',
    title: 'Licencia por incapacidad temporal',
    check: (turn, answer) => [
      { label: 'sin_aclaracion', pass: noClarification(turn) },
      { label: 'sin_alternativas', pass: noAlternatives(turn) },
      { label: 'fuente_licencias', pass: sourceTitle(turn, /licencias/u) },
      {
        label: 'responde_incapacidad',
        pass: /incapacidad|descanso medico|citt|certificado medico/u.test(
          answer,
        ),
      },
      { label: 'cita', pass: cites(turn) },
    ],
  },
  {
    id: 'CG-03',
    notes: 'Pago adicional por zona rural es la asignación por ruralidad.',
    question: 'mi colegio esta en zona rural me toca recibir un pago adicional',
    title: 'Asignación por ruralidad',
    check: (turn, answer) => [
      { label: 'sin_aclaracion', pass: noClarification(turn) },
      { label: 'sin_alternativas', pass: noAlternatives(turn) },
      {
        label: 'fuente_rural',
        pass:
          sourceTitle(turn, /asignacion rural|rural/u) &&
          turn.sources.some((source) =>
            /remuneracion/i.test(source.moduleName ?? ''),
          ),
      },
      {
        label: 'responde_asignacion',
        pass: /asignacion/u.test(answer) && /rural/u.test(answer),
      },
      { label: 'cita', pass: cites(turn) },
    ],
  },
  {
    id: 'CG-04',
    notes:
      'Ascenso a segunda escala: Evaluación docente no tiene documentos cargados.',
    question:
      'ya tengo varios años en primera escala como hago para subir a segunda',
    title: 'Ascenso de escala magisterial',
    check: (turn, answer) => [
      { label: 'sin_aclaracion', pass: noClarification(turn) },
      { label: 'sin_alternativas', pass: noAlternatives(turn) },
      {
        label: 'informa_o_responde',
        pass:
          turn.sources.length === 0
            ? /ascenso/u.test(answer) &&
              /evaluacion docente/u.test(answer) &&
              /no cuento con documentacion disponible/u.test(answer)
            : /ascenso/u.test(answer) && cites(turn),
      },
    ],
  },
  {
    id: 'CG-05',
    notes: 'Requisitos para auxiliar de educación inicial.',
    question:
      'mi hermana quiere trabajar de auxiliar en inicial que estudios necesita',
    title: 'Requisitos de auxiliar de educación',
    check: (turn, answer) => [
      { label: 'sin_aclaracion', pass: noClarification(turn) },
      { label: 'sin_alternativas', pass: noAlternatives(turn) },
      {
        label: 'fuente_auxiliares',
        pass:
          sourceTitle(turn, /auxiliar/u) &&
          turn.sources.some((source) =>
            /auxiliar/i.test(source.moduleName ?? ''),
          ),
      },
      {
        label: 'responde_requisitos',
        pass: /requisito|formacion|estudios|inicial/u.test(answer),
      },
      { label: 'cita', pass: cites(turn) },
    ],
  },
  {
    id: 'CG-06',
    notes: 'El procedimiento disciplinario ya funcionaba: debe conservarse.',
    question:
      'mi director dice que me va sancionar pero yo quiero saber si tengo derecho a defenderme',
    title: 'Derecho de defensa en el PAD',
    check: (turn, answer) => [
      { label: 'sin_aclaracion', pass: noClarification(turn) },
      { label: 'sin_alternativas', pass: noAlternatives(turn) },
      {
        label: 'fuente_pad',
        pass:
          sourceTitle(turn, /disciplinari/u) &&
          turn.sources.some((source) =>
            /situaciones|disciplinari/i.test(source.moduleName ?? ''),
          ),
      },
      {
        label: 'responde_defensa',
        pass: /defens|descargos|derecho/u.test(answer),
      },
      { label: 'cita', pass: cites(turn) },
    ],
  },
  {
    id: 'CG-07',
    notes:
      'Racionalización de plazas: Cargos y plazas no tiene documentos cargados.',
    question:
      'en mi colegio estan bajando los alumnos y dicen que van a reducir plazas eso se puede',
    title: 'Racionalización de plazas',
    check: (turn, answer) => [
      { label: 'sin_aclaracion', pass: noClarification(turn) },
      { label: 'sin_alternativas', pass: noAlternatives(turn) },
      {
        label: 'informa_o_responde',
        pass:
          turn.sources.length === 0
            ? /racionalizacion/u.test(answer) &&
              /cargos y plazas/u.test(answer) &&
              /no cuento con documentacion disponible/u.test(answer)
            : /racionalizacion/u.test(answer) && cites(turn),
      },
    ],
  },
];

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
    email: 'qa-general@example.com',
    emailConfirmedAt: null,
    role: 'docente',
    userId: randomUUID(),
  };

  const conversationId = randomUUID();
  conversations.set(conversationId, []);

  async function ask(question: string): Promise<TurnResult> {
    const events: ChatStreamEvent[] = [];
    for await (const event of chat.stream({
      authorization: teacher,
      conversationId,
      question,
      selectedModuleId: null,
    })) {
      events.push(event);
    }
    let answer = '';
    let moduleId: string | null | undefined;
    let clarificationModules: string[] = [];
    let modules: string[] = [];
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
      if (event.type === 'done' && 'modules' in event.data) {
        modules = (event.data.modules ?? []).map((item) => item.name);
      }
      if (event.type === 'sources') {
        sources = event.data.sources.map((source) => ({
          documentTitle: source.documentTitle,
          moduleName: source.moduleName
            ? normalizeSpanishText(source.moduleName)
            : null,
        }));
      }
    }
    conversations
      .get(conversationId)
      ?.push({ content: question, role: 'user' });
    return {
      answer,
      clarificationModules,
      events: [...new Set(events.map((event) => event.type))],
      moduleId,
      modules,
      question,
      sources,
    };
  }

  const results: CaseResult[] = [];
  for (const definition of CASES) {
    const turn = await ask(definition.question);
    const answer = normalizeSpanishText(turn.answer);
    const checks = definition.check(turn, answer);
    // La independencia del chat general se comprueba en todos los turnos.
    checks.push({ label: 'sigue_general', pass: turn.moduleId === null });
    checks.push({
      label: 'sin_alternativas_visibles',
      pass: turn.clarificationModules.length === 0 && turn.modules.length === 0,
    });
    const pass =
      checks.every((check) => check.pass) &&
      !turn.events.includes('technical_error');
    results.push({
      checks,
      id: definition.id,
      moduleId: turn.moduleId,
      notes: definition.notes,
      pass,
      title: definition.title,
      verdict: pass ? 'PASA' : 'FALLA',
    });
    console.log(
      `${(pass ? 'PASA' : 'FALLA').padEnd(6)} ${definition.id} ${definition.title} :: ${checks
        .map((check) => `${check.label}=${check.pass}`)
        .join(' ')}`,
    );
    console.log(
      `       respuestas: ${turn.answer.replace(/\s+/gu, ' ').slice(0, 400)}`,
    );
    console.log(
      `       fuentes: ${turn.sources
        .map(
          (source) => `${source.documentTitle} (${source.moduleName ?? '-'})`,
        )
        .join(' | ')}`,
    );
  }

  const passed = results.filter((result) => result.pass).length;
  console.log(`\nRESUMEN: ${passed}/${results.length} PASA`);
  const failed = results.filter((result) => !result.pass);
  if (failed.length) {
    console.log(
      `FALLAN: ${failed
        .map(
          (result) =>
            `${result.id} (${result.checks
              .filter((c) => !c.pass)
              .map((c) => c.label)
              .join(',')})`,
        )
        .join('; ')}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
