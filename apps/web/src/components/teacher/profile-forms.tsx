"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { changeProfileEmailAction, saveProfileAction } from "@/app/(teacher)/profile/actions";
import {
  CONTACT_DATA_RULES,
  EMAIL_CHANGE_RULES,
  PERSONAL_DATA_RULES,
  departmentOptions,
  initialProfileActionState,
} from "@/app/(teacher)/profile/profile-form-state";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { ValidatedForm } from "@/components/ui/validated-form";
import type { ChatRole } from "@/lib/authorization/policy";

interface ProfileFormsProps {
  city: string | null;
  department: string | null;
  email: string;
  fullName: string;
  /** Correo nuevo que aún espera confirmación (`user.new_email`). */
  pendingEmail?: string | null;
  phone: string | null;
  role: ChatRole;
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-busy={pending || undefined}
      className="avend-button avend-button--primary"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ProfileForms({
  city,
  department,
  email,
  fullName,
  pendingEmail = null,
  phone,
  role,
}: ProfileFormsProps) {
  const { showToast } = useToast();
  const [profileState, profileAction] = useActionState(saveProfileAction, initialProfileActionState);
  const [emailState, emailAction] = useActionState(changeProfileEmailAction, initialProfileActionState);
  const announcedProfile = useRef<typeof profileState | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  // El nombre de las cuentas administrativas lo fija la administración: es la
  // autoría que ven el historial de documentos y el directorio.
  const canEditName = role === "docente";

  useEffect(() => {
    if (profileState.status !== "success" || announcedProfile.current === profileState) return;
    announcedProfile.current = profileState;
    // Los dos formularios son independientes: si quedó un correo escrito sin
    // enviar, se avisa para que nadie crea que también se cambió.
    const unsentEmail = emailInput.current?.value.trim() ?? "";
    showToast(
      unsentEmail && unsentEmail.toLocaleLowerCase("en-US") !== email.toLocaleLowerCase("en-US")
        ? "Tus datos se guardaron. Tu correo no cambió: para cambiarlo, pulsa «Actualizar correo»."
        : (profileState.message ?? "Tus datos se guardaron correctamente."),
    );
  }, [email, profileState, showToast]);

  return (
    <div className="avend-profile-edit-grid">
      <section aria-labelledby="personal-data-title" className="avend-profile-edit-card">
        <div>
          <p className="avend-eyebrow">Información personal</p>
          <h2 id="personal-data-title">Tus datos</h2>
          <p>
            Actualiza tus datos de contacto. Los campos marcados con * son obligatorios; el resto
            es opcional.
          </p>
        </div>
        <ValidatedForm
          action={profileAction}
          className="avend-profile-form"
          rules={canEditName ? PERSONAL_DATA_RULES : CONTACT_DATA_RULES}
          serverErrors={profileState.fieldErrors}
          submissionState={profileState}
        >
          {canEditName ? (
            <FormField label="Nombre completo" name="fullName" required>
              <input
                autoComplete="name"
                className="avend-field"
                defaultValue={fullName}
                maxLength={160}
                name="fullName"
                required
              />
            </FormField>
          ) : (
            <div className="avend-form-field avend-profile-readonly">
              <p className="avend-field-label">Nombre completo</p>
              <p className="avend-profile-readonly-value">{fullName}</p>
              <p className="avend-field-hint">
                En las cuentas administrativas, el nombre lo gestiona la administración. Si hay que
                corregirlo, pídelo a la persona superadministradora.
              </p>
            </div>
          )}
          <FormField hint="Solo números, por ejemplo 987654321." label="Celular (opcional)" name="phone">
            <input
              autoComplete="tel"
              className="avend-field"
              defaultValue={phone ?? ""}
              inputMode="tel"
              maxLength={20}
              name="phone"
              placeholder="Ej.: 987654321"
              type="tel"
            />
          </FormField>
          <div className="avend-profile-form-row">
            <FormField label="Departamento (opcional)" name="department">
              <select
                autoComplete="address-level1"
                className="avend-field"
                defaultValue={department ?? ""}
                name="department"
              >
                <option value="">Sin especificar</option>
                {departmentOptions(department).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Ciudad (opcional)" name="city">
              <input
                autoComplete="address-level2"
                className="avend-field"
                defaultValue={city ?? ""}
                maxLength={120}
                name="city"
                placeholder="Ej.: Huancayo"
              />
            </FormField>
          </div>
          {profileState.status === "error" && profileState.message ? (
            <p className="avend-feedback avend-feedback--error" role="alert">{profileState.message}</p>
          ) : null}
          <div className="avend-profile-form-actions">
            <SubmitButton label="Guardar cambios" pendingLabel="Guardando…" />
          </div>
        </ValidatedForm>
      </section>

      <section aria-labelledby="access-email-title" className="avend-profile-edit-card">
        <div>
          <p className="avend-eyebrow">Acceso a la cuenta</p>
          <h2 id="access-email-title">Correo electrónico</h2>
          <p>
            Tu correo de acceso actual es <strong className="avend-profile-current-email">{email}</strong>.
          </p>
        </div>
        <div className="avend-profile-email-steps">
          <p>Para cambiarlo te enviaremos <strong>dos enlaces</strong>: uno a tu correo actual y otro al correo nuevo. Hacen falta los dos.</p>
          <ul>
            <li>Ábrelos en este mismo navegador y no cierres sesión hasta terminar.</li>
            <li>Si ya no tienes acceso a tu correo actual, pide el cambio a la administración.</li>
          </ul>
        </div>
        {pendingEmail ? (
          <p className="avend-profile-pending-email" role="note">
            Cambio pendiente: falta confirmar <strong>{pendingEmail}</strong>. Abre los enlaces que
            enviamos para terminar.
          </p>
        ) : null}
        <ValidatedForm
          action={emailAction}
          className="avend-profile-form"
          rules={EMAIL_CHANGE_RULES}
          serverErrors={emailState.fieldErrors}
          submissionState={emailState}
        >
          <FormField label="Correo nuevo" name="email" required>
            <input
              autoComplete="email"
              className="avend-field"
              defaultValue=""
              maxLength={254}
              name="email"
              placeholder="nombre@ejemplo.com"
              ref={emailInput}
              required
              type="email"
            />
          </FormField>
          {emailState.status === "error" && emailState.message ? (
            <p className="avend-feedback avend-feedback--error" role="alert">{emailState.message}</p>
          ) : null}
          {emailState.status === "success" && emailState.message ? (
            <p className="avend-feedback avend-feedback--success" role="status">{emailState.message}</p>
          ) : null}
          <div className="avend-profile-form-actions">
            <SubmitButton label="Actualizar correo" pendingLabel="Enviando…" />
          </div>
        </ValidatedForm>
      </section>
    </div>
  );
}
