import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  hasErrors,
  validateField,
  validateFormData,
  validateValues,
  valuesFromFormData,
  type FieldRules,
} from "./field-validation";

describe("validateField", () => {
  it("reports the missing value with the name of its own field", () => {
    expect(
      validateField([{ kind: "required", label: "El correo electrónico" }], ""),
    ).toBe("El correo electrónico es obligatorio.");
  });

  it("keeps whitespace from passing as a filled field", () => {
    expect(
      validateField([{ kind: "required", label: "El nombre" }], "   "),
    ).toBe("El nombre es obligatorio.");
  });

  /**
   * Las reglas de formato solo se aplican cuando hay algo escrito: si además
   * marcaran el campo vacío, el usuario vería dos quejas sobre lo mismo.
   */
  it("stays quiet on an empty optional field", () => {
    expect(validateField([{ kind: "email", label: "El correo" }], "")).toBeNull();
    expect(validateField([{ kind: "phone", label: "El celular" }], "")).toBeNull();
  });

  it.each([
    ["docente@avend.pe", null],
    ["docente.uno+aula@avend.edu.pe", null],
    ["sin-arroba", "El correo electrónico no es válido."],
    ["dos@@avend.pe", "El correo electrónico no es válido."],
    ["falta@dominio", "El correo electrónico no es válido."],
  ])("judges the address %s", (value, expected) => {
    expect(validateField([{ kind: "email", label: "El correo" }], value)).toBe(
      expected,
    );
  });

  it.each([
    ["987654321", true],
    ["+51 987 654 321", true],
    ["987-654-321", true],
    ["12345", false],
    ["novecientos", false],
  ])("judges the phone %s", (value, valid) => {
    const error = validateField([{ kind: "phone", label: "El celular" }], value);
    expect(error === null).toBe(valid);
  });

  it("names the field that has to change when the dates are out of order", () => {
    const rules: FieldRules = {
      end: [
        {
          kind: "dateOrder",
          label: "La fecha de fin",
          startField: "start",
          startLabel: "La fecha de inicio",
        },
      ],
    };

    expect(
      validateValues(rules, { end: "2026-01-01", start: "2026-06-01" }).end,
    ).toBe("La fecha de fin debe ser igual o posterior a la fecha de inicio.");
    expect(
      validateValues(rules, { end: "2026-06-01", start: "2026-01-01" }).end,
    ).toBeUndefined();
    expect(validateValues(rules, { end: "2026-06-01", start: "2026-06-01" })).toEqual({});
  });

  it("does not complain about the order while the start date is empty", () => {
    const rules: FieldRules = {
      end: [
        {
          kind: "dateOrder",
          label: "La fecha de fin",
          startField: "start",
          startLabel: "La fecha de inicio",
        },
      ],
    };

    expect(validateValues(rules, { end: "2026-01-01", start: "" })).toEqual({});
  });

  it("rejects a file by extension and by size, in that order", () => {
    const rule = {
      accept: [".pdf"],
      kind: "file" as const,
      label: "El archivo",
      maxBytes: 1024,
    };

    const wrongType = new File(["x"], "hoja.docx", { type: "application/msword" });
    expect(validateField([rule], wrongType)).toBe(
      "El archivo debe ser un PDF válido.",
    );

    const tooBig = new File([new Uint8Array(2048)], "norma.pdf", {
      type: "application/pdf",
    });
    expect(validateField([rule], tooBig)).toBe(
      "El archivo supera el máximo de 1 KB.",
    );

    const fine = new File(["x"], "norma.PDF", { type: "application/pdf" });
    expect(validateField([rule], fine)).toBeNull();
  });

  it("returns only the first complaint about a field", () => {
    expect(
      validateField(
        [
          { kind: "required", label: "El código" },
          {
            kind: "pattern",
            label: "El código",
            message: "El código no tiene el formato esperado.",
            regexp: /^[A-Z]+$/u,
          },
        ],
        "",
      ),
    ).toBe("El código es obligatorio.");
  });
});

describe("validateFormData", () => {
  it.each(["[]", "null", "42", "{invalid"])("rejects non-object JSON %s at the metadata field", (value) => {
    const formData = new FormData();
    formData.set("metadata", value);
    expect(validateFormData({ metadata: [{ kind: "jsonObject", label: "Los metadatos" }] }, formData))
      .toEqual({ metadata: "Los metadatos: ingresa un objeto JSON válido." });
  });

  it.each(["", '{"keywords": "docencia"}'])("accepts optional object metadata %s", (value) => {
    const formData = new FormData();
    formData.set("metadata", value);
    expect(validateFormData({ metadata: [{ kind: "jsonObject", label: "Los metadatos" }] }, formData)).toEqual({});
  });
  it("marks every failing field, not just the first one", () => {
    const formData = new FormData();
    formData.set("email", "no-es-correo");
    formData.set("fullName", "");

    const errors = validateFormData(
      {
        email: [{ kind: "email", label: "El correo" }],
        fullName: [{ kind: "required", label: "El nombre" }],
      },
      formData,
    );

    expect(Object.keys(errors).sort()).toEqual(["email", "fullName"]);
    expect(hasErrors(errors)).toBe(true);
  });

  /**
   * Un input de archivo sin selección envía un `File` vacío. Si se tomara como
   * un valor presente, un adjunto opcional se validaría como si existiera.
   */
  it("treats an untouched file input as no value at all", () => {
    const formData = new FormData();
    formData.set("file", new File([], ""));

    expect(valuesFromFormData(formData).file).toBeNull();
    expect(
      validateFormData(
        {
          file: [
            {
              accept: [".pdf"],
              kind: "file",
              label: "El archivo",
              maxBytes: 10,
            },
          ],
        },
        formData,
      ),
    ).toEqual({});
  });
});

describe("formatFileSize", () => {
  it("reads the limit the way the person writing it would say it", () => {
    expect(formatFileSize(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatFileSize(1536 * 1024)).toBe("1.5 MB");
    expect(formatFileSize(2048)).toBe("2 KB");
  });
});
