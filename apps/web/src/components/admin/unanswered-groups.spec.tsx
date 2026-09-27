import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UnansweredGroup } from "@/lib/consultation-reports-api/types";
import { UnansweredGroups } from "./unanswered-groups";

vi.mock("@/app/admin/operations/consultation-actions", () => ({
  resolveUnansweredGroupAction: vi.fn(),
}));

vi.mock("./admin-action-form", () => ({
  AdminActionForm: ({
    children,
    submitLabel,
  }: {
    children: React.ReactNode;
    submitLabel: string;
  }) => (
    <form>
      {children}
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

const topic: UnansweredGroup = {
  caseIds: [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ],
  count: 2,
  examples: ["de que trata la renumeracion", "¿Qué beneficios hay?"],
  kind: "topic",
  latestAt: "2026-09-26T15:00:00.000Z",
  moduleId: "33333333-3333-4333-8333-333333333333",
  moduleName: "Escala remunerativa",
  parentModuleName: "Remuneraciones",
};

describe("UnansweredGroups", () => {
  it("muestra qué documentación falta por tema, con la acción de cargarla", () => {
    render(
      <UnansweredGroups
        groups={[
          topic,
          {
            ...topic,
            caseIds: ["44444444-4444-4444-8444-444444444444"],
            count: 1,
            examples: ["que documentos tienes disponibles?"],
            kind: "catalog",
            moduleId: null,
            moduleName: null,
            parentModuleName: null,
          },
          {
            ...topic,
            caseIds: ["55555555-5555-4555-8555-555555555555"],
            count: 1,
            examples: [],
            kind: "unknown",
            moduleId: null,
            moduleName: null,
            parentModuleName: null,
          },
        ]}
        period="month"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "¿Qué documentación falta?" }),
    ).toBeVisible();
    expect(screen.getByText(/4 consultas quedaron sin sustento/)).toBeVisible();

    const group = screen.getByRole("listitem", {
      name: "Remuneraciones › Escala remunerativa",
    });
    expect(within(group).getByText("2 consultas")).toBeVisible();
    expect(
      within(group).getByText("«de que trata la renumeracion»"),
    ).toBeVisible();
    expect(
      within(group).getByRole("link", {
        name: "Cargar documento en este tema",
      }),
    ).toHaveAttribute(
      "href",
      "/admin/modules/33333333-3333-4333-8333-333333333333?cargar=1",
    );
    expect(
      within(group).getByRole("link", { name: "Ver casos" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining(
        "submoduleId=33333333-3333-4333-8333-333333333333",
      ),
    );
    expect(
      within(group).getByRole("button", { name: "Cerrar 2 consultas" }),
    ).toBeInTheDocument();
    // Un tema con documentación cargada se cierra como resuelto (avisa al docente).
    expect(
      within(group).getByRole("combobox", { name: "Cómo se cierra" }),
    ).toHaveValue("resolved");
    expect(group.querySelectorAll('input[name="caseId"]')).toHaveLength(2);

    const catalog = screen.getByRole("listitem", {
      name: "Preguntas sobre los documentos disponibles",
    });
    expect(
      within(catalog).queryByText("Cargar documento en este tema"),
    ).toBeNull();
    expect(
      within(catalog).getByText(/ya responde estas preguntas/),
    ).toBeVisible();
    expect(
      within(catalog).getByRole("button", { name: "Cerrar consulta" }),
    ).toBeInTheDocument();
    // Lo que no requiere documento se descarta por defecto: sin aviso al docente.
    expect(
      within(catalog).getByRole("combobox", { name: "Cómo se cierra" }),
    ).toHaveValue("discarded");

    const unknown = screen.getByRole("listitem", {
      name: "Sin tema identificado",
    });
    expect(
      within(unknown).getByRole("link", { name: "Ver casos" }),
    ).toHaveAttribute("href", expect.not.stringContaining("moduleId"));
  });

  it("un tema principal filtra por módulo y no por submódulo", () => {
    render(
      <UnansweredGroups
        groups={[
          { ...topic, moduleName: "Remuneraciones", parentModuleName: null },
        ]}
        period="week"
      />,
    );

    expect(screen.getByRole("link", { name: "Ver casos" })).toHaveAttribute(
      "href",
      expect.stringContaining("moduleId=33333333"),
    );
  });

  it("sin acceso a Módulos no ofrece cargar el documento", () => {
    render(
      <UnansweredGroups canUpload={false} groups={[topic]} period="month" />,
    );

    expect(
      screen.queryByRole("link", { name: "Cargar documento en este tema" }),
    ).toBeNull();
  });

  it("si el resumen no se pudo cargar lo dice sin romper la página", () => {
    render(<UnansweredGroups groups={null} period="month" />);

    expect(
      screen.getByText(/No pudimos preparar este resumen ahora/),
    ).toBeVisible();
  });

  it("con más de 50 consultas aclara cuántas se cierran", () => {
    render(
      <UnansweredGroups groups={[{ ...topic, count: 73 }]} period="month" />,
    );

    expect(
      screen.getByText(
        "Se cierran 2 de 73; el resto queda abierto para la próxima vez.",
      ),
    ).toBeInTheDocument();
  });

  it("sin consultas pendientes lo dice con claridad", () => {
    render(<UnansweredGroups groups={[]} period="today" />);

    expect(
      screen.getByText(
        "No hay consultas sin sustento pendientes en este periodo.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("con una sola consulta lo dice en singular", () => {
    render(
      <UnansweredGroups
        groups={[{ ...topic, caseIds: [topic.caseIds[0] as string], count: 1 }]}
        period="month"
      />,
    );

    expect(screen.getByText(/1 consulta quedó sin sustento/)).toBeVisible();
    expect(screen.getByText("1 consulta")).toBeVisible();
  });
});
