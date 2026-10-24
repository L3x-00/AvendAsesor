import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModuleOverviewCard } from "./module-overview";

const moduleId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModuleOverviewCard", () => {
  it("prepara el contexto del tema sin mostrar resúmenes ni documentos", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ModuleOverviewCard moduleId={moduleId} />);

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/chat/modules/${moduleId}/overview`,
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("cancela la preparación cuando cambia o abandona el tema", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<ModuleOverviewCard moduleId={moduleId} />);

    unmount();
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it("no ocupa espacio si la preparación interna falla", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const { container } = render(<ModuleOverviewCard moduleId={moduleId} />);

    expect(container).toBeEmptyDOMElement();
  });
});
