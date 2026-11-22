import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthorizedAdminApiClient } from "@/lib/admin-api/authorized-client";
import {
  createModuleAction,
  deleteDocumentAction,
  deleteModuleAction,
  linkDocumentModuleAction,
  setDocumentStatusAction,
  setModuleStatusAction,
  unlinkDocumentModuleAction,
  updateDocumentAction,
  updateModuleAction,
} from "./actions";

/**
 * Guardia de invalidación para el cache de cliente (`experimental.staleTimes`).
 *
 * Con cache de cliente, una mutación que no invalide la ruta cuyos datos cambia
 * deja a la persona viendo cifras viejas hasta que expira la ventana. El inicio
 * del panel publica totales de usuarios, módulos, submódulos y documentos; las
 * tarjetas de cada módulo publican su conteo; la biblioteca publica a qué
 * módulos pertenece cada documento. Esta prueba fija qué rutas debe invalidar
 * cada acción.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/admin-api/authorized-client", () => ({
  createAuthorizedAdminApiClient: vi.fn(),
}));

const client = {
  createModule: vi.fn(),
  deleteDocument: vi.fn(),
  deleteModule: vi.fn(),
  linkDocumentModule: vi.fn(),
  setDocumentStatus: vi.fn(),
  setModuleStatus: vi.fn(),
  unlinkDocumentModule: vi.fn(),
  updateDocument: vi.fn(),
  updateModule: vi.fn(),
};

const initialState = { status: "idle" as const };

function invalidatedPaths(): string[] {
  const calls = vi.mocked(revalidatePath).mock.calls;
  return calls.map(([path, type]) =>
    type === undefined ? path : `${path}#${type}`,
  );
}

/** Rutas mínimas que cualquier cambio en módulos debe refrescar. */
const MODULE_TOTALS = ["/admin", "/admin/modules#layout"];
/** Rutas mínimas que cualquier cambio en documentos debe refrescar. */
const DOCUMENT_TOTALS = ["/admin", "/admin/modules#layout"];

describe("invalidación de rutas tras una mutación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(client).forEach((method) => method.mockReset());
    vi.mocked(createAuthorizedAdminApiClient).mockResolvedValue(
      client as never,
    );
  });

  it("crear un módulo refresca los totales del inicio", async () => {
    client.createModule.mockResolvedValue({ id: "m1" });
    const formData = new FormData();
    formData.set("code", "TRAMITES");
    formData.set("name", "Trámites");

    await createModuleAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([...MODULE_TOTALS, "/admin/documents#layout"]),
    );
  });

  it("actualizar un módulo refresca los totales del inicio", async () => {
    client.updateModule.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("moduleId", "m1");
    formData.set("name", "Trámites y gestiones");

    await updateModuleAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([...MODULE_TOTALS, "/admin/documents#layout"]),
    );
  });

  it("activar o desactivar un módulo refresca inicio, biblioteca y módulos", async () => {
    client.setModuleStatus.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("isActive", "false");
    formData.set("moduleId", "m1");
    formData.set("reason", "Duplicado de otro módulo");

    await setModuleStatusAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([...MODULE_TOTALS, "/admin/documents#layout"]),
    );
  });

  it("eliminar un módulo refresca los totales del inicio", async () => {
    client.deleteModule.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("moduleId", "m1");
    formData.set("reason", "Ya no corresponde al alcance normativo");

    await deleteModuleAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([...MODULE_TOTALS, "/admin/documents#layout"]),
    );
  });

  it("actualizar los metadatos de un documento refresca la biblioteca", async () => {
    client.updateDocument.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("documentId", "d1");
    formData.set("documentType", "Resolución");
    formData.set("issuanceYear", "2026");
    formData.set("issuingEntity", "MINEDU");
    formData.set("specificDependency", "Dirección de personal");
    formData.set("title", "Resolución directoral");

    await updateDocumentAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([
        "/admin/documents#layout",
        "/admin/documents/d1",
      ]),
    );
  });

  it("cambiar la vigencia de un documento refresca el conteo de su módulo", async () => {
    client.setDocumentStatus.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("documentId", "d1");
    formData.set("isActive", "false");
    formData.set("reason", "Norma derogada");

    await setDocumentStatusAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([
        "/admin/documents#layout",
        "/admin/documents/d1",
        "/admin/modules#layout",
      ]),
    );
  });

  it("eliminar un documento refresca el total del inicio y el conteo del módulo", async () => {
    client.deleteDocument.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("documentId", "d1");
    formData.set("reason", "Carga duplicada");

    await deleteDocumentAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([
        "/admin/documents#layout",
        "/admin/documents/d1",
        ...DOCUMENT_TOTALS,
      ]),
    );
  });

  it("asociar un documento a un módulo refresca la biblioteca", async () => {
    client.linkDocumentModule.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("documentId", "d1");
    formData.set("moduleId", "m1");

    await linkDocumentModuleAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([
        "/admin/documents#layout",
        "/admin/documents/d1",
        "/admin/modules#layout",
      ]),
    );
  });

  it("desasociar un documento de un módulo refresca la biblioteca", async () => {
    client.unlinkDocumentModule.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("documentId", "d1");
    formData.set("moduleId", "m1");

    await unlinkDocumentModuleAction(initialState, formData);

    expect(invalidatedPaths()).toEqual(
      expect.arrayContaining([
        "/admin/documents#layout",
        "/admin/documents/d1",
        "/admin/modules#layout",
      ]),
    );
  });
});
