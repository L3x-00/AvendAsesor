import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoicePill } from "./voice-pill";

describe("VoicePill", () => {
  let frames: FrameRequestCallback[] = [];
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
    rect: vi.fn(),
    roundRect: vi.fn(),
  };

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
      { height: 20, width: 80 } as DOMRect,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Avanza la animación varios cuadros, simulando el paso del tiempo. */
  function runFrames(count: number, startAt: number) {
    for (let i = 0; i < count; i += 1) {
      const next = frames.shift();
      act(() => next?.(startAt + i * 16));
    }
  }

  it("es un botón de alternar con nombre fijo que invoca onToggle", () => {
    const onToggle = vi.fn();
    render(
      <VoicePill ariaLabel="Dictar la consulta por voz" listening={false} onToggle={onToggle} />,
    );

    const button = screen.getByRole("button", { name: "Dictar la consulta por voz" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
    // Escape solo detiene mientras escucha.
    fireEvent.keyDown(button, { key: "Escape" });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("al escuchar anima la onda y el cronómetro, y Escape la detiene", () => {
    const onToggle = vi.fn();
    const { container, rerender } = render(
      <VoicePill ariaLabel="Dictar" listening onToggle={onToggle} soundActive />,
    );

    const button = screen.getByRole("button", { name: "Dictar" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-state", "listening");

    const startedAt = performance.now();
    runFrames(12, startedAt);
    rerender(<VoicePill ariaLabel="Dictar" listening onToggle={onToggle} />);
    runFrames(8, startedAt + 1_200);

    expect(context.clearRect).toHaveBeenCalled();
    expect(context.roundRect).toHaveBeenCalled();
    expect(container.querySelector(".voice-pill__time")?.textContent).toMatch(/^0:0\d$/);

    fireEvent.keyDown(button, { key: "Escape" });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("dibuja con rectángulos si el navegador no tiene roundRect", () => {
    const withoutRound = { ...context, roundRect: undefined };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      withoutRound as unknown as CanvasRenderingContext2D,
    );
    render(<VoicePill ariaLabel="Dictar" listening onToggle={vi.fn()} soundActive />);

    runFrames(8, performance.now());

    expect(context.rect).toHaveBeenCalled();
  });
});
