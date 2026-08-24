import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatHistoryList } from "./chat-history-list";

const { deleteConversationAction } = vi.hoisted(() => ({
  deleteConversationAction: vi.fn(async () => ({
    message: "La conversación fue retirada de tu historial.",
    status: "success" as const,
  })),
}));

vi.mock("@/app/history/actions", () => ({
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

    expect(deleteConversationAction).toHaveBeenCalled();
    expect(
      await screen.findByText(/fue retirada de tu historial/i),
    ).toBeVisible();
  });
});
