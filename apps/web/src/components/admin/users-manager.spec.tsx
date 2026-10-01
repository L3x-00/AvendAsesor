import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdministrativeUserAction } from "@/app/admin/actions";
import type { AdminActionState } from "@/lib/admin-api/action-state";
import type {
  AdministrativeUser,
  AdministrativeUserCounts,
  AdministrativeUserPage,
} from "@/lib/admin-api/types";
import type { ParsedUserDirectoryQuery } from "@/lib/admin-api/user-directory";
import { UsersManager } from "./users-manager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/admin/actions", () => ({
  createAdministrativeUserAction: vi.fn(async () => ({ status: "idle" })),
  sendPasswordResetAction: vi.fn(async () => ({ status: "idle" })),
  updateAccessWindowAction: vi.fn(async () => ({ status: "idle" })),
  updateAdministrativeUserAction: vi.fn(async () => ({ status: "idle" })),
}));

const users: AdministrativeUser[] = [
  {
    accessExpiresAt: null,
    accessStartAt: "2026-01-01T05:00:00.000Z",
    accessState: "activo",
    accountStatus: "active",
    createdByName: null,
    email: "maria@example.test",
    phone: "987654321",
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
    createdByName: "Superadministrador Demo",
    email: "ana@example.test",
    phone: null,
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
    createdByName: null,
    email: null,
    phone: null,
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
    createdByName: null,
    email: "pedro@example.test",
    phone: "912345678",
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
const API = "http://localhost:3001";

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
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

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
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    // selector: "span" separa la insignia de las <option> del formulario.
    const badge = (name: string, label: string) =>
      within(rowFor(name)).getByText(label, { selector: "span" });

    expect(badge("María Docente", "Activo")).toBeVisible();
    expect(badge("Ana PorVencer", "Por vencer")).toBeVisible();
    expect(badge("Luis Expirado", "Expirado")).toBeVisible();
    expect(badge("Pedro Pausado", "Pausado")).toBeVisible();
  });

  it("shows the access window of each user with explicit empty wording", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    expect(screen.getAllByText(/Sin vencimiento/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sin definir/).length).toBeGreaterThan(0);
  });

  it("shows the real bucket counts next to each state filter", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

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
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

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
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    const starts = screen.getAllByLabelText("Inicio");
    const expiries = screen.getAllByLabelText("Fin");

    expect(starts[0]).toHaveValue("2026-01-01");
    expect(expiries[0]).toHaveValue("");
    expect(expiries[1]).toHaveValue("2026-09-09");
  });

  it("binds the vigencia fields to the names the server action reads", () => {
    // A renamed field would silently clear the access window instead of
    // extending it, so the contract is asserted here and not just visually.
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    const start = screen.getAllByLabelText("Inicio")[0];
    const expiry = screen.getAllByLabelText("Fin")[0];

    expect(start).toHaveAttribute("name", "accessStartAt");
    expect(expiry).toHaveAttribute("name", "accessExpiresAt");
    expect(start).toHaveAttribute("type", "date");
    expect(expiry).toHaveAttribute("type", "date");
  });

  it("stops an expired user from being sent a past expiry", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    const expired = rowFor("Luis Expirado");
    const expiry = within(expired).getByLabelText("Fin");

    // Prefilled with the past date it already had, so the minimum is what
    // keeps the main flow of the "Expirados" filter actionable.
    expect(expiry).toHaveValue("2026-07-31");
    expect(expiry).toHaveAttribute("min", TODAY);
  });

  it("offers the two registration forms the spec asks for", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    const actions = screen.getByRole("group", { name: "Acciones de usuarios" });
    expect(
      within(actions).getByRole("button", { name: "Agregar usuario" }),
    ).toHaveTextContent("+ Agregar usuario");
    expect(
      within(actions).getByRole("button", { name: "Agregar administrador" }),
    ).toHaveTextContent("+ Agregar administrador");

    const emails = screen.getAllByLabelText("Correo electrónico");
    expect(emails[0]).toHaveAttribute("name", "email");
    expect(emails[0]).toHaveAttribute("type", "email");
    expect(emails[0]).toBeRequired();
    expect(screen.getAllByLabelText("Nombre y apellidos")[0]).toHaveAttribute(
      "name",
      "fullName",
    );
    expect(screen.getAllByLabelText("Celular (opcional)")[0]).toHaveAttribute(
      "name",
      "phone",
    );
    // El rol viaja oculto: distingue el alta de administrador de la de docente.
    expect(screen.getByDisplayValue("docente")).toHaveAttribute("name", "role");
    expect(screen.getByDisplayValue("admin")).toHaveAttribute("name", "role");
  });

  it("shows the contact details and who registered each user", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    const maria = rowFor("María Docente");
    // El dato se ve en la fila y también en la ficha de solo lectura.
    expect(within(maria).getAllByText("maria@example.test").length).toBe(2);
    expect(within(maria).getAllByText("987654321").length).toBe(2);

    const ana = rowFor("Ana PorVencer");
    expect(within(ana).getAllByText("Superadministrador Demo").length).toBe(2);

    // Sin correo ni celular se dice explicitamente, no se deja en blanco.
    const luis = rowFor("Luis Expirado");
    expect(within(luis).getAllByText("Sin correo").length).toBe(2);
    expect(within(luis).getAllByText("Sin celular").length).toBe(2);
  });

  it("offers Excel import and an export that carries the visible filters", () => {
    render(
      <UsersManager apiBaseUrl={API}
        counts={counts}
        page={page}
        query={{ ...query, group: "staff", search: "Ana", status: "expirado" }}
        today={TODAY}
      />,
    );

    expect(screen.getByRole("button", { name: "Importar Excel" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Exportar Excel" })).toHaveAttribute(
      "href",
      "/api/admin/users/export?group=staff&search=Ana&accessState=expirado",
    );
  });

  it("submits server-side search while preserving active filters", () => {
    render(
      <UsersManager apiBaseUrl={API}
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
      <UsersManager apiBaseUrl={API}
        counts={counts}
        page={page}
        query={{ ...query, search: "María" }}
        today={TODAY}
      />,
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("María");

    rerender(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    expect(
      screen.getByRole("searchbox", { name: "Buscar usuario" }),
    ).toHaveValue("");
  });

  it("discards an unsubmitted search draft when another filter navigates", () => {
    const initialQuery = { ...query, search: "María" };
    const { rerender } = render(
      <UsersManager apiBaseUrl={API} counts={counts} page={page} query={initialQuery} today={TODAY} />,
    );
    const search = screen.getByRole("searchbox", { name: "Buscar usuario" });
    fireEvent.change(search, { target: { value: "Borrador sin enviar" } });
    expect(search).toHaveValue("Borrador sin enviar");

    rerender(
      <UsersManager apiBaseUrl={API}
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

  it("ofrece vigencias rápidas de 3, 6 y 12 meses y anuncia la fecha", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    // Ana no tiene fecha de inicio: la vigencia rápida la completa.
    const ana = rowFor("Ana PorVencer");
    fireEvent.click(within(ana).getByText("Extender vigencia"));
    fireEvent.click(within(ana).getByRole("button", { name: "6 meses" }));

    expect(within(ana).getByText(/Vigencia hasta/)).toBeVisible();
    // 2026-09-05 + 6 meses = 2027-03-05 en Lima.
    expect(within(ana).getByLabelText("Fin")).toHaveValue("2027-03-05");
    expect(within(ana).getByLabelText("Inicio")).toHaveValue("2026-09-05");
  });

  it("una fecha de inicio existente no se pisa al usar la vigencia rápida", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    const maria = rowFor("María Docente");
    fireEvent.click(within(maria).getByText("Extender vigencia"));
    fireEvent.click(within(maria).getByRole("button", { name: "3 meses" }));

    // María ya tenía inicio: se conserva y solo cambia el fin.
    expect(within(maria).getByLabelText("Inicio")).toHaveValue("2026-01-01");
    expect(within(maria).getByLabelText("Fin")).toHaveValue("2026-12-05");
  });

  it("ajusta fin de mes al usar vigencia rápida en un mes más corto", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today="2026-01-31" />);

    const ana = rowFor("Ana PorVencer");
    fireEvent.click(within(ana).getByText("Extender vigencia"));
    fireEvent.click(within(ana).getByRole("button", { name: "3 meses" }));

    expect(within(ana).getByLabelText("Fin")).toHaveValue("2026-04-30");
  });

  it("solo las cuentas activas ofrecen suspender y todas ofrecen el enlace de contraseña", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    // María, Ana y Luis están activos; Pedro está pausado.
    expect(screen.getAllByText("Ver ficha")).toHaveLength(4);
    expect(screen.getAllByText("Enviar enlace de contraseña")).toHaveLength(4);
    expect(
      screen.getAllByText("Suspender acceso", { selector: "summary" }),
    ).toHaveLength(3);
  });

  it("la ficha muestra el estado de la cuenta y quién la creó", () => {
    render(<UsersManager apiBaseUrl={API} counts={counts} page={page} query={query} today={TODAY} />);

    const pedro = rowFor("Pedro Pausado");
    fireEvent.click(within(pedro).getByText("Ver ficha"));

    expect(within(pedro).getByText("Estado de la cuenta")).toBeVisible();
    expect(within(pedro).getAllByText("Pausada").length).toBeGreaterThan(0);
    expect(within(pedro).getByText("Creado por")).toBeVisible();
  });
});

describe("UsersManager — barra de acciones", () => {
  beforeEach(() => {
    vi.mocked(createAdministrativeUserAction).mockReset();
    vi.mocked(createAdministrativeUserAction).mockResolvedValue({
      status: "idle",
    });
  });

  function renderManager() {
    render(
      <UsersManager
        apiBaseUrl={API}
        counts={counts}
        page={page}
        query={query}
        today={TODAY}
      />,
    );
    const bar = screen.getByRole("group", { name: "Acciones de usuarios" });
    return {
      admin: within(bar).getByRole("button", { name: "Agregar administrador" }),
      bar,
      docente: within(bar).getByRole("button", { name: "Agregar usuario" }),
      exportLink: within(bar).getByRole("link", { name: "Exportar Excel" }),
      importButton: within(bar).getByRole("button", { name: "Importar Excel" }),
    };
  }

  /** Paneles de formulario visibles ahora mismo (los ocultos no cuentan). */
  function visiblePanels() {
    return screen.queryAllByRole("region");
  }

  it("carga con cuatro acciones y ningún formulario desplegado", () => {
    const { admin, bar, docente, exportLink, importButton } = renderManager();

    for (const trigger of [docente, admin, importButton]) {
      expect(trigger).toHaveAttribute("type", "button");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      // aria-controls apunta a un panel que existe, aunque esté oculto.
      const controlled = document.getElementById(
        trigger.getAttribute("aria-controls") ?? "",
      );
      expect(controlled).not.toBeNull();
      expect(controlled).not.toBeVisible();
    }
    expect(within(bar).getAllByRole("button")).toHaveLength(3);
    expect(exportLink).toHaveAttribute("href", "/api/admin/users/export");
    expect(visiblePanels()).toHaveLength(0);
  });

  it("mantiene un solo panel abierto a la vez", () => {
    const { admin, docente, importButton } = renderManager();

    fireEvent.click(docente);
    expect(visiblePanels()).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Agregar usuario docente" }),
    ).toBeVisible();
    expect(docente).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(admin);
    expect(visiblePanels()).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Agregar administrador" }),
    ).toBeVisible();
    expect(docente).toHaveAttribute("aria-expanded", "false");
    expect(admin).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(importButton);
    expect(visiblePanels()).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Importar usuarios desde Excel" }),
    ).toBeVisible();
    expect(admin).toHaveAttribute("aria-expanded", "false");
    expect(importButton).toHaveAttribute("aria-expanded", "true");
  });

  it("abrir un formulario no mueve ni cambia los botones de la barra", () => {
    const { admin, bar, docente, importButton } = renderManager();
    const controls = () => [...bar.querySelectorAll("button, a")];
    const before = controls();
    const classesBefore = before.map((control) => control.className);

    for (const trigger of [docente, admin, importButton]) {
      fireEvent.click(trigger);
      const panel = screen.getByRole("region");

      // Mismos botones, mismo orden, mismas clases: solo cambia aria-expanded.
      expect(controls()).toEqual(before);
      expect(controls().map((control) => control.className)).toEqual(
        classesBefore,
      );
      // El formulario se pinta DEBAJO de la barra, nunca dentro de ella.
      expect(bar.contains(panel)).toBe(false);
      expect(
        bar.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(bar).queryByRole("textbox")).toBeNull();
    }
  });

  it("al abrir lleva el foco al panel y «Cerrar» lo devuelve al botón", () => {
    const { docente } = renderManager();

    fireEvent.click(docente);
    const panel = screen.getByRole("region", {
      name: "Agregar usuario docente",
    });
    expect(panel).toHaveFocus();

    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar" }));

    expect(visiblePanels()).toHaveLength(0);
    expect(docente).toHaveAttribute("aria-expanded", "false");
    expect(docente).toHaveFocus();
  });

  it("también se cierra con «Cerrar formulario» al pie del panel", () => {
    const { importButton } = renderManager();

    fireEvent.click(importButton);
    fireEvent.click(
      screen.getByRole("button", { name: "Cerrar formulario" }),
    );

    expect(visiblePanels()).toHaveLength(0);
    expect(importButton).toHaveFocus();
  });

  it("Escape cierra el panel aunque el foco esté en un campo", async () => {
    const user = userEvent.setup();
    const { admin } = renderManager();

    await user.click(admin);
    const panel = screen.getByRole("region", { name: "Agregar administrador" });
    await user.click(within(panel).getByLabelText("Nombre y apellidos"));
    await user.keyboard("{Escape}");

    expect(visiblePanels()).toHaveLength(0);
    expect(admin).toHaveAttribute("aria-expanded", "false");
    expect(admin).toHaveFocus();
  });

  it("pulsar otra vez el botón abierto repliega su formulario", () => {
    const { docente } = renderManager();

    fireEvent.click(docente);
    fireEvent.click(docente);

    expect(visiblePanels()).toHaveLength(0);
    expect(docente).toHaveAttribute("aria-expanded", "false");
  });

  it("conserva lo escrito al cambiar de formulario y volver", () => {
    const { admin, docente } = renderManager();

    fireEvent.click(docente);
    const name = within(
      screen.getByRole("region", { name: "Agregar usuario docente" }),
    ).getByLabelText("Nombre y apellidos");
    fireEvent.change(name, { target: { value: "Rosa Borrador" } });
    fireEvent.click(admin);
    fireEvent.click(docente);

    expect(name).toHaveValue("Rosa Borrador");
  });

  it("tras un alta confirmada cierra el panel y el formulario vuelve vacío", async () => {
    const user = userEvent.setup();
    vi.mocked(createAdministrativeUserAction).mockResolvedValueOnce({
      message: "Usuario registrado. Recibirá un correo para crear su contraseña.",
      status: "success",
    });
    const { docente } = renderManager();

    await user.click(docente);
    let panel = screen.getByRole("region", { name: "Agregar usuario docente" });
    await user.type(
      within(panel).getByLabelText("Nombre y apellidos"),
      "Rosa Nueva",
    );
    await user.type(
      within(panel).getByLabelText("Correo electrónico"),
      "rosa@example.test",
    );
    await user.click(
      within(panel).getByRole("button", { name: "Registrar usuario" }),
    );

    await waitFor(() => expect(visiblePanels()).toHaveLength(0));
    expect(createAdministrativeUserAction).toHaveBeenCalledTimes(1);
    expect(docente).toHaveAttribute("aria-expanded", "false");
    expect(docente).toHaveFocus();

    // Al volver a abrirlo no queda el aviso del registro anterior.
    await user.click(docente);
    panel = screen.getByRole("region", { name: "Agregar usuario docente" });
    expect(within(panel).getByLabelText("Nombre y apellidos")).toHaveValue("");
    expect(within(panel).queryByText(/Usuario registrado/)).toBeNull();
  });

  it("si el alta falla, el panel sigue abierto con el aviso", async () => {
    const user = userEvent.setup();
    vi.mocked(createAdministrativeUserAction).mockResolvedValueOnce({
      message: "No se pudo registrar al usuario. Inténtalo de nuevo.",
      status: "error",
    });
    const { docente } = renderManager();

    await user.click(docente);
    const panel = screen.getByRole("region", {
      name: "Agregar usuario docente",
    });
    await user.type(
      within(panel).getByLabelText("Nombre y apellidos"),
      "Rosa Nueva",
    );
    await user.type(
      within(panel).getByLabelText("Correo electrónico"),
      "rosa@example.test",
    );
    await user.click(
      within(panel).getByRole("button", { name: "Registrar usuario" }),
    );

    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "No se pudo registrar",
    );
    expect(panel).toBeVisible();
    expect(docente).toHaveAttribute("aria-expanded", "true");
  });

  it("un alta que termina con otro formulario abierto no cierra ese otro", async () => {
    const user = userEvent.setup();
    let finish: ((state: AdminActionState) => void) | undefined;
    vi.mocked(createAdministrativeUserAction).mockImplementationOnce(
      () =>
        new Promise<AdminActionState>((resolve) => {
          finish = resolve;
        }),
    );
    const { admin, docente } = renderManager();

    await user.click(docente);
    const docentePanel = screen.getByRole("region", {
      name: "Agregar usuario docente",
    });
    await user.type(
      within(docentePanel).getByLabelText("Nombre y apellidos"),
      "Rosa Nueva",
    );
    await user.type(
      within(docentePanel).getByLabelText("Correo electrónico"),
      "rosa@example.test",
    );
    await user.click(
      within(docentePanel).getByRole("button", { name: "Registrar usuario" }),
    );
    await waitFor(() => expect(finish).toBeDefined());

    await user.click(admin);
    await act(async () => {
      finish?.({ message: "Usuario registrado.", status: "success" });
    });

    expect(
      screen.getByRole("region", { name: "Agregar administrador" }),
    ).toBeVisible();
    expect(admin).toHaveAttribute("aria-expanded", "true");
  });
});
