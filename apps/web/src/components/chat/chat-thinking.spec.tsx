import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatThinking } from "./chat-thinking";

describe("ChatThinking", () => {
  afterEach(() => vi.useRealTimers());

  it("muestra de inmediato que el asistente trabaja y avanza por fases", () => {
    vi.useFakeTimers();
    render(<ChatThinking />);

    expect(screen.getByText("Leyendo tu consulta")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(screen.getByText("Buscando en los documentos")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4_500);
    });
    expect(screen.getByText("Preparando la respuesta")).toBeInTheDocument();
  });
});
