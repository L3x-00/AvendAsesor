import { describe, expect, it } from "vitest";
import { describeAuditEvent } from "./document-audit";

const moduleId = "f5326e30-5344-5e5f-a3af-164cab96baae";

describe("describeAuditEvent", () => {
  it("no expone datos técnicos al abrir el PDF", () => {
    const described = describeAuditEvent({
      action: "download_url_generated",
      details: { ttlSeconds: 60 },
    });

    expect(described).toEqual({
      details: [],
      routine: true,
      title: "PDF abierto o descargado",
    });
  });

  it("traduce el cambio de estado técnico", () => {
    expect(
      describeAuditEvent({
        action: "metadata_updated",
        details: { event: "technical_status_changed", technicalStatus: "ready" },
      }),
    ).toMatchObject({
      details: ["Nuevo estado técnico: Listo."],
      title: "Estado técnico actualizado",
    });
  });

  it("muestra el nombre del módulo en vez del identificador", () => {
    const withName = describeAuditEvent(
      { action: "module_linked", details: { moduleId } },
      { moduleNameById: new Map([[moduleId, "Remuneraciones"]]) },
    );
    const withoutName = describeAuditEvent({
      action: "module_unlinked",
      details: { moduleId },
    });

    expect(withName.details).toEqual(["Módulo: Remuneraciones."]);
    expect(withoutName.details[0]).not.toContain(moduleId);
  });

  it("resume el registro inicial en lenguaje llano", () => {
    expect(
      describeAuditEvent({
        action: "created",
        details: {
          moduleCount: 1,
          situation: "current",
          technicalStatus: "pending_approval",
        },
      }).details,
    ).toEqual([
      "Situación inicial: Vigente.",
      "Estado técnico inicial: Pendiente de aprobación.",
      "Asociado a 1 módulo.",
    ]);
  });

  it("no afirma qué campos cambiaron (el registro guarda todo lo enviado) y explica archivos o reemplazos", () => {
    expect(
      describeAuditEvent({
        action: "metadata_updated",
        details: { issuanceYear: 2020, title: "Nuevo" },
      }),
    ).toMatchObject({ details: [], title: "Datos del documento actualizados" });

    expect(
      describeAuditEvent(
        {
          action: "deactivated",
          details: {
            archiveReasonCode: "DUPLICATE",
            replacementDocumentId: "r1",
            situation: "replaced",
          },
        },
        { documentTitleById: new Map([["r1", "Norma 2026"]]) },
      ).details,
    ).toEqual([
      "Nueva situación: Reemplazado / sin vigencia.",
      "Motivo del archivo: Documento duplicado.",
      "Reemplazado por: Norma 2026.",
    ]);
  });

  it("nunca muestra una acción desconocida con su código interno", () => {
    expect(
      describeAuditEvent({ action: "algo_nuevo", details: {} }).title,
    ).toBe("Cambio registrado");
  });
});
