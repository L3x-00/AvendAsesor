import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ChatHistoryList,
  formatHistoryDate,
  historyGroupOf,
  readableConversationTitle,
} from "./chat-history-list";

const showToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast }),
}));

const { deleteConversationAction } = vi.hoisted(() => ({
  deleteConversationAction: vi.fn(async () => ({
    message: "La conversación fue retirada de tu historial.",
    status: "success" as const,
  })),
}));

vi.mock("@/app/(teacher)/history/actions", () => ({
  deleteConversationAction,
  initialHistoryActionState: { message: null, status: "idle" },
}));

const conversation = {
  createdAt: "2026-08-24T12:00:00.000Z",
  id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
  selectedModuleId: null,
  title: "Licencias por salud",
  updatedAt: "2026-08-24T12:10:00.000Z",
};

describe("ChatHistoryList", () => {
  it("communicates an explicit empty state instead of inventing history", () => {
    render(<ChatHistoryList conversations={[]} nextCursor={null} />);

    expect(
      screen.getByText(/Aún no tienes consultas guardadas/i),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Hacer una consulta" }),
    ).toHaveAttribute("href", "/chat");
  });

  it("renders only the owned conversation actions and receives deletion feedback", async () => {
    const user = userEvent.setup();
    render(
      <ChatHistoryList
        conversations={[conversation]}
        nextCursor="eyJpZCI6Im5leHQifQ"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Retomar consulta" }),
    ).toHaveAttribute("href", `/chat/${conversation.id}`);
    expect(
      screen.getByRole("link", { name: "Ver consultas anteriores" }),
    ).toHaveAttribute("href", "/history?cursor=eyJpZCI6Im5leHQifQ");
    await user.click(
      screen.getByRole("button", { name: "Quitar del historial" }),
    );
    // Primero pregunta: nada se quita con un solo toque.
    expect(deleteConversationAction).not.toHaveBeenCalled();
    // El foco va a la salida segura, no a la acción destructiva.
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Sí, quitar" }));

    expect(deleteConversationAction).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "La conversación fue retirada de tu historial.",
      ),
    );
  });

  it("cancelar la confirmación no quita nada y devuelve el foco", async () => {
    const user = userEvent.setup();
    deleteConversationAction.mockClear();
    render(<ChatHistoryList conversations={[conversation]} nextCursor={null} />);

    await user.click(screen.getByRole("button", { name: "Quitar del historial" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(deleteConversationAction).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Quitar del historial" }),
      ).toHaveFocus(),
    );
  });

  it("agrupa por fecha en hora de Perú", () => {
    vi.useFakeTimers({ now: new Date("2026-09-25T15:00:00.000Z") });
    try {
      render(
        <ChatHistoryList
          conversations={[
            { ...conversation, id: "a", title: "Hoy", updatedAt: "2026-09-25T14:00:00.000Z" },
            { ...conversation, id: "b", title: "Ayer", updatedAt: "2026-09-24T20:00:00.000Z" },
            { ...conversation, id: "c", title: "Antes", updatedAt: "2026-08-01T12:00:00.000Z" },
          ]}
          nextCursor={null}
        />,
      );

      const today = screen.getByRole("region", { name: "Hoy" });
      expect(within(today).getByText("Hoy, 9:00 a. m.")).toBeVisible();
      expect(screen.getByRole("region", { name: "Ayer" })).toBeVisible();
      expect(screen.getByRole("region", { name: "Anteriores" })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("historyGroupOf / formatHistoryDate", () => {
  const now = new Date("2026-09-25T04:30:00.000Z"); // 24/09 23:30 en Lima

  it("usa el día calendario de Lima, no el de UTC", () => {
    expect(historyGroupOf("2026-09-25T03:00:00.000Z", now)).toBe("today");
    expect(historyGroupOf("2026-09-23T20:00:00.000Z", now)).toBe("yesterday");
    expect(historyGroupOf("2026-09-20T12:00:00.000Z", now)).toBe("week");
    expect(historyGroupOf("2026-09-01T12:00:00.000Z", now)).toBe("earlier");
    expect(formatHistoryDate("2026-09-01T12:00:00.000Z", now)).toMatch(/2026/);
  });
});

describe("readableConversationTitle", () => {
  it("removes the leading greeting so the topic comes first", () => {
    expect(
      readableConversationTitle(
        "Hola, buenos días, quisiera saber cuánto tiempo tiene un director para responder.",
      ),
    ).toBe("Quisiera saber cuánto tiempo tiene un director para responder.");
  });

  it("keeps a title that is only a greeting and shortens long titles", () => {
    expect(readableConversationTitle("Hola")).toBe("Hola");
    expect(readableConversationTitle(null)).toBe("Consulta sin título");
    const long = readableConversationTitle(`Requisitos ${"x".repeat(200)}`);
    expect(long.length).toBeLessThanOrEqual(91);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("readableConversationTitle — revisión web", () => {
  it("keeps the opening question mark and capitalizes the first letter", () => {
    expect(readableConversationTitle("Hola, ¿cuánto dura la licencia?")).toBe(
      "¿Cuánto dura la licencia?",
    );
  });

  it("drops «¿qué tal?» and a bare «Buenas» before the question", () => {
    expect(
      readableConversationTitle(
        "Hola, ¿qué tal? Quería consultar sobre mi licencia",
      ),
    ).toBe("Quería consultar sobre mi licencia");
    expect(
      readableConversationTitle("Hola ¿qué tal? ¿cómo pido licencia?"),
    ).toBe("¿Cómo pido licencia?");
    expect(
      readableConversationTitle("Buenas ¿cómo solicito mi destaque?"),
    ).toBe("¿Cómo solicito mi destaque?");
  });

  it("does not cut words that only start like a greeting", () => {
    expect(
      readableConversationTitle("Buenas prácticas docentes: ¿cómo postulo?"),
    ).toBe("Buenas prácticas docentes: ¿cómo postulo?");
    expect(readableConversationTitle("Holanda y el intercambio docente")).toBe(
      "Holanda y el intercambio docente",
    );
  });
});
