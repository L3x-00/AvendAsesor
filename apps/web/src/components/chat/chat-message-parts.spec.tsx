import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyAnswerButton, plainAnswerText } from "./chat-message-parts";

describe("plainAnswerText", () => {
  it("copia lo que se lee: sin Markdown de negritas ni títulos", () => {
    expect(plainAnswerText("### Requisitos\nEl **plazo** es de 30 días [1].")).toBe(
      "Requisitos\nEl plazo es de 30 días.",
    );
  });

  it("quita las marcas de cita que fuera del chat no enlazan a nada", () => {
    expect(plainAnswerText("El plazo es de 30 días [1]. Aplica a docentes [1, 2].")).toBe(
      "El plazo es de 30 días. Aplica a docentes.",
    );
  });
});

describe("CopyAnswerButton", () => {
  afterEach(() => vi.useRealTimers());

  it("copia el texto limpio y confirma en el mismo botón", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CopyAnswerButton content="Respuesta [1]." />);

    await user.click(screen.getByRole("button", { name: "Copiar respuesta" }));

    expect(writeText).toHaveBeenCalledWith("Respuesta.");
    expect(screen.getByRole("button", { name: "Respuesta copiada" })).toBeVisible();
  });

  it("avisa si el navegador no permite copiar y vuelve a su estado", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    render(<CopyAnswerButton content="Respuesta" />);

    await user.click(screen.getByRole("button", { name: "Copiar respuesta" }));
    expect(screen.getByRole("button", { name: "No se pudo copiar" })).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole("button", { name: "Copiar respuesta" })).toBeVisible();
  });
});
