import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminActionState } from "@/lib/admin-api/action-state";
import { AdminActionForm, type AdminAction } from "./admin-action-form";

describe("AdminActionForm", () => {
  it("enforces visible form constraints before invoking a server action", async () => {
    const user = userEvent.setup();
    const action: AdminAction = vi.fn(async (): Promise<AdminActionState> => ({
      status: "success",
    }));

    render(
      <AdminActionForm action={action} submitLabel="Guardar">
        <label>
          Nombre
          <input name="name" required />
        </label>
      </AdminActionForm>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Nombre" })).toBeInvalid();
  });

  it("blocks duplicate submission while an action is pending and shows a safe recovery message", async () => {
    const user = userEvent.setup();
    let resolveAction: ((value: AdminActionState) => void) | undefined;
    const action: AdminAction = () =>
      new Promise<AdminActionState>((resolve) => {
        resolveAction = resolve;
      });

    render(
      <AdminActionForm action={action} submitLabel="Cargar PDF">
        <input name="title" type="text" />
      </AdminActionForm>,
    );

    await user.click(screen.getByRole("button", { name: "Cargar PDF" }));
    expect(screen.getByRole("button", { name: "Procesando…" })).toBeDisabled();

    resolveAction?.({
      message: "Actualiza el listado antes de volver a enviar esta operación.",
      status: "error",
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Actualiza el listado",
      );
    });
  });

  it("renders a short-lived download URL only when returned by the server action", async () => {
    const user = userEvent.setup();
    const action: AdminAction = async () => ({
      downloadUrl:
        "http://localhost:55321/storage/v1/object/sign/normative-documents/test",
      message: "Enlace temporal generado por 60 segundos.",
      status: "success",
    });

    render(
      <AdminActionForm action={action} submitLabel="Generar enlace">
        <input name="documentId" type="hidden" value="document-id" />
      </AdminActionForm>,
    );

    await user.click(screen.getByRole("button", { name: "Generar enlace" }));

    expect(await screen.findByRole("status")).toHaveTextContent("60 segundos");
    expect(
      screen.getByRole("link", { name: "Abrir descarga temporal" }),
    ).toHaveAttribute(
      "href",
      "http://localhost:55321/storage/v1/object/sign/normative-documents/test",
    );
  });
});
