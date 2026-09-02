import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AdministrativeUser,
  AdministrativeUserPage,
} from "@/lib/admin-api/types";
import type { ParsedUserDirectoryQuery } from "@/lib/admin-api/user-directory";
import { UsersManager } from "./users-manager";

vi.mock("@/app/admin/actions", () => ({
  updateAdministrativeUserAction: vi.fn(async () => ({ status: "idle" })),
}));

const users: AdministrativeUser[] = [
  {
    accountStatus: "active",
    fullName: "María Docente",
    id: "u1",
    lastAccessAt: "2026-08-01T10:00:00.000Z",
    role: "docente",
  },
  {
    accountStatus: "suspended",
    fullName: "Pedro Pausado",
    id: "u2",
    lastAccessAt: null,
    role: "docente",
  },
];

const page: AdministrativeUserPage = {
  items: users,
  limit: 2,
  offset: 0,
  total: 5,
};

const query: ParsedUserDirectoryQuery = {
  group: "docente",
  page: 1,
  status: "all",
};

describe("UsersManager", () => {
  it("shows the protected directory page and exact result range", () => {
    render(<UsersManager page={page} query={query} />);

    expect(
      screen.getByText(/Vista de superadministrador/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "María Docente" }),
    ).toBeVisible();
    expect(screen.getByText("Mostrando 1–2 de 5 usuarios.")).toBeVisible();
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pausado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Editar acceso")).toHaveLength(2);
  });

  it("moves group, status and pagination filters through stable URLs", () => {
    render(<UsersManager page={page} query={query} />);

    expect(
      screen.getByRole("link", { name: "Equipo administrador" }),
    ).toHaveAttribute("href", "/admin/users?group=staff");
    expect(screen.getByRole("link", { name: "Pausados" })).toHaveAttribute(
      "href",
      "/admin/users?status=suspended",
    );
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
      "href",
      "/admin/users?page=2",
    );
  });

  it("submits server-side search while preserving active filters", () => {
    render(
      <UsersManager
        page={{ ...page, items: [], offset: 25, total: 0 }}
        query={{
          group: "staff",
          page: 2,
          search: "Ana",
          status: "active",
        }}
      />,
    );

    const search = screen.getByRole("searchbox", { name: "Buscar usuario" });
    expect(search).toHaveAttribute("name", "search");
    expect(search).toHaveAttribute("maxlength", "160");
    expect(search).toHaveValue("Ana");
    expect(screen.getByDisplayValue("staff")).toHaveAttribute("name", "group");
    expect(screen.getByDisplayValue("active")).toHaveAttribute(
      "name",
      "status",
    );
    expect(screen.getByRole("link", { name: "Limpiar" })).toHaveAttribute(
      "href",
      "/admin/users?group=staff&status=active",
    );
  });

  it("clears the uncontrolled search field after URL navigation", () => {
    const { rerender } = render(
      <UsersManager page={page} query={{ ...query, search: "María" }} />,
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("María");

    rerender(<UsersManager page={page} query={query} />);

    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("");
  });

  it("discards an unsubmitted search draft when another filter navigates", () => {
    const initialQuery = { ...query, search: "María" };
    const { rerender } = render(
      <UsersManager page={page} query={initialQuery} />,
    );
    const search = screen.getByRole("searchbox", { name: "Buscar usuario" });
    fireEvent.change(search, { target: { value: "Borrador sin enviar" } });
    expect(search).toHaveValue("Borrador sin enviar");

    rerender(
      <UsersManager
        page={page}
        query={{ ...initialQuery, status: "active" }}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("María");
  });
});
