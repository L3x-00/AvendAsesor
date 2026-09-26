import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "./route-error";

describe("RouteError", () => {
  it("explica sin tecnicismos, tranquiliza y ofrece reintentar o ir al chat", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<RouteError retry={retry} />);

    expect(
      screen.getByRole("heading", { name: "No pudimos cargar esta sección" }),
    ).toHaveFocus();
    expect(screen.getByText(/Tus conversaciones y tu cuenta están a salvo/)).toBeVisible();
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
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
