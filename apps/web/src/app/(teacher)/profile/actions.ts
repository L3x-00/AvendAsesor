"use server";

import { revalidatePath } from "next/cache";
import { getAuthRedirectUrl } from "@/lib/auth/site-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FieldErrors } from "@/lib/ui/field-validation";

export interface ProfileActionState {
  fieldErrors?: FieldErrors;
  message?: string;
  status: "error" | "idle" | "success";
}

export const initialProfileActionState: ProfileActionState = { status: "idle" };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

export async function saveProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const fullName = text(formData, "fullName");
  const phone = optionalText(formData, "phone");
  const department = optionalText(formData, "department");
  const city = optionalText(formData, "city");
  const fieldErrors: FieldErrors = {};

  if (fullName.length < 2 || fullName.length > 160) {
    fieldErrors.fullName = "El nombre debe tener entre 2 y 160 caracteres.";
  }
  if (phone !== null && (phone.length < 6 || phone.length > 20)) {
    fieldErrors.phone = "El teléfono debe tener entre 6 y 20 caracteres.";
  }
  if (department !== null && (department.length < 2 || department.length > 120)) {
    fieldErrors.department = "El departamento debe tener entre 2 y 120 caracteres.";
  }
  if (city !== null && (city.length < 2 || city.length > 120)) {
    fieldErrors.city = "La ciudad debe tener entre 2 y 120 caracteres.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, status: "error" };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { message: "Tu sesión venció. Inicia sesión nuevamente.", status: "error" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      city,
      department,
      full_name: fullName,
      phone,
    })
    .eq("id", userData.user.id);

  if (error) {
    return {
      message: "No pudimos guardar tus datos. Inténtalo nuevamente.",
      status: "error",
    };
  }

  revalidatePath("/profile");
  return { message: "Tus datos se guardaron correctamente.", status: "success" };
}

export async function changeProfileEmailAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const email = text(formData, "email").toLocaleLowerCase("en-US");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return {
      fieldErrors: { email: "Ingresa un correo electrónico válido." },
      status: "error",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { message: "Tu sesión venció. Inicia sesión nuevamente.", status: "error" };
  }

  if (userData.user.email?.toLocaleLowerCase("en-US") === email) {
    return { message: "Este correo ya está asociado a tu cuenta.", status: "success" };
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: getAuthRedirectUrl("/auth/callback?next=/profile") },
  );

  if (error) {
    return {
      message: "No pudimos solicitar el cambio de correo. Revisa el dato e inténtalo nuevamente.",
      status: "error",
    };
  }

  return {
    message: "Revisa tu correo actual y el nuevo; confirma los enlaces recibidos para completar el cambio.",
    status: "success",
  };
}
