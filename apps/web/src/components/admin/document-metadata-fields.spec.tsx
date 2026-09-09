import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TYPE_OPTIONS,
  ISSUING_ENTITY_OPTIONS,
  documentYears,
} from "@/lib/admin-api/document-taxonomy";
import { DocumentMetadataFields } from "./document-metadata-fields";

function renderFields() {
  return render(
    <form>
      <DocumentMetadataFields
        initial={{
          additionalDetail: "Dirección General de Desarrollo Docente",
          documentType: "LEY",
          issuanceYear: 2026,
          issuingEntity: "MINEDU",
          specificDependency: "DIGEDD",
        }}
        required
        suggestions={{
          additionalDetails: ["Oficina de Asesoría Jurídica"],
          specificDependencies: ["Dependencia frecuente global"],
        }}
      />
      <button type="reset">Cancelar</button>
    </form>,
  );
}

describe("DocumentMetadataFields", () => {
  it("preserves controlled metadata when a failed submission cancels the reset", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form onResetCapture={(event) => event.preventDefault()}>
        <DocumentMetadataFields required />
      </form>,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo documental" }), "LEY");
    await user.selectOptions(screen.getByRole("combobox", { name: "Año del documento" }), "2026");
    fireEvent.reset(container.querySelector("form")!);
    expect(screen.getByRole("combobox", { name: "Tipo documental" })).toHaveValue("LEY");
    expect(screen.getByRole("combobox", { name: "Año del documento" })).toHaveValue("2026");
    expect(screen.getByRole("combobox", { name: "Año del documento" })).toHaveAttribute("name", "issuanceYearMode");
  });

  it("offers the exact governed taxonomies and a dynamic year range", () => {
    renderFields();

    const type = screen.getByRole("combobox", { name: "Tipo documental" });
    const entity = screen.getByRole("combobox", { name: "Entidad emisora" });
    const year = screen.getByRole("combobox", { name: "Año del documento" });

    expect(within(type).getAllByRole("option").slice(1)).toHaveLength(17);
    expect(
      within(type)
        .getAllByRole("option")
        .slice(1)
        .map((option) => option.textContent),
    ).toEqual(DOCUMENT_TYPE_OPTIONS.map((option) => option.label));
    expect(within(entity).getAllByRole("option").slice(1)).toHaveLength(13);
    expect(
      within(entity)
        .getAllByRole("option")
        .slice(1)
        .map((option) => option.textContent),
    ).toEqual(ISSUING_ENTITY_OPTIONS.map((option) => option.label));
    expect(
      within(year).getByRole("option", {
        name: String(new Date().getFullYear()),
      }),
    ).toBeVisible();
    expect(within(year).getByRole("option", { name: "2014" })).toBeVisible();
    expect(
      within(year).getByRole("option", { name: "Anterior a 2014" }),
    ).toBeVisible();
    expect(documentYears().at(-1)).toBe(2014);
  });

  it("shows manual fields only for Otro and Otra institución", async () => {
    const user = userEvent.setup();
    renderFields();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Tipo documental" }),
      "OTRO",
    );
    expect(
      screen.getByRole("textbox", { name: "Especificar tipo" }),
    ).toBeRequired();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Tipo documental" }),
      "LEY",
    );
    expect(
      screen.queryByRole("textbox", { name: "Especificar tipo" }),
    ).toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Entidad emisora" }),
      "OTRA_INSTITUCION",
    );
    expect(
      screen.getByRole("textbox", { name: "Nombre de la institución" }),
    ).toBeRequired();
  });

  it("resets dependency on entity change and prioritizes relevant quick values", async () => {
    const user = userEvent.setup();
    const { container } = renderFields();

    const dependency = screen.getByRole("combobox", {
      name: "Dependencia específica",
    });
    expect(dependency).toHaveValue("DIGEDD");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Entidad emisora" }),
      "UGEL",
    );
    expect(dependency).toHaveValue("");

    const quickValues = [
      ...container.querySelectorAll('button[type="button"]'),
    ].map((button) => button.textContent);
    expect(quickValues.slice(0, 3)).toEqual(["UGEL 01", "UGEL 02", "UGEL 03"]);

    await user.click(screen.getByRole("button", { name: "UGEL 05" }));
    expect(dependency).toHaveValue("UGEL 05");
  });

  it("captures an exact pre-2014 year and Cancel restores controlled values", async () => {
    const user = userEvent.setup();
    renderFields();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Año del documento" }),
      "before-2014",
    );
    const exactYear = screen.getByRole("spinbutton", { name: "Año exacto" });
    expect(exactYear).toHaveAttribute("max", "2013");
    await user.type(exactYear, "2009");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("combobox", { name: "Año del documento" }),
    ).toHaveValue("2026");
    expect(
      screen.getByRole("combobox", { name: "Dependencia específica" }),
    ).toHaveValue("DIGEDD");
  });
});
