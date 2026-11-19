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

  it("presenta el tema con sus preguntas recomendadas", () => {
    render(
      <ChatWelcome
        fullName="Ana"
        onSuggestion={vi.fn()}
        topicCode="SITUACIONES_ADMINISTRATIVAS"
        topicName="Situaciones administrativas"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Hola, Ana. Soy tu asesor para resolver dudas sobre Situaciones administrativas.",
      }),
    ).toBeVisible();
    expect(screen.getByText("Preguntas que puedes realizar:")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "¿Qué licencias puedo solicitar como docente?",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(
      screen.queryByText(/Empieza con una de estas frases/u),
    ).not.toBeInTheDocument();
  });

  it("cambia las preguntas según el tema y usa su nombre cuando no lo conoce", () => {
    const { rerender } = render(
      <ChatWelcome
        onSuggestion={vi.fn()}
        topicCode="REMUNERACIONES"
        topicName="Remuneraciones"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Soy tu asesor para resolver dudas sobre Remuneraciones.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "¿Qué asignaciones y bonificaciones me corresponden?",
      }),
    ).toBeVisible();

    rerender(
      <ChatWelcome onSuggestion={vi.fn()} topicName="Tema nuevo sin documentos" />,
    );
    expect(
      screen.getByRole("button", {
        name: "¿Qué requisitos necesito para un trámite de Tema nuevo sin documentos?",
      }),
    ).toBeVisible();
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
