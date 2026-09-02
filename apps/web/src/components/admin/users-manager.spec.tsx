import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdministrativeUser } from "@/lib/admin-api/types";
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
  {
    accountStatus: "active",
    fullName: "Ana Admin",
    id: "u3",
    lastAccessAt: "2026-08-02T10:00:00.000Z",
    role: "admin",
  },
];

describe("UsersManager", () => {
  it("shows the superadmin notice and the docentes group by default", () => {
    render(<UsersManager users={users} />);

    expect(
      screen.getByText(/Vista de superadministrador/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "María Docente" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Ana Admin" }),
    ).not.toBeInTheDocument();
    // Each visible user exposes an edit control.
    expect(screen.getAllByText("Editar acceso")).toHaveLength(2);
  });

  it("switches to the administrative team", async () => {
    const user = userEvent.setup();
    render(<UsersManager users={users} />);

    await user.click(screen.getByRole("button", { name: /Equipo administrador/ }));

    expect(screen.getByRole("heading", { name: "Ana Admin" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "María Docente" }),
    ).not.toBeInTheDocument();
  });

  it("filters by paused status within the current group", async () => {
    const user = userEvent.setup();
    render(<UsersManager users={users} />);

    await user.click(screen.getByRole("button", { name: /Pausados/ }));

    expect(screen.getByRole("heading", { name: "Pedro Pausado" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "María Docente" }),
    ).not.toBeInTheDocument();
  });

  it("filters by name query", async () => {
    const user = userEvent.setup();
    render(<UsersManager users={users} />);

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar usuario por nombre" }),
      "maría",
    );

    expect(screen.getByRole("heading", { name: "María Docente" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Pedro Pausado" }),
    ).not.toBeInTheDocument();
  });
});
