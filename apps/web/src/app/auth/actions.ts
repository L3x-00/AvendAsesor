"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type AuthActionState } from "@/lib/auth/action-state";
import { AuthService } from "@/lib/auth/auth-service";
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from "@/lib/authorization/resolve-admin-access";
import {
  REMEMBER_COOKIE,
  sessionPreferenceCookies,
} from "@/lib/auth/session-preferences";
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

  // La preferencia se fija ANTES de iniciar sesión: el cliente de Supabase la
  // lee al emitir sus cookies para decidir si sobreviven al cierre del navegador.
  // La marca de sesión, en cambio, solo tras un inicio correcto.
  const cookieStore = await cookies();
  const previousRemember = cookieStore.get(REMEMBER_COOKIE)?.value;
  const [rememberCookie, markerCookie] = sessionPreferenceCookies(
    formData.get("remember") === "on",
    process.env.NODE_ENV === "production",
  );
  cookieStore.set(rememberCookie.name, rememberCookie.value, rememberCookie.options);

  const authService = await createAuthService();
  const signedIn = await authService.signIn(parsed.data);

  if (signedIn) {
    cookieStore.set(markerCookie.name, markerCookie.value, markerCookie.options);
  } else {
    // Un intento fallido no debe cambiar cómo persiste una sesión existente.
    if (previousRemember === undefined) cookieStore.delete(REMEMBER_COOKIE);
    else cookieStore.set(REMEMBER_COOKIE, previousRemember, rememberCookie.options);
  }

  if (!signedIn) {
    return {
      message:
        "No se pudo iniciar sesión. Verifica tus credenciales e inténtalo nuevamente.",
      status: "error",
    };
  }

  // Aterrizaje por rol: admin y superadmin entran al panel; el docente al chat.
  // La autoridad sigue siendo server-side en cada ruta; esto solo dirige el
  // destino inicial. Ante cualquier duda, se cae al chat (el destino más acotado).
  const supabase = await createServerSupabaseClient();
  const access = await resolveAdminAccess(
    supabase as unknown as AuthorizationSupabaseClient,
  );

  redirect(access.status === "authorized" ? "/admin" : "/chat");
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
