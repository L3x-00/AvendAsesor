"use server";

import { redirect } from "next/navigation";
import { type AuthActionState } from "@/lib/auth/action-state";
import { AuthService } from "@/lib/auth/auth-service";
import { getAuthRedirectUrl } from "@/lib/auth/site-url";
import {
  parseAuthForm,
  passwordResetSchema,
  passwordUpdateSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function createAuthService(): Promise<AuthService> {
  return new AuthService(await createServerSupabaseClient());
}

export async function signUpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = parseAuthForm(signUpSchema, formData);

  if (!parsed.success) {
    return parsed.state;
  }

  const authService = await createAuthService();

  await authService.signUp({
    email: parsed.data.email,
    emailRedirectTo: getAuthRedirectUrl("/auth/callback?next=/auth/confirmed"),
    fullName: parsed.data.fullName,
    password: parsed.data.password,
  });

  return {
    message:
      "Si los datos fueron aceptados, recibirás un correo para confirmar tu cuenta.",
    status: "success",
  };
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = parseAuthForm(signInSchema, formData);

  if (!parsed.success) {
    return parsed.state;
  }

  const authService = await createAuthService();
  const signedIn = await authService.signIn(parsed.data);

  if (!signedIn) {
    return {
      message:
        "No se pudo iniciar sesión. Verifica tus credenciales e inténtalo nuevamente.",
      status: "error",
    };
  }

  redirect("/chat");
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = parseAuthForm(passwordResetSchema, formData);

  if (!parsed.success) {
    return parsed.state;
  }

  const authService = await createAuthService();

  await authService.requestPasswordReset({
    email: parsed.data.email,
    redirectTo: getAuthRedirectUrl("/auth/callback?next=/auth/update-password"),
  });

  return {
    message:
      "Si existe una cuenta asociada, recibirás instrucciones para restablecer tu contraseña.",
    status: "success",
  };
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = parseAuthForm(passwordUpdateSchema, formData);

  if (!parsed.success) {
    return parsed.state;
  }

  const authService = await createAuthService();
  const updated = await authService.updatePassword(parsed.data.password);

  if (!updated) {
    return {
      message:
        "El enlace no es válido o expiró. Solicita una nueva recuperación de contraseña.",
      status: "error",
    };
  }

  redirect("/auth/sign-in?password=updated");
}
