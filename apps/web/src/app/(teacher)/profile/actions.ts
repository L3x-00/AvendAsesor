"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveSignInPath } from "@/lib/auth/session-redirect";
import { EMAIL_CHANGE_RETURN_PATH, getAuthRedirectUrl } from "@/lib/auth/site-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasErrors, validateValues } from "@/lib/ui/field-validation";
import {
  CONTACT_DATA_RULES,
  EMAIL_CHANGE_RULES,
  PERSONAL_DATA_RULES,
  type ProfileActionState,
} from "./profile-form-state";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

/** Misma convención que el resto del panel docente: sin sesión, al login. */
async function redirectToSignIn(): Promise<never> {
  redirect(await resolveSignInPath());
}

const SAVE_FAILED = "No pudimos guardar tus datos. Inténtalo nuevamente.";

/**
 * Códigos que `public.update_own_profile` devuelve en `error.message`. Los de
 * validación se muestran debajo del campo que los causó.
 */
const PROFILE_FIELD_ERRORS: Record<string, { field: string; message: string }> = {
  invalid_city: { field: "city", message: "La ciudad debe tener entre 2 y 120 caracteres." },
  invalid_department: {
    field: "department",
    message: "El departamento debe tener entre 2 y 120 caracteres.",
  },
  invalid_full_name: {
    field: "fullName",
    message: "El nombre completo debe tener entre 2 y 160 caracteres.",
  },
  invalid_phone: { field: "phone", message: "El celular debe tener entre 6 y 20 caracteres." },
};

const PROFILE_GENERAL_ERRORS: Record<string, string> = {
  name_managed_by_admin:
    "En las cuentas administrativas, el nombre lo gestiona la administración. No se guardó ningún cambio.",
  profile_inactive:
    "Tu cuenta no está activa o su vigencia terminó, así que no podemos guardar cambios. Comunícate con la administración.",
};

export async function saveProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  // Las cuentas administrativas no envían el nombre: lo gestiona la
  // administración y la RPC conserva el guardado cuando llega vacío.
  const nameSubmitted = formData.has("fullName");
  const values = {
    city: optionalText(formData, "city"),
    department: optionalText(formData, "department"),
    fullName: nameSubmitted ? text(formData, "fullName") : null,
    phone: optionalText(formData, "phone"),
  };

  const fieldErrors = validateValues(
    nameSubmitted ? PERSONAL_DATA_RULES : CONTACT_DATA_RULES,
    values,
  );
  if (hasErrors(fieldErrors)) {
    return { fieldErrors, status: "error" };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return redirectToSignIn();

  // La escritura pasa por la RPC: valida rol, estado y vigencia en la base y
  // solo toca estas cuatro columnas del propio registro.
  const { error } = await supabase.rpc("update_own_profile", {
    p_city: values.city,
    p_department: values.department,
    p_full_name: values.fullName,
    p_phone: values.phone,
  });

  if (error) {
    const code = typeof error.message === "string" ? error.message.trim() : "";
    if (code === "not_authenticated") return redirectToSignIn();

    const fieldError = PROFILE_FIELD_ERRORS[code];
    if (fieldError && (fieldError.field !== "fullName" || nameSubmitted)) {
      return { fieldErrors: { [fieldError.field]: fieldError.message }, status: "error" };
    }

    return { message: PROFILE_GENERAL_ERRORS[code] ?? SAVE_FAILED, status: "error" };
  }

  revalidatePath("/profile");
  return { message: "Tus datos se guardaron correctamente.", status: "success" };
}

const EMAIL_FIELD_ERRORS: Record<string, string> = {
  email_address_invalid: "Ese correo no es válido. Revisa que esté bien escrito.",
  email_exists:
    "Ese correo ya pertenece a otra cuenta. Usa otro correo o pide ayuda a la administración.",
  user_already_exists:
    "Ese correo ya pertenece a otra cuenta. Usa otro correo o pide ayuda a la administración.",
  validation_failed: "Ese correo no es válido. Revisa que esté bien escrito.",
};

const EMAIL_GENERAL_ERRORS: Record<string, string> = {
  email_address_not_authorized:
    "Por ahora no podemos enviar correos a esa dirección. Pide ayuda a la administración.",
  over_email_send_rate_limit:
    "Ya enviamos correos hace poco. Espera unos minutos antes de volver a intentarlo.",
  over_request_rate_limit:
    "Hiciste varios intentos seguidos. Espera unos minutos antes de volver a intentarlo.",
};

const EXPIRED_SESSION_CODES = new Set(["bad_jwt", "no_authorization", "session_expired", "session_not_found"]);

export async function changeProfileEmailAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const email = text(formData, "email").toLocaleLowerCase("en-US");
  const fieldErrors = validateValues(EMAIL_CHANGE_RULES, { email });
  if (hasErrors(fieldErrors)) {
    return { fieldErrors, status: "error" };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return redirectToSignIn();

  if (userData.user.email?.toLocaleLowerCase("en-US") === email) {
    return {
      fieldErrors: {
        email: "Ese ya es tu correo de acceso. Escribe el correo nuevo que quieres usar.",
      },
      status: "error",
    };
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: getAuthRedirectUrl(`/auth/callback?next=${EMAIL_CHANGE_RETURN_PATH}`) },
  );

  if (error) {
    const code = typeof error.code === "string" ? error.code : "";
    if (EXPIRED_SESSION_CODES.has(code)) return redirectToSignIn();
    if (EMAIL_FIELD_ERRORS[code]) {
      return { fieldErrors: { email: EMAIL_FIELD_ERRORS[code] }, status: "error" };
    }
    return {
      message:
        EMAIL_GENERAL_ERRORS[code] ??
        "No pudimos solicitar el cambio de correo. Inténtalo nuevamente en unos minutos.",
      status: "error",
    };
  }

  // La página vuelve a leer el usuario y muestra el cambio pendiente.
  revalidatePath("/profile");
  return {
    message: `Listo. Enviamos un enlace a tu correo actual y otro a ${email}. Abre los dos en este mismo navegador, sin cerrar sesión, para terminar el cambio.`,
    status: "success",
  };
}
