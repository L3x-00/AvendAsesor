import { describe, expect, it } from "vitest";
import type { ChatConversationDetail } from "@/lib/chat-api/types";
import {
  contentDisposition,
  createOrientationDocumentContent,
  describeOrientationSource,
  orientationPresentationSchema,
  resolveOrientationContext,
  sanitizeDocumentText,
  sanitizeFileBaseName,
  sanitizePresentationText,
} from "./model";

const conversationId = "4c8b56af-6d0c-4fef-881e-7c00907540dd";
const messageId = "6c8b56af-6d0c-4fef-881e-7c00907540dd";
const questionId = "5c8b56af-6d0c-4fef-881e-7c00907540dd";
const source = {
  articleReference: "Artículo 5",
  documentSituation: "current" as const,
  documentTitle: "Ley de Reforma Magisterial",
  id: "9c8b56af-6d0c-4fef-881e-7c00907540dd",
  moduleName: "Licencias",
  numeralReference: "5.1",
  pageEnd: 34,
  pageStart: 33,
  rank: 1,
  relevanceScore: 0.92,
  sectionTitle: "Licencias por salud",
  versionNumber: 2,
};

function conversation(
  answer: Partial<ChatConversationDetail["messages"][number]> = {},
): ChatConversationDetail {
  return {
    conversation: {
      createdAt: "2026-08-24T12:00:00.000Z",
      id: conversationId,
      selectedModuleId: null,
      title: "Licencia docente",
      updatedAt: "2026-08-24T12:01:00.000Z",
    },
    messages: [
      {
        content: "¿Qué requisito debo presentar?",
        createdAt: "2026-08-24T12:00:00.000Z",
        id: questionId,
        inReplyToMessageId: null,
        role: "user",
        sources: [],
      },
      {
        content: "Debes presentar la solicitud sustentada. [1]",
        createdAt: "2026-08-24T12:01:00.000Z",
        id: messageId,
        inReplyToMessageId: questionId,
        role: "assistant",
        sources: [source],
        ...answer,
      },
    ],
  };
}

describe("orientation document model", () => {
  it("reuses only a completed sourced assistant answer and its preceding question", () => {
    const context = resolveOrientationContext(
      conversation(),
      conversationId,
      messageId,
    );

    expect(context).toMatchObject({
      answer: "Debes presentar la solicitud sustentada. [1]",
      conversationTitle: "Licencia docente",
      question: "¿Qué requisito debo presentar?",
      sources: [source],
    });
  });

  it.each([
    ["a foreign conversation", conversation(), crypto.randomUUID(), messageId],
    ["a missing message", conversation(), conversationId, crypto.randomUUID()],
    [
      "a source-less answer",
      conversation({ sources: [] }),
      conversationId,
      messageId,
    ],
    [
      "a clarification",
      conversation({ role: "clarification" }),
      conversationId,
      messageId,
    ],
    [
      "a no-evidence outcome",
      conversation({ role: "no_evidence" }),
      conversationId,
      messageId,
    ],
  ])(
    "rejects %s",
    (_label, detail, requestedConversationId, requestedMessageId) => {
      expect(
        resolveOrientationContext(
          detail,
          requestedConversationId,
          requestedMessageId,
        ),
      ).toBeNull();
    },
  );

  it("rejects an answer whose owned question is not present in the bounded history", () => {
    const detail = conversation();
    detail.messages = [detail.messages[1]!];

    expect(
      resolveOrientationContext(detail, conversationId, messageId),
    ).toBeNull();
  });

  it("resolves the canonical linked question in an interleaved conversation", () => {
    const detail = conversation();
    const secondQuestionId = "7c8b56af-6d0c-4fef-881e-7c00907540dd";
    detail.messages.splice(1, 0, {
      content: "Segunda pregunta que no corresponde a la primera respuesta",
      createdAt: "2026-08-24T12:00:30.000Z",
      id: secondQuestionId,
      inReplyToMessageId: null,
      role: "user",
      sources: [],
    });

    const context = resolveOrientationContext(
      detail,
      conversationId,
      messageId,
    );

    expect(context?.question).toBe("¿Qué requisito debo presentar?");
  });

  it("fails closed when the canonical reply link is absent", () => {
    expect(
      resolveOrientationContext(
        conversation({ inReplyToMessageId: null }),
        conversationId,
        messageId,
      ),
    ).toBeNull();
  });

  it("normalizes optional text, strips HTML angle brackets and leaves inert formula text", () => {
    const parsed = orientationPresentationSchema.parse({
      caseNotes: "- nota válida\n+SUM(A1:A2)\n\u0000<script>alert(1)</script>",
      caseTitle: "  Caso   de licencia  ",
      institution: "<b>IE 123</b>",
      teacherName: '=HYPERLINK("https://example.test")',
    });

    // Presentation metadata drops angle brackets (so no markup reaches the
    // preview, the documents or the file name); formula-shaped prefixes stay
    // literal because DOCX/PDF are non-executing formats.
    expect(parsed).toEqual({
      caseNotes: "- nota válida\n+SUM(A1:A2)\nscriptalert(1)/script",
      caseTitle: "Caso de licencia",
      institution: "bIE 123/b",
      teacherName: '=HYPERLINK("https://example.test")',
    });
    expect(sanitizePresentationText("  María\tPérez  ")).toBe("María Pérez");
  });

  it("removes every XML 1.0-invalid scalar without changing visible text", () => {
    expect(
      sanitizeDocumentText("Edad < 65\u0001\u000b\ufffe\uffff años + 5 días"),
    ).toBe("Edad < 65 años + 5 días");

    const detail = conversation({
      content: "Respuesta\u0001 segura. [1]",
      sources: [
        {
          ...source,
          documentTitle: "Norma\u000b oficial\uffff",
          sectionTitle: "Sección\ufffe válida",
        },
      ],
    });
    detail.messages[0]!.content = "¿Qué\u000b corresponde?";

    expect(
      resolveOrientationContext(detail, conversationId, messageId),
    ).toMatchObject({
      answer: "Respuesta segura. [1]",
      question: "¿Qué corresponde?",
      sources: [
        { documentTitle: "Norma oficial", sectionTitle: "Sección válida" },
      ],
    });
  });

  it("uses empty defaults and rejects oversized or unexpected form fields", () => {
    expect(orientationPresentationSchema.parse({})).toEqual({
      caseNotes: "",
      caseTitle: "",
      institution: "",
      teacherName: "",
    });
    expect(
      orientationPresentationSchema.safeParse({
        teacherName: "x".repeat(161),
      }).success,
    ).toBe(false);
    expect(
      orientationPresentationSchema.safeParse({ injectedAnswer: "fake" })
        .success,
    ).toBe(false);
  });

  it("creates deterministic trusted content and complete source descriptions", () => {
    const context = resolveOrientationContext(
      conversation(),
      conversationId,
      messageId,
    )!;
    const content = createOrientationDocumentContent(
      context,
      orientationPresentationSchema.parse({
        caseNotes: "Presentar copia.",
        caseTitle: "Caso María",
        institution: "IE 123",
        teacherName: "María Pérez",
      }),
    );

    expect(content).toMatchObject({
      answeredOn: "24 de agosto de 2026",
      documentTitle: "Caso María",
      question: "¿Qué requisito debo presentar?",
      teacherName: "María Pérez",
    });
    expect(describeOrientationSource(source)).toBe(
      "[1] Ley de Reforma Magisterial (vigente), versión 2, páginas 33–34, sección Licencias por salud, Artículo 5, numeral 5.1.",
    );
  });

  it("sanitizes filenames and emits ASCII plus RFC 5987 names without header injection", () => {
    const base = sanitizeFileBaseName(
      "  Caso / María\r\nContent-Type: text/html...  ",
    );
    const header = contentDisposition(`${base}.pdf`);

    expect(base).toBe("Caso María Content-Type text html");
    expect(header).toContain(
      'filename="Caso-Maria-Content-Type-text-html.pdf"',
    );
    expect(header).toContain(
      "filename*=UTF-8''Caso%20Mar%C3%ADa%20Content-Type%20text%20html.pdf",
    );
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("preserves an allowed extension when a title reaches the filename limit", () => {
    const base = sanitizeFileBaseName("Orientación extensa ".repeat(10));
    const header = contentDisposition(`${base}.docx`);

    expect(base).toHaveLength(80);
    expect(header).toMatch(/filename="[^"]+\.docx"/);
    expect(header).toMatch(/filename\*=UTF-8''[^;]+\.docx$/);
  });
});
