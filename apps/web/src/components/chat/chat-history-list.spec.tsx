import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteConversationResult } from "@/app/(teacher)/history/actions";
import {
  ChatHistoryList,
  formatHistoryDate,
  historyGroupOf,
  readableConversationTitle,
  REMOVAL_OUTDATED_MESSAGE,
  REMOVAL_UNCONFIRMED_MESSAGE,
  REMOVED_TITLE,
} from "./chat-history-list";

const { refresh, replace, outdatedErrors } = vi.hoisted(() => ({
  outdatedErrors: new WeakSet<object>(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (error: unknown) =>
    typeof error === "object" && error !== null && outdatedErrors.has(error),
  useRouter: () => ({ refresh, replace }),
}));

const { deleteConversationAction } = vi.hoisted(() => ({
  deleteConversationAction: vi.fn<
    (conversationId: unknown) => Promise<DeleteConversationResult>
  >(async () => ({ status: "removed" })),
}));

vi.mock("@/app/(teacher)/history/actions", () => ({
  deleteConversationAction,
}));

const conversation = {
  createdAt: "2026-08-24T12:00:00.000Z",
  id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
  selectedModuleId: null,
  title: "Licencias por salud",
  updatedAt: "2026-08-24T12:10:00.000Z",
};
const second = {
  ...conversation,
  id: "9d9d9d9d-9999-4999-8999-999999999999",
  title: "Permiso por capacitación",
};

/** Límite de error mínimo: si algo lo alcanza, la prueba lo ve. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p>No pudimos cargar esta sección</p>
    ) : (
      this.props.children
    );
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function confirmRemoval(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  const card = screen.getByRole("heading", { name: title }).closest("li");
  if (!card) throw new Error(`No se encontró la tarjeta «${title}».`);
  await user.click(
    within(card).getByRole("button", { name: "Quitar del historial" }),
  );
  await user.click(within(card).getByRole("button", { name: "Sí, quitar" }));
}

describe("ChatHistoryList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/history");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("communicates an explicit empty state instead of inventing history", () => {
    render(<ChatHistoryList conversations={[]} nextCursor={null} />);

    expect(
      screen.getByText(/Aún no tienes consultas guardadas/i),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Hacer una consulta" }),
    ).toHaveAttribute("href", "/chat");
  });

  it("señala las consultas que ya tienen información nueva", () => {
    const other = { ...conversation, id: "8c8b56af-6d0c-4fef-881e-7c00907540dd", title: "Otra" };
    const { rerender } = render(
      <ChatHistoryList
        conversations={[conversation, other]}
        nextCursor={null}
        updates={[
          { conversationId: conversation.id, resolvedAt: "2026-09-26T10:00:00.000Z" },
          { conversationId: "no-visible", resolvedAt: "2026-09-26T10:00:00.000Z" },
          // Volvió a preguntar después de resolverse: sin aviso.
          { conversationId: other.id, resolvedAt: "2026-08-01T10:00:00.000Z" },
        ]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Hay novedades. Se incorporó documentación sobre una consulta",
    );
    expect(screen.getAllByText("Nueva información disponible")).toHaveLength(1);

    rerender(
      <ChatHistoryList
        conversations={[conversation, other]}
        nextCursor={null}
        updates={[
          { conversationId: conversation.id, resolvedAt: "2026-09-26T10:00:00.000Z" },
          { conversationId: other.id, resolvedAt: "2026-09-26T10:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Se incorporó documentación sobre 2 consultas",
    );
  });

  it("pide confirmación antes de quitar y el foco va a la salida segura", async () => {
    const user = userEvent.setup();
    render(<ChatHistoryList conversations={[conversation]} nextCursor={null} />);

    expect(
      screen.getByRole("link", { name: "Retomar consulta" }),
    ).toHaveAttribute("href", `/chat/${conversation.id}`);
    await user.click(
      screen.getByRole("button", { name: "Quitar del historial" }),
    );
    // Nada se quita con un solo toque.
    expect(deleteConversationAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("quita la consulta al instante, muestra la ventana emergente y queda en /history", async () => {
    const user = userEvent.setup();
    const pending = deferred<DeleteConversationResult>();
    deleteConversationAction.mockReturnValueOnce(pending.promise);
    render(
      <Boundary>
        <h1 id="history-title" tabIndex={-1}>
          Historial de consultas
        </h1>
        <ChatHistoryList
          conversations={[conversation, second]}
          nextCursor={null}
        />
      </Boundary>,
    );

    await confirmRemoval(user, "Licencias por salud");

    // Retirada inmediata: sin esperar al servidor.
    expect(deleteConversationAction).toHaveBeenCalledWith(conversation.id);
    expect(
      screen.queryByRole("heading", { name: "Licencias por salud" }),
    ).toBeNull();
    // El foco no se pierde: pasa a la consulta vecina.
    expect(
      screen.getByRole("heading", { name: "Permiso por capacitación" })
        .closest("li"),
    ).toHaveFocus();

    pending.resolve({ status: "removed" });

    const dialog = await screen.findByRole("dialog", { name: REMOVED_TITLE });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "«Licencias por salud» ya no aparece en tu historial.",
    );
    expect(within(dialog).getByRole("button", { name: "Aceptar" })).toHaveFocus();
    // Una sola operación del router y nunca la pantalla de error.
    expect(refresh).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe("/history");
    expect(screen.queryByText("No pudimos cargar esta sección")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Aceptar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Licencias por salud" }),
    ).toBeNull();
  });

  it("desde «Ver consultas anteriores» vuelve a /history limpio, sin cursor", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/history?cursor=eyJpZCI6Im5leHQifQ");
    render(
      <ChatHistoryList
        conversations={[conversation]}
        nextCursor="eyJpZCI6Im90cm8ifQ"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Ver consultas anteriores" }),
    ).toHaveAttribute("href", "/history?cursor=eyJpZCI6Im90cm8ifQ");

    await confirmRemoval(user, "Licencias por salud");

    const dialog = await screen.findByRole("dialog", { name: REMOVED_TITLE });
    expect(dialog).toHaveAccessibleDescription(/Te mostramos el inicio de tu historial/);
    expect(replace).toHaveBeenCalledExactlyOnceWith("/history");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("si ya se había quitado en otro dispositivo, lo trata como hecho y no pide recargar", async () => {
    const user = userEvent.setup();
    deleteConversationAction.mockResolvedValueOnce({ status: "already-removed" });
    render(<ChatHistoryList conversations={[conversation]} nextCursor={null} />);

    await confirmRemoval(user, "Licencias por salud");

    const dialog = await screen.findByRole("dialog", { name: REMOVED_TITLE });
    expect(dialog).toHaveAccessibleDescription(/ya se había quitado antes/);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("si el borrado falla, la consulta vuelve con el motivo y se reconcilia con el servidor", async () => {
    const user = userEvent.setup();
    deleteConversationAction.mockResolvedValueOnce({
      message: "No tienes permiso para quitar esta consulta.",
      status: "error",
    });
    render(<ChatHistoryList conversations={[conversation]} nextCursor={null} />);

    await confirmRemoval(user, "Licencias por salud");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tienes permiso para quitar esta consulta.",
    );
    expect(
      screen.getByRole("heading", { name: "Licencias por salud" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it("un fallo de red al llamar la acción no llega al límite de error", async () => {
    const user = userEvent.setup();
    deleteConversationAction.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    render(
      <Boundary>
        <ChatHistoryList conversations={[conversation]} nextCursor={null} />
      </Boundary>,
    );

    await confirmRemoval(user, "Licencias por salud");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      REMOVAL_UNCONFIRMED_MESSAGE,
    );
    expect(screen.queryByText("No pudimos cargar esta sección")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Licencias por salud" }),
    ).toBeVisible();
    // Si el borrado sí llegó a aplicarse, la recarga lo retira.
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("si la plataforma se actualizó, pide recargar la página en lugar de reintentar a ciegas", async () => {
    const user = userEvent.setup();
    const outdated = new Error("Server Action not found");
    outdatedErrors.add(outdated);
    deleteConversationAction.mockRejectedValueOnce(outdated);
    render(
      <Boundary>
        <ChatHistoryList conversations={[conversation]} nextCursor={null} />
      </Boundary>,
    );

    await confirmRemoval(user, "Licencias por salud");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      REMOVAL_OUTDATED_MESSAGE,
    );
    expect(
      screen.getByRole("button", { name: "Recargar la página" }),
    ).toBeVisible();
    expect(screen.queryByText("No pudimos cargar esta sección")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("si la persona ya salió de Historial, la respuesta no la devuelve ni abre avisos", async () => {
    const user = userEvent.setup();
    const pending = deferred<DeleteConversationResult>();
    deleteConversationAction.mockReturnValueOnce(pending.promise);
    render(<ChatHistoryList conversations={[conversation]} nextCursor={null} />);

    await confirmRemoval(user, "Licencias por salud");
    window.history.pushState(null, "", "/chat");
    pending.resolve({ status: "removed" });
    await pending.promise;
    await Promise.resolve();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("cancelar la confirmación no quita nada y devuelve el foco", async () => {
    const user = userEvent.setup();
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

  it("si la lista no se pudo pedir, muestra un aviso en línea con «Actualizar»", async () => {
    const user = userEvent.setup();
    render(
      <ChatHistoryList conversations={[]} loadFailed nextCursor={null} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "No pudimos mostrar tu historial en este momento",
    );
    // No es el estado vacío: la persona no debe creer que perdió su historial.
    expect(screen.queryByText(/Aún no tienes consultas guardadas/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("si una recarga posterior falla, conserva la lista que ya mostraba", () => {
    const { rerender } = render(
      <ChatHistoryList
        conversations={[conversation, second]}
        nextCursor={null}
      />,
    );

    rerender(
      <ChatHistoryList conversations={[]} loadFailed nextCursor={null} />,
    );

    expect(
      screen.getByRole("heading", { name: "Licencias por salud" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Lo que ves puede no estar al día",
    );
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeVisible();
  });

  it("agrupa por módulo y submódulo, y deja los chats libres en Consultas generales", () => {
    render(
      <ChatHistoryList
        conversations={[
          {
            ...conversation,
            id: "a1a1a1a1-1111-4111-8111-111111111111",
            lastQuestion: "¿Cuánto dura la licencia?",
            selectedModuleId: "11111111-1111-4111-8111-111111111111",
            selectedModuleName: "Licencias",
            selectedModuleParentId: null,
            selectedModuleParentName: null,
          },
          {
            ...conversation,
            id: "b2b2b2b2-2222-4222-8222-222222222222",
            lastQuestion: "¿Y el plazo de la escala?",
            selectedModuleId: "22222222-2222-4222-8222-222222222222",
            selectedModuleName: "Escala",
            selectedModuleParentId: "33333333-3333-4333-8333-333333333333",
            selectedModuleParentName: "Remuneraciones",
            title: "Primera pregunta del tema",
          },
          {
            ...conversation,
            id: "c3c3c3c3-3333-4333-8333-333333333333",
            lastQuestion: null,
            selectedModuleId: null,
            title: "Consulta libre",
          },
        ]}
        nextCursor={null}
      />,
    );

    expect(screen.getByRole("region", { name: "Licencias" })).toBeVisible();
    const remuneraciones = screen.getByRole("region", {
      name: "Remuneraciones",
    });
    expect(within(remuneraciones).getByText("Submódulo: Escala")).toBeVisible();
    // La última pregunta manda sobre el título de la conversación.
    expect(
      within(remuneraciones).getByText("¿Y el plazo de la escala?"),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Consultas generales" }),
    ).toBeVisible();
  });

  it("la fecha por consulta se sigue mostrando en hora de Perú", () => {
    vi.useFakeTimers({ now: new Date("2026-09-25T15:00:00.000Z") });
    try {
      render(
        <ChatHistoryList
          conversations={[
            {
              ...conversation,
              updatedAt: "2026-09-25T14:00:00.000Z",
            },
          ]}
          nextCursor={null}
        />,
      );

      expect(screen.getByText("Hoy, 9:00 a. m.")).toBeVisible();
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
