import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatWelcome, firstNameOf } from "./chat-welcome";

describe("ChatWelcome", () => {
  it("saluda de forma compacta sin atajos que ocupen espacio", () => {
    render(<ChatWelcome fullName="ana" />);

    expect(screen.getByRole("heading", { name: "Hola, Ana. ¿En qué te ayudo hoy?" })).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Empieza con una de estas frases/u)).not.toBeInTheDocument();
  });

  it("sin nombre saluda de forma genérica", () => {
    render(<ChatWelcome />);

    expect(screen.getByRole("heading", { name: "¿En qué te ayudo hoy?" })).toBeVisible();
    expect(firstNameOf("  ")).toBeNull();
  });
});
