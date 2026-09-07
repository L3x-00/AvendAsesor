import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherShell } from "./teacher-shell";

const usePathname = vi.fn<() => string | null>();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

const modules = [
  {
    code: "LICENCIAS",
    id: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
    name: "Licencias",
    parentModuleId: null,
    sortOrder: 0,
  },
];

/**
 * El marco lo aporta el layout compartido de `(teacher)`, que no sabe cuál de
 * sus hijos se está mostrando. Si esta deducción se rompe, la barra lateral
 * deja de señalar dónde está el usuario sin que falle nada más.
 */
describe("TeacherShell active section derived from the route", () => {
  beforeEach(() => {
    usePathname.mockReset();
  });

  it.each([
    ["/guide", "Guía de uso"],
    ["/history", "Historial"],
    ["/profile", "Mi perfil"],
  ])("marks %s as the current page", (pathname, linkName) => {
    usePathname.mockReturnValue(pathname);

    render(
      <TeacherShell modules={modules}>
        <h1>Contenido</h1>
      </TeacherShell>,
    );

    const [link] = screen.getAllByRole("link", { name: linkName });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("falls back to the chat entry outside the named sections", () => {
    usePathname.mockReturnValue("/chat");

    render(
      <TeacherShell modules={modules}>
        <h1>Contenido</h1>
      </TeacherShell>,
    );

    const [newChat] = screen.getAllByRole("link", { name: "Nuevo chat" });
    expect(newChat).toHaveAttribute("aria-current", "page");
  });

  it("still honours an explicit section, which is how the chat renders itself", () => {
    usePathname.mockReturnValue("/history");

    render(
      <TeacherShell activeSection="chat" modules={modules}>
        <h1>Contenido</h1>
      </TeacherShell>,
    );

    const [history] = screen.getAllByRole("link", { name: "Historial" });
    expect(history).not.toHaveAttribute("aria-current");
  });
});
