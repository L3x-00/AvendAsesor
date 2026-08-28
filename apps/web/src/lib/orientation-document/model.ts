import { z } from "zod";
import type { ChatConversationDetail, ChatSource } from "@/lib/chat-api/types";

export const ORIENTATION_DISCLAIMER =
  "Documento de orientación informativa. No constituye un acto administrativo, resolución ni constancia, y no reemplaza la normativa vigente.";

export const ORIENTATION_FIELD_LIMITS = {
  caseNotes: 1_500,
  caseTitle: 200,
  institution: 200,
  teacherName: 160,
} as const;

const unsafeControlCharacters =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

const unsafeDocumentCodePoints = new Set([
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
]);

/** Keeps only XML 1.0-compatible Unicode scalar values. */
export function sanitizeDocumentText(value: string): string {
  let sanitized = "";

  for (const character of value.normalize("NFC").replace(/\r\n?/g, "\n")) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;

    const isXml10Character =
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    const isUnsafeControl =
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      unsafeDocumentCodePoints.has(codePoint);

    if (isXml10Character && !isUnsafeControl) sanitized += character;
  }

  return sanitized;
}

export function sanitizePresentationText(
  value: string,
  multiline = false,
): string {
  // User-supplied presentation fields never carry angle-bracket markup into a
  // generated document or its file name; the brackets are dropped, not spaced.
  const normalized = sanitizeDocumentText(value).replace(/[<>]/g, "").trim();

  if (!multiline) {
    return normalized.replace(/\s+/g, " ");
  }

  return normalized
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function presentationField(maxLength: number, multiline = false) {
  return z
    .string()
    .max(maxLength * 2)
    .transform((value) => sanitizePresentationText(value, multiline))
    .pipe(z.string().max(maxLength))
    .default("");
}

export const orientationPresentationSchema = z
  .object({
    caseNotes: presentationField(ORIENTATION_FIELD_LIMITS.caseNotes, true),
    caseTitle: presentationField(ORIENTATION_FIELD_LIMITS.caseTitle),
    institution: presentationField(ORIENTATION_FIELD_LIMITS.institution),
    teacherName: presentationField(ORIENTATION_FIELD_LIMITS.teacherName),
  })
  .strict();
export type OrientationPresentation = z.infer<
  typeof orientationPresentationSchema
>;

export const orientationRouteParamsSchema = z
  .object({
    conversationId: z.string().uuid(),
    format: z.enum(["docx", "pdf"]).optional(),
    messageId: z.string().uuid(),
  })
  .strict();

export interface OrientationContext {
  answer: string;
  answeredAt: string;
  conversationId: string;
  conversationTitle: string | null;
  messageId: string;
  question: string;
  sources: ChatSource[];
}

export interface OrientationDocumentContent extends OrientationContext {
  answeredOn: string;
  caseNotes: string;
  documentTitle: string;
  institution: string;
  teacherName: string;
}

export function resolveOrientationContext(
  detail: ChatConversationDetail,
  conversationId: string,
  messageId: string,
): OrientationContext | null {
  if (detail.conversation.id !== conversationId) return null;

  const answerIndex = detail.messages.findIndex(
    (message) => message.id === messageId,
  );
  if (answerIndex < 0) return null;

  const answer = detail.messages[answerIndex];
  if (!answer || answer.role !== "assistant" || answer.sources.length < 1) {
    return null;
  }

  if (!answer.inReplyToMessageId) return null;
  const question = detail.messages
    .slice(0, answerIndex)
    .find(
      (message) =>
        message.role === "user" && message.id === answer.inReplyToMessageId,
    );
  if (!question) return null;

  const safeAnswer = sanitizeDocumentText(answer.content).trim();
  const safeQuestion = sanitizeDocumentText(question.content).trim();
  if (!safeAnswer || !safeQuestion) return null;

  const safeSources = answer.sources
    .map((source) => ({
      ...source,
      articleReference: source.articleReference
        ? sanitizeDocumentText(source.articleReference).trim() || null
        : null,
      documentTitle:
        sanitizeDocumentText(source.documentTitle).trim() || "Documento fuente",
      moduleName: source.moduleName
        ? sanitizeDocumentText(source.moduleName).trim() || null
        : null,
      numeralReference: source.numeralReference
        ? sanitizeDocumentText(source.numeralReference).trim() || null
        : null,
      sectionTitle: source.sectionTitle
        ? sanitizeDocumentText(source.sectionTitle).trim() || null
        : null,
    }))
    .sort((left, right) => left.rank - right.rank);
  const conversationTitle = detail.conversation.title
    ? sanitizeDocumentText(detail.conversation.title).trim() || null
    : null;

  return {
    answer: safeAnswer,
    answeredAt: answer.createdAt,
    conversationId,
    conversationTitle,
    messageId,
    question: safeQuestion,
    sources: safeSources,
  };
}

export function formatOrientationDate(timestamp: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    timeZone: "America/Lima",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function createOrientationDocumentContent(
  context: OrientationContext,
  presentation: OrientationPresentation,
): OrientationDocumentContent {
  const conversationTitle = context.conversationTitle
    ? sanitizePresentationText(context.conversationTitle).slice(
        0,
        ORIENTATION_FIELD_LIMITS.caseTitle,
      )
    : "";

  return {
    ...context,
    answeredOn: formatOrientationDate(context.answeredAt),
    caseNotes: presentation.caseNotes,
    documentTitle:
      presentation.caseTitle ||
      conversationTitle ||
      "Ficha de orientación AVEND",
    institution: presentation.institution,
    teacherName: presentation.teacherName,
  };
}

export function describeOrientationSource(source: ChatSource): string {
  const pages =
    source.pageStart === source.pageEnd
      ? `página ${source.pageStart}`
      : `páginas ${source.pageStart}–${source.pageEnd}`;
  const article = source.articleReference
    ? /^art(?:ículo|iculo)?\.?(?:\s|$)/i.test(source.articleReference)
      ? source.articleReference
      : `artículo ${source.articleReference}`
    : null;
  const details = [
    source.sectionTitle ? `sección ${source.sectionTitle}` : null,
    article,
    source.numeralReference ? `numeral ${source.numeralReference}` : null,
  ].filter((value): value is string => Boolean(value));

  return sanitizeDocumentText(
    `[${source.rank}] ${source.documentTitle}, versión ${source.versionNumber}, ${pages}${details.length ? `, ${details.join(", ")}` : ""}.`,
  );
}

export function sanitizeFileBaseName(value: string): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(unsafeControlCharacters, "")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 80);

  return sanitized || "Ficha de orientación AVEND";
}

function asciiFileName(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 80) || "ficha-orientacion-avend"
  );
}

export function contentDisposition(fileName: string): string {
  const extensionMatch = fileName.match(/\.(docx|pdf)$/i);
  const extension = extensionMatch?.[0].toLowerCase() ?? "";
  const requestedBase = extension
    ? fileName.slice(0, -extension.length)
    : fileName;
  const maxBaseLength = 80 - extension.length;
  const safeBase = sanitizeFileBaseName(requestedBase).slice(0, maxBaseLength);
  const safeFileName = `${safeBase}${extension}`;
  const ascii = `${asciiFileName(safeBase).slice(0, maxBaseLength)}${extension}`;
  const encoded = encodeURIComponent(safeFileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
