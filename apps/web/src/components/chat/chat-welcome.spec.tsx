import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CHAT_STARTERS, ChatWelcome, firstNameOf } from "./chat-welcome";

describe("ChatWelcome", () => {
  it("conserva los atajos y retira solo el icono decorativo del saludo", async () => {
    const user = userEvent.setup();
    const onSuggestion = vi.fn();
    const { container } = render(
      <ChatWelcome fullName="ana" onSuggestion={onSuggestion} />,
    );

    expect(screen.getByRole("heading", { name: "Hola, Ana. ¿En qué te ayudo hoy?" })).toBeVisible();
    expect(container.querySelector(".avend-chat-welcome-mark")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(CHAT_STARTERS.length);

    await user.click(screen.getByRole("button", { name: "¿Qué pasa si…?" }));
    expect(onSuggestion).toHaveBeenCalledWith("¿Qué pasa si ");
  });

  it("sin nombre saluda de forma genérica", () => {
    render(<ChatWelcome onSuggestion={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "¿En qué te ayudo hoy?" })).toBeVisible();
    expect(firstNameOf("  ")).toBeNull();
  });
});
