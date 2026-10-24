import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { renderAeroShards } = vi.hoisted(() => ({
  renderAeroShards: vi.fn((props: unknown) => {
    void props;
    return null;
  }),
}));

vi.mock("@/components/AeroShards", () => ({
  default: (props: unknown) => {
    renderAeroShards(props);
    return <div data-testid="aero-shards-engine" />;
  },
}));

import { ChatAeroShardsBackground } from "./chat-aero-shards-background";

afterEach(() => {
  renderAeroShards.mockClear();
  vi.unstubAllGlobals();
});

describe("ChatAeroShardsBackground", () => {
  it("se omite de forma silenciosa cuando el navegador no ofrece WebGPU", () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      })),
    );

    render(<ChatAeroShardsBackground />);

    expect(screen.queryByTestId("aero-shards-engine")).not.toBeInTheDocument();
  });

  it("usa una configuración decorativa ligera sin capturar las acciones del chat", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("GPUCanvasContext", class GPUCanvasContext {});
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      })),
    );

    render(<ChatAeroShardsBackground />);

    expect(await screen.findByTestId("aero-shards-engine")).toBeInTheDocument();
    expect(renderAeroShards).toHaveBeenLastCalledWith(
      expect.objectContaining({
        count: 360,
        dpr: 1,
        holdToGather: false,
        markers: "none",
        mouseInteraction: false,
        placement: "full",
        powerPreference: "low-power",
        pulseOnClick: false,
      }),
    );
  });

  it("respeta la preferencia de reducir movimiento aunque WebGPU esté disponible", () => {
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("GPUCanvasContext", class GPUCanvasContext {});
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      })),
    );

    render(<ChatAeroShardsBackground />);

    expect(screen.queryByTestId("aero-shards-engine")).not.toBeInTheDocument();
  });

  it("retira el fondo si el motor gráfico informa un error", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("GPUCanvasContext", class GPUCanvasContext {});
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      })),
    );

    render(<ChatAeroShardsBackground />);
    await screen.findByTestId("aero-shards-engine");
    const props = renderAeroShards.mock.calls.at(-1)?.[0] as {
      onError?: (error: Error) => void;
    };

    act(() => props.onError?.(new Error("WebGPU no disponible")));

    expect(screen.queryByTestId("aero-shards-engine")).not.toBeInTheDocument();
  });
});
