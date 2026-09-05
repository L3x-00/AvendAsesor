import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AdministrativeUser,
  AdministrativeUserCounts,
  AdministrativeUserPage,
} from "@/lib/admin-api/types";
import type { ParsedUserDirectoryQuery } from "@/lib/admin-api/user-directory";
import { UsersManager } from "./users-manager";

vi.mock("@/app/admin/actions", () => ({
  updateAccessWindowAction: vi.fn(async () => ({ status: "idle" })),
  updateAdministrativeUserAction: vi.fn(async () => ({ status: "idle" })),
}));

const users: AdministrativeUser[] = [
  {
    accessExpiresAt: null,
    accessStartAt: "2026-01-01T05:00:00.000Z",
    accessState: "activo",
    accountStatus: "active",
    fullName: "María Docente",
    id: "u1",
    lastAccessAt: "2026-08-01T10:00:00.000Z",
    role: "docente",
  },
  {
    accessExpiresAt: "2026-09-10T04:59:59.999Z",
    accessStartAt: null,
    accessState: "por_vencer",
    accountStatus: "active",
    fullName: "Ana PorVencer",
    id: "u2",
    lastAccessAt: null,
    role: "docente",
  },
  {
    accessExpiresAt: "2026-08-01T04:59:59.999Z",
    accessStartAt: null,
    accessState: "expirado",
    accountStatus: "active",
    fullName: "Luis Expirado",
    id: "u3",
    lastAccessAt: null,
    role: "docente",
  },
  {
    accessExpiresAt: null,
    accessStartAt: null,
    accessState: "pausado",
    accountStatus: "suspended",
    fullName: "Pedro Pausado",
    id: "u4",
    lastAccessAt: null,
    role: "docente",
  },
];

const counts: AdministrativeUserCounts = {
  active: 12,
  expired: 2,
  expiringSoon: 3,
  suspended: 1,
  total: 15,
};

const page: AdministrativeUserPage = {
  items: users,
  limit: 4,
  offset: 0,
  total: 15,
};

const query: ParsedUserDirectoryQuery = {
  group: "docente",
  page: 1,
  status: "all",
};

const TODAY = "2026-09-05";

/** The row of a given user, so a badge is asserted on its own row. */
function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByRole("heading", { name }));
  if (!row) throw new Error('No row for ' + name);
  return row;
}

describe("UsersManager", () => {
  it("shows the protected directory page and exact result range", () => {
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    expect(
      screen.getByText(/Vista de superadministrador/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "María Docente" }),
    ).toBeVisible();
    expect(screen.getByText("Mostrando 1–4 de 15 usuarios.")).toBeVisible();
    expect(screen.getAllByText("Editar acceso")).toHaveLength(4);
    expect(screen.getAllByText("Extender vigencia")).toHaveLength(4);
  });

  it("labels every derived access state as text, not colour alone", () => {
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    // selector: "span" separa la insignia de las <option> del formulario.
    const badge = (name: string, label: string) =>
      within(rowFor(name)).getByText(label, { selector: "span" });

    expect(badge("María Docente", "Activo")).toBeVisible();
    expect(badge("Ana PorVencer", "Por vencer")).toBeVisible();
    expect(badge("Luis Expirado", "Expirado")).toBeVisible();
    expect(badge("Pedro Pausado", "Pausado")).toBeVisible();
  });

  it("shows the access window of each user with explicit empty wording", () => {
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    expect(screen.getAllByText(/Sin vencimiento/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sin definir/).length).toBeGreaterThan(0);
  });

  it("shows the real bucket counts next to each state filter", () => {
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    expect(screen.getByRole("link", { name: /Todos/ })).toHaveTextContent("15");
    expect(screen.getByRole("link", { name: /Activos/ })).toHaveTextContent(
      "12",
    );
    expect(screen.getByRole("link", { name: /Por vencer/ })).toHaveTextContent(
      "3",
    );
    expect(screen.getByRole("link", { name: /Expirados/ })).toHaveTextContent(
      "2",
    );
    expect(screen.getByRole("link", { name: /Pausados/ })).toHaveTextContent(
      "1",
    );
  });

  it("moves group, state and pagination filters through stable URLs", () => {
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    expect(
      screen.getByRole("link", { name: "Equipo administrador" }),
    ).toHaveAttribute("href", "/admin/users?group=staff");
    expect(screen.getByRole("link", { name: /Pausados/ })).toHaveAttribute(
      "href",
      "/admin/users?status=pausado",
    );
    expect(screen.getByRole("link", { name: /Por vencer/ })).toHaveAttribute(
      "href",
      "/admin/users?status=por_vencer",
    );
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
      "href",
      "/admin/users?page=2",
    );
  });

  it("prefills the access window as the calendar day seen in Lima", () => {
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    const starts = screen.getAllByLabelText("Inicio");
    const expiries = screen.getAllByLabelText("Fin");

    expect(starts[0]).toHaveValue("2026-01-01");
    expect(expiries[0]).toHaveValue("");
    expect(expiries[1]).toHaveValue("2026-09-09");
  });

  it("binds the vigencia fields to the names the server action reads", () => {
    // A renamed field would silently clear the access window instead of
    // extending it, so the contract is asserted here and not just visually.
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    const start = screen.getAllByLabelText("Inicio")[0];
    const expiry = screen.getAllByLabelText("Fin")[0];

    expect(start).toHaveAttribute("name", "accessStartAt");
    expect(expiry).toHaveAttribute("name", "accessExpiresAt");
    expect(start).toHaveAttribute("type", "date");
    expect(expiry).toHaveAttribute("type", "date");
  });

  it("stops an expired user from being sent a past expiry", () => {
    render(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    const expired = rowFor("Luis Expirado");
    const expiry = within(expired).getByLabelText("Fin");

    // Prefilled with the past date it already had, so the minimum is what
    // keeps the main flow of the "Expirados" filter actionable.
    expect(expiry).toHaveValue("2026-07-31");
    expect(expiry).toHaveAttribute("min", TODAY);
  });

  it("submits server-side search while preserving active filters", () => {
    render(
      <UsersManager
        counts={counts}
        today={TODAY}
        page={{ ...page, items: [], offset: 25, total: 0 }}
        query={{
          group: "staff",
          page: 2,
          search: "Ana",
          status: "activo",
        }}
      />,
    );

    const search = screen.getByRole("searchbox", { name: "Buscar usuario" });
    expect(search).toHaveAttribute("name", "search");
    expect(search).toHaveAttribute("maxlength", "160");
    expect(search).toHaveValue("Ana");
    expect(screen.getByDisplayValue("staff")).toHaveAttribute("name", "group");
    expect(screen.getByDisplayValue("activo")).toHaveAttribute(
      "name",
      "status",
    );
    expect(screen.getByRole("link", { name: "Limpiar" })).toHaveAttribute(
      "href",
      "/admin/users?group=staff&status=activo",
    );
  });

  it("clears the uncontrolled search field after URL navigation", () => {
    const { rerender } = render(
      <UsersManager
        counts={counts}
        page={page}
        query={{ ...query, search: "María" }}
        today={TODAY}
      />,
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("María");

    rerender(<UsersManager counts={counts} page={page} query={query} today={TODAY} />);

    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("");
  });

  it("discards an unsubmitted search draft when another filter navigates", () => {
    const initialQuery = { ...query, search: "María" };
    const { rerender } = render(
      <UsersManager counts={counts} page={page} query={initialQuery} today={TODAY} />,
    );
    const search = screen.getByRole("searchbox", { name: "Buscar usuario" });
    fireEvent.change(search, { target: { value: "Borrador sin enviar" } });
    expect(search).toHaveValue("Borrador sin enviar");

    rerender(
      <UsersManager
        counts={counts}
        page={page}
        query={{ ...initialQuery, status: "activo" }}
        today={TODAY}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("María");
  });
});
