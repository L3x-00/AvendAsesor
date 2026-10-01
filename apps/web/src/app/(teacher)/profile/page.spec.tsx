import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./page";

const mocks = vi.hoisted(() => ({
  context: { fullName: "Rosa Docente", role: "docente" as "admin" | "docente" | "superadmin" },
  formsProps: vi.fn(),
  maybeSingle: vi.fn(),
  getUser: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/chat-api/authorized-client", () => ({
  resolveAuthorizedChatContext: vi.fn(async () => mocks.context),
}));
vi.mock("@/lib/auth/session-redirect", () => ({
  resolveSignInPath: vi.fn(async () => "/auth/sign-in?sesion=caducada"),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  usePathname: () => "/profile",
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  })),
}));
vi.mock("@/components/teacher/profile-forms", () => ({
  ProfileForms: (props: Record<string, unknown>) => {
    mocks.formsProps(props);
    return <div data-testid="profile-forms" />;
  },
}));

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await ProfilePage({ searchParams: Promise.resolve(searchParams) }));
}

describe("Mi perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context = { fullName: "Rosa Docente", role: "docente" };
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "rosa@avend.test", id: "user-1", new_email: null } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { city: "Huancayo", department: "Junín", phone: "987654321" },
      error: null,
    });
  });

  it("pone «Cerrar sesión» en el encabezado como POST a /auth/sign-out", async () => {
    await renderPage();

    const header = screen.getByRole("heading", { level: 1, name: "Mi perfil" }).closest("header");
    expect(header).not.toBeNull();
    const button = within(header as HTMLElement).getByRole("button", { name: "Cerrar sesión" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("action", "/auth/sign-out");
    expect(form).toHaveAttribute("method", "post");
  });

  it("el botón «Cerrar sesión» muestra que está trabajando y no se envía dos veces", async () => {
    await renderPage();
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    const form = button.closest("form") as HTMLFormElement;

    // Un evento submit sintético no navega en jsdom: el primero sigue su curso
    // y el segundo se cancela.
    expect(fireEvent.submit(form)).toBe(true);
    expect(screen.getByRole("button", { name: "Cerrando sesión…" })).toHaveAttribute("aria-busy", "true");
    expect(fireEvent.submit(form)).toBe(false);
  });

  it("pasa los datos guardados, el rol y el correo pendiente a los formularios", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "rosa@avend.test", id: "user-1", new_email: "nuevo@avend.test" } },
      error: null,
    });

    await renderPage();

    expect(mocks.formsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Huancayo",
        department: "Junín",
        email: "rosa@avend.test",
        fullName: "Rosa Docente",
        pendingEmail: "nuevo@avend.test",
        phone: "987654321",
        role: "docente",
      }),
    );
  });

  it("si no se pueden leer los datos no muestra el formulario vacío y ofrece reintentar", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "timeout" } });

    await renderPage();

    expect(screen.queryByTestId("profile-forms")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/no pudimos cargar tus datos/i);
    fireEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("también falla cerrado si la consulta lanza una excepción", async () => {
    mocks.maybeSingle.mockRejectedValue(new Error("network"));

    await renderPage();

    expect(screen.queryByTestId("profile-forms")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/no pudimos cargar tus datos/i);
  });

  it("sin sesión lleva al inicio de sesión", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/auth/sign-in?sesion=caducada");
  });

  it.each([
    ["actualizado", /tu correo de acceso ahora es rosa@avend\.test/i],
    ["pendiente", /abre también el enlace que llegó al otro correo/i],
    ["revisar", /si abriste el enlace en otro dispositivo/i],
    ["error", /el enlace venció, ya se usó o no es válido/i],
  ])("explica el resultado del cambio de correo «%s» y limpia la URL", async (outcome, text) => {
    await renderPage({ correo: outcome });

    expect(screen.getByText(text)).toBeVisible();
    expect(mocks.replace).toHaveBeenCalledWith("/profile", { scroll: false });

    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it("ignora un valor de aviso desconocido", async () => {
    await renderPage({ correo: "inventado" });

    expect(screen.queryByRole("button", { name: "Cerrar aviso" })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("los accesos rápidos usan los mismos nombres que la barra lateral", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: /nuevo chat/i })).toHaveAttribute("href", "/chat");
    expect(screen.getByRole("link", { name: /^historial/i })).toHaveAttribute("href", "/history");
    expect(screen.getByRole("link", { name: /guía de uso/i })).toHaveAttribute("href", "/guide");
  });
});
