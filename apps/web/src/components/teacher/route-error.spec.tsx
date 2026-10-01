import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "next/dist/client/components/error-boundary";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteError } from "./route-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteError", () => {
  it("explica sin tecnicismos, tranquiliza y ofrece reintentar o ir al chat", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<RouteError retry={retry} />);

    expect(
      screen.getByRole("heading", { name: "No pudimos cargar esta sección" }),
    ).toHaveFocus();
    expect(
      screen.getByText(/Tus conversaciones y tu cuenta siguen guardadas/),
    ).toBeVisible();
    // No puede asegurar que «nada cambió»: tras un borrado sí cambió algo.
    expect(screen.queryByText(/no se (perdió|modificó)/i)).toBeNull();
    expect(screen.getByText(/verás si se aplicó/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ir al chat" })).toHaveAttribute(
      "href",
      "/chat",
    );

    await user.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("a página completa usa un texto neutro y el punto de referencia main", () => {
    render(<RouteError retry={vi.fn()} variant="page" />);

    expect(screen.getByRole("main")).toHaveClass("avend-route-error--page");
    expect(screen.queryByText(/Tus conversaciones/)).toBeNull();
    expect(screen.queryByText(/no se (perdió|modificó)/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("con el límite real de Next, «Intentar de nuevo» vuelve a pedir los datos al servidor", async () => {
    const user = userEvent.setup();
    let serverFails = true;
    const refresh = vi.fn(() => {
      // Lo que devolvería el servidor en la nueva petición.
      serverFails = false;
    });
    function Section() {
      if (serverFails) throw new Error("GET /chat/conversations 429");
      return <p>Historial de consultas</p>;
    }
    const router = { refresh } as unknown as AppRouterInstance;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppRouterContext.Provider value={router}>
        <ErrorBoundary
          errorComponent={({ retry }: { retry: () => void }) => (
            <RouteError retry={retry} />
          )}
        >
          <Section />
        </ErrorBoundary>
      </AppRouterContext.Provider>,
    );

    expect(
      screen.getByRole("heading", { name: "No pudimos cargar esta sección" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Intentar de nuevo" }));

    expect(refresh).toHaveBeenCalledOnce();
    expect(await screen.findByText("Historial de consultas")).toBeVisible();
  });
});
