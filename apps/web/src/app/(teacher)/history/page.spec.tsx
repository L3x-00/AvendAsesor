import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAuthorizedChatContext } from "@/lib/chat-api/authorized-client";
import { ChatApiError } from "@/lib/chat-api/client";
import HistoryPage from "./page";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/chat-api/authorized-client", () => ({
  resolveAuthorizedChatContext: vi.fn(),
}));
vi.mock("./actions", () => ({ deleteConversationAction: vi.fn() }));

const listConversations = vi.fn();
const listUpdates = vi.fn();

async function renderPage(searchParams: { cursor?: string } = {}) {
  render(await HistoryPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listUpdates.mockResolvedValue([]);
    vi.mocked(resolveAuthorizedChatContext).mockResolvedValue({
      client: { listConversations, listUpdates },
    } as never);
  });

  it("pide la página indicada por el cursor y muestra las consultas", async () => {
    listConversations.mockResolvedValue({
      items: [
        {
          createdAt: "2026-08-24T12:00:00.000Z",
          id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
          selectedModuleId: null,
          title: "Licencias por salud",
          updatedAt: "2026-08-24T12:10:00.000Z",
        },
      ],
      nextCursor: null,
    });

    await renderPage({ cursor: "abc" });

    expect(listConversations).toHaveBeenCalledWith({ cursor: "abc" });
    expect(
      screen.getByRole("heading", { name: "Licencias por salud" }),
    ).toBeVisible();
    // Destino de foco al quitar la última consulta o al cerrar el aviso.
    expect(
      screen.getByRole("heading", { level: 1, name: "Historial de consultas" }),
    ).toHaveAttribute("tabindex", "-1");
  });

  it("una falla momentánea del API (p. ej. 429 tras un borrado) no lanza al límite de error", async () => {
    listConversations.mockRejectedValue(new ChatApiError(429));

    await renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "No pudimos mostrar tu historial en este momento",
    );
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeVisible();
    expect(screen.queryByText(/Aún no tienes consultas guardadas/)).toBeNull();
  });

  it("una sesión caducada sigue redirigiendo al inicio de sesión", async () => {
    listConversations.mockImplementation(() => redirect("/login"));

    await expect(HistoryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});
