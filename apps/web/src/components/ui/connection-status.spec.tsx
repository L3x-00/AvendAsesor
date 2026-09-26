import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStatus, RESTORED_NOTICE_MS } from "./connection-status";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

describe("ConnectionStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  it("avisa al perder la red y confirma al volver, luego se retira", () => {
    vi.useFakeTimers();
    render(<ConnectionStatus />);
    expect(screen.queryByText("Sin conexión a internet")).toBeNull();

    act(() => setOnline(false));
    expect(screen.getByText("Sin conexión a internet")).toBeVisible();
    expect(screen.getByText(/No se pierde nada/)).toBeVisible();

    act(() => setOnline(true));
    expect(screen.queryByText("Sin conexión a internet")).toBeNull();
    expect(screen.getByText("Conexión restablecida")).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(RESTORED_NOTICE_MS);
    });
    expect(screen.queryByText("Conexión restablecida")).toBeNull();
  });

  it("si la página abre sin red, el aviso aparece de inmediato", () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    render(<ConnectionStatus />);

    expect(screen.getByText("Sin conexión a internet")).toBeVisible();
  });
});
