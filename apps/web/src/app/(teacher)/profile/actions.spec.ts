import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthRedirectUrl } from "@/lib/auth/site-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  changeProfileEmailAction,
  initialProfileActionState,
  saveProfileAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/site-url", () => ({
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
};
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));

describe("profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.auth.getUser.mockResolvedValue({
      data: { user: { email: "docente@avend.test", id: "user-1" } },
      error: null,
    });
    client.auth.updateUser.mockResolvedValue({ error: null });
    eq.mockResolvedValue({ error: null });
    client.from.mockReturnValue({ update });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
  });

  it("validates personal data before contacting Supabase", async () => {
    const data = new FormData();
    data.set("fullName", "A");
    data.set("phone", "123");

    const result = await saveProfileAction(initialProfileActionState, data);

    expect(result.fieldErrors).toEqual({
      fullName: "El nombre debe tener entre 2 y 160 caracteres.",
      phone: "El teléfono debe tener entre 6 y 20 caracteres.",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("updates only the current profile through its RLS boundary", async () => {
    const data = new FormData();
    data.set("fullName", "  Rosa Docente  ");
    data.set("phone", "987654321");
    data.set("department", "Junín");
    data.set("city", "Huancayo");

    const result = await saveProfileAction(initialProfileActionState, data);

    expect(client.from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({
      city: "Huancayo",
      department: "Junín",
      full_name: "Rosa Docente",
      phone: "987654321",
    });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
    expect(result.status).toBe("success");
  });

  it("requests email confirmation without mixing it with profile data", async () => {
    const data = new FormData();
    data.set("email", "NUEVO@AVEND.TEST");

    const result = await changeProfileEmailAction(initialProfileActionState, data);

    expect(client.auth.updateUser).toHaveBeenCalledWith(
      { email: "nuevo@avend.test" },
      { emailRedirectTo: "https://avend.test/auth/callback?next=/profile" },
    );
    expect(getAuthRedirectUrl).toHaveBeenCalledWith("/auth/callback?next=/profile");
    expect(result.message).toMatch(/correo actual y el nuevo/i);
  });

  it("does not send a duplicate email-change request", async () => {
    const data = new FormData();
    data.set("email", "DOCENTE@AVEND.TEST");

    const result = await changeProfileEmailAction(initialProfileActionState, data);

    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: "Este correo ya está asociado a tu cuenta.",
      status: "success",
    });
  });
});
