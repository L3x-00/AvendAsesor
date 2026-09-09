import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersImportForm } from "./users-import-form";

const refresh = vi.fn();
const getSession = vi.fn();
const showToast = vi.fn();

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({ auth: { getSession } }),
}));

function openForm() {
  render(<UsersImportForm apiBaseUrl="http://localhost:3001" />);
  // El panel vive dentro de un <details>: se abre para que las aserciones
  // reflejen lo que el administrador ve de verdad.
  const panel = screen.getByText("Importar Excel").closest("details");
  if (panel) panel.open = true;
  return {
    file: screen.getByLabelText("Archivo Excel") as HTMLInputElement,
    submit: screen.getByRole("button", { name: "Importar usuarios" }),
  };
}

/**
 * userEvent.upload llena el slot interno del input (sobrescribir la propiedad
 * "files" no basta), pero en jsdom el archivo resultante reporta size 0, asi
 * que el tamano se fija despues de adjuntarlo.
 */
async function attach(input: HTMLInputElement, size = 64) {
  const file = new File(["x"], "usuarios.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await userEvent.upload(input, file);
  const uploaded = input.files?.[0];
  if (uploaded) {
    Object.defineProperty(uploaded, "size", { configurable: true, value: size });
  }
}

describe("UsersImportForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("explains what the file needs before anything is uploaded", () => {
    openForm();

    expect(screen.getByText(/Nombre y/)).toBeInTheDocument();
    expect(screen.getByText(/fila por fila/)).toBeInTheDocument();
  });

  it("asks for a file instead of posting an empty request", async () => {
    const { submit } = openForm();

    fireEvent.click(submit);

    // El aviso ya no es general: cuelga del campo del archivo.
    expect(await screen.findByText(/El archivo Excel es obligatorio/)).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a file above the allowed size without contacting the API", async () => {
    const { file, submit } = openForm();
    await attach(file, 5 * 1024 * 1024);

    fireEvent.click(submit);

    expect(
      await screen.findByText(/máximo de 2 MB/),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports every rejected row with its spreadsheet row number", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        considered: 3,
        errors: [
          {
            email: "malo@example.test",
            message: "El correo electrónico no es válido.",
            rowNumber: 4,
          },
        ],
        imported: 2,
        truncated: false,
      }),
      ok: true,
      status: 200,
    } as Response);
    const { file, submit } = openForm();
    await attach(file);

    fireEvent.click(submit);

    expect(await screen.findByText(/Se registraron/)).toBeInTheDocument();
    expect(screen.getByText(/Fila 4/)).toHaveTextContent(
      "El correo electrónico no es válido.",
    );
    // Las filas válidas sí entraron, así que el listado debe refrescarse.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says the file was truncated instead of looking complete", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        considered: 300,
        errors: [],
        imported: 300,
        truncated: true,
      }),
      ok: true,
      status: 200,
    } as Response);
    const { file, submit } = openForm();
    await attach(file);

    fireEvent.click(submit);

    expect(await screen.findByText(/más filas de las permitidas/)).toBeVisible();
  });

  it("turns an API rejection into an actionable message", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 413 } as Response);
    const { file, submit } = openForm();
    await attach(file);

    fireEvent.click(submit);

    expect(await screen.findByText(/supera el tamaño permitido/)).toBeVisible();
    await waitFor(() => expect(file).toHaveAttribute("aria-invalid", "true"));
    expect(file.files?.[0]?.name).toBe("usuarios.xlsx");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("tells the administrator when the session expired", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { file, submit } = openForm();
    await attach(file);

    fireEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "sesión expiró",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects the wrong file type and clears the inline error when a valid Excel is selected", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { file, submit } = openForm();
    await user.upload(file, new File(["texto"], "usuarios.csv", { type: "text/csv" }));
    await user.click(submit);
    expect(await screen.findByText(/XLSX válido/)).toBeVisible();
    await waitFor(() => expect(file).toHaveFocus());
    expect(file).toHaveAccessibleDescription(/XLSX válido/);
    expect(fetch).not.toHaveBeenCalled();
    await attach(file);
    expect(file).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/XLSX válido/)).not.toBeInTheDocument();
  });

  it("retains a rejected roster and never announces success when zero users were imported", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      considered: 1,
      errors: [{ email: "duplicado@example.test", message: "El correo ya existe.", rowNumber: 2 }],
      imported: 0,
      truncated: false,
    })));
    const { file, submit } = openForm();
    await attach(file);
    fireEvent.click(submit);
    expect(await screen.findByText(/No se registró ningún usuario/)).toBeVisible();
    expect(screen.getByText(/Fila 2/)).toHaveTextContent("El correo ya existe.");
    expect(file.files?.[0]?.name).toBe("usuarios.xlsx");
    expect(showToast).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("blocks repeated submits while importing and reports a partial result accurately", async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const { file, submit } = openForm();
    await attach(file);
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(submit.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Importando usuarios");
    finish?.(new Response(JSON.stringify({ considered: 2, imported: 1, truncated: false, errors: [{ rowNumber: 3, email: null, message: "Falta correo." }] })));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Se registró 1 usuario. Revisa las filas pendientes."));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(file.files?.[0]?.name).toBe("usuarios.xlsx");
  });

});
