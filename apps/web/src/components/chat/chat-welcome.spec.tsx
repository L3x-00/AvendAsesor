import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CHAT_STARTERS, ChatWelcome, firstNameOf } from "./chat-welcome";

describe("ChatWelcome", () => {
  it("ofrece inicios de consulta, no temas concretos que el corpus quizá no tenga", async () => {
    const user = userEvent.setup();
    const onSuggestion = vi.fn();
    render(<ChatWelcome fullName="ana" onSuggestion={onSuggestion} />);

    expect(screen.getByRole("heading", { name: "Hola, Ana. ¿En qué te ayudo hoy?" })).toBeVisible();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(CHAT_STARTERS.length);
    for (const button of buttons) {
      expect(button.textContent).toMatch(/…\?$/u);
    }

    await user.click(screen.getByRole("button", { name: "¿Qué pasa si…?" }));
    expect(onSuggestion).toHaveBeenCalledWith("¿Qué pasa si ");
  });

  it("sin nombre saluda de forma genérica", () => {
    render(<ChatWelcome onSuggestion={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "¿En qué te ayudo hoy?" })).toBeVisible();
    expect(firstNameOf("  ")).toBeNull();
  });
});
