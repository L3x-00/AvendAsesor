import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_STARTERS,
  ChatWelcome,
  firstNameOf,
  GENERAL_WELCOME_MESSAGES,
} from "./chat-welcome";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ChatWelcome", () => {
  it("conserva los atajos y retira solo el icono decorativo del saludo", async () => {
    const user = userEvent.setup();
    const onSuggestion = vi.fn();
    const { container } = render(
      <ChatWelcome fullName="ana" onSuggestion={onSuggestion} />,
    );

    expect(screen.getByRole("heading", { name: "Hola, Ana. ¿En qué te ayudo hoy?" })).toBeVisible();
    expect(container.querySelector(".avend-chat-welcome-mark")).toBeNull();
    expect(
      screen.getByText(GENERAL_WELCOME_MESSAGES[0]),
    ).toHaveClass("avend-chat-welcome-message");
    expect(screen.getAllByRole("button")).toHaveLength(CHAT_STARTERS.length);

    await user.click(screen.getByRole("button", { name: "¿Qué pasa si…?" }));
    expect(onSuggestion).toHaveBeenCalledWith("¿Qué pasa si ");
  });

  it("sin nombre saluda de forma genérica", () => {
    render(<ChatWelcome onSuggestion={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "¿En qué te ayudo hoy?" })).toBeVisible();
    expect(firstNameOf("  ")).toBeNull();
  });

  it("rota los cuatro mensajes únicamente en la bienvenida general", () => {
    vi.useFakeTimers();
    render(<ChatWelcome onSuggestion={vi.fn()} />);

    expect(screen.getByRole("heading")).toHaveTextContent(
      GENERAL_WELCOME_MESSAGES[0],
    );
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole("heading")).toHaveTextContent(
      GENERAL_WELCOME_MESSAGES[1],
    );
    act(() => vi.advanceTimersByTime(9_000));
    expect(screen.getByRole("heading")).toHaveTextContent(
      GENERAL_WELCOME_MESSAGES[0],
    );
  });

  it("presenta una guía compacta del tema sin la bienvenida extensa", () => {
    render(
      <ChatWelcome
        onSuggestion={vi.fn()}
        topicName="Situaciones administrativas"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Consulta sobre Situaciones administrativas.",
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(/Escribe una consulta sobre procesos/u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Pausar mensajes de bienvenida|Reanudar mensajes de bienvenida/u,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(CHAT_STARTERS.length);
  });

  it("mantiene el primer mensaje si el usuario redujo el movimiento", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    render(<ChatWelcome onSuggestion={vi.fn()} />);

    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("heading")).toHaveTextContent(
      GENERAL_WELCOME_MESSAGES[0],
    );
  });
});
