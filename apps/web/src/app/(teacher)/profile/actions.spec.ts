import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthRedirectUrl } from "@/lib/auth/site-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { changeProfileEmailAction, saveProfileAction } from "./actions";
import { initialProfileActionState } from "./profile-form-state";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session-redirect", () => ({
  resolveSignInPath: vi.fn(async () => "/auth/sign-in?sesion=caducada"),
}));
vi.mock("@/lib/auth/site-url", () => ({
  EMAIL_CHANGE_RETURN_PATH: "/profile",
  getAuthRedirectUrl: vi.fn(() => "https://avend.test/auth/callback?next=/profile"),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const client = {
  auth: {
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

function profileForm(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.auth.getUser.mockResolvedValue({
      data: { user: { email: "docente@avend.test", id: "user-1" } },
      error: null,
    });
    client.auth.updateUser.mockResolvedValue({ error: null });
    client.rpc.mockResolvedValue({ data: null, error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
  });

  describe("saveProfileAction", () => {
    it("valida en el servidor antes de contactar Supabase", async () => {
      const result = await saveProfileAction(
        initialProfileActionState,
        profileForm({ fullName: "A", phone: "no tengo celular" }),
      );

      expect(result.status).toBe("error");
      expect(result.fieldErrors?.fullName).toMatch(/nombre completo/i);
      expect(result.fieldErrors?.phone).toMatch(/solo dígitos/i);
      expect(createServerSupabaseClient).not.toHaveBeenCalled();
    });

    it("guarda mediante la RPC update_own_profile, nunca con un UPDATE directo", async () => {
      const result = await saveProfileAction(
        initialProfileActionState,
        profileForm({
          city: "  Huancayo ",
          department: "Junín",
          fullName: "  Rosa Docente  ",
          phone: "987654321",
        }),
      );

      expect(client.rpc).toHaveBeenCalledWith("update_own_profile", {
        p_city: "Huancayo",
        p_department: "Junín",
        p_full_name: "Rosa Docente",
        p_phone: "987654321",
      });
      expect(client.from).not.toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith("/profile");
      expect(result).toEqual({ message: "Tus datos se guardaron correctamente.", status: "success" });
    });

    it("convierte los opcionales vacíos en null", async () => {
      await saveProfileAction(
        initialProfileActionState,
        profileForm({ city: " ", department: "", fullName: "Rosa Docente", phone: "" }),
      );

      expect(client.rpc).toHaveBeenCalledWith("update_own_profile", {
        p_city: null,
        p_department: null,
        p_full_name: "Rosa Docente",
        p_phone: null,
      });
    });

    it("las cuentas administrativas no envían nombre: solo sus datos de contacto", async () => {
      const result = await saveProfileAction(
        initialProfileActionState,
        profileForm({ city: "Lima", department: "Lima", phone: "987654321" }),
      );

      expect(client.rpc).toHaveBeenCalledWith("update_own_profile", {
        p_city: "Lima",
        p_department: "Lima",
        p_full_name: null,
        p_phone: "987654321",
      });
      expect(result.status).toBe("success");
    });

    it.each([
      ["invalid_full_name", "fullName", /nombre completo/i],
      ["invalid_phone", "phone", /celular/i],
      ["invalid_department", "department", /departamento/i],
      ["invalid_city", "city", /ciudad/i],
    ])("muestra %s debajo del campo %s", async (code, field, message) => {
      client.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: code } });

      const result = await saveProfileAction(
        initialProfileActionState,
        profileForm({ city: "Lima", department: "Lima", fullName: "Rosa Docente", phone: "987654321" }),
      );

      expect(result.status).toBe("error");
      expect(result.fieldErrors?.[field]).toMatch(message);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it.each([
      ["name_managed_by_admin", /lo gestiona la administración/i],
      ["profile_inactive", /no está activa/i],
      ["otro_error", /no pudimos guardar tus datos/i],
    ])("traduce %s a un mensaje amable", async (code, message) => {
      client.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: code } });

      const result = await saveProfileAction(
        initialProfileActionState,
        profileForm({ fullName: "Rosa Docente" }),
      );

      expect(result.status).toBe("error");
      expect(result.message).toMatch(message);
      expect(result.message).not.toContain(code);
    });

    it("sin sesión lleva al inicio de sesión con el aviso de sesión caducada", async () => {
      client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "jwt expired" } });

      await expect(
        saveProfileAction(initialProfileActionState, profileForm({ fullName: "Rosa Docente" })),
      ).rejects.toThrow("NEXT_REDIRECT:/auth/sign-in?sesion=caducada");
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it("si la RPC responde not_authenticated también lleva al inicio de sesión", async () => {
      client.rpc.mockResolvedValue({ data: null, error: { code: "28000", message: "not_authenticated" } });

      await expect(
        saveProfileAction(initialProfileActionState, profileForm({ fullName: "Rosa Docente" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expect(redirect).toHaveBeenCalledWith("/auth/sign-in?sesion=caducada");
    });
  });

  describe("changeProfileEmailAction", () => {
    it("pide la confirmación y explica los dos enlaces", async () => {
      const result = await changeProfileEmailAction(
        initialProfileActionState,
        profileForm({ email: "NUEVO@AVEND.TEST" }),
      );

      expect(client.auth.updateUser).toHaveBeenCalledWith(
        { email: "nuevo@avend.test" },
        { emailRedirectTo: "https://avend.test/auth/callback?next=/profile" },
      );
      expect(getAuthRedirectUrl).toHaveBeenCalledWith("/auth/callback?next=/profile");
      expect(result.status).toBe("success");
      expect(result.message).toMatch(/correo actual y otro a nuevo@avend\.test/i);
      expect(result.message).toMatch(/mismo navegador, sin cerrar sesión/i);
      expect(revalidatePath).toHaveBeenCalledWith("/profile");
    });

    it("no envía nada si es el mismo correo y lo dice junto al campo", async () => {
      const result = await changeProfileEmailAction(
        initialProfileActionState,
        profileForm({ email: "DOCENTE@AVEND.TEST" }),
      );

      expect(client.auth.updateUser).not.toHaveBeenCalled();
      expect(result.status).toBe("error");
      expect(result.fieldErrors?.email).toMatch(/ya es tu correo de acceso/i);
    });

    it("valida el formato en el servidor", async () => {
      const result = await changeProfileEmailAction(
        initialProfileActionState,
        profileForm({ email: "sin-arroba" }),
      );

      expect(result.fieldErrors?.email).toBeDefined();
      expect(createServerSupabaseClient).not.toHaveBeenCalled();
    });

    it.each([
      ["email_exists", "email", /otra cuenta/i],
      ["over_email_send_rate_limit", null, /espera unos minutos/i],
      ["unexpected_failure", null, /no pudimos solicitar el cambio/i],
    ])("traduce el error de Auth %s", async (code, field, message) => {
      client.auth.updateUser.mockResolvedValue({ error: { code, message: "raw" } });

      const result = await changeProfileEmailAction(
        initialProfileActionState,
        profileForm({ email: "nuevo@avend.test" }),
      );

      expect(result.status).toBe("error");
      if (field) expect(result.fieldErrors?.[field]).toMatch(message);
      else expect(result.message).toMatch(message);
    });

    it("con la sesión vencida lleva al inicio de sesión", async () => {
      client.auth.updateUser.mockResolvedValue({ error: { code: "session_not_found", message: "raw" } });

      await expect(
        changeProfileEmailAction(initialProfileActionState, profileForm({ email: "nuevo@avend.test" })),
      ).rejects.toThrow("NEXT_REDIRECT:/auth/sign-in?sesion=caducada");
    });
  });
});
