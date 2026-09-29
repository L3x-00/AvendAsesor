"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  changeProfileEmailAction,
  initialProfileActionState,
  saveProfileAction,
} from "@/app/(teacher)/profile/actions";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { ValidatedForm } from "@/components/ui/validated-form";

interface ProfileFormsProps {
  city: string | null;
  department: string | null;
  email: string;
  fullName: string;
  phone: string | null;
}
function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="avend-button avend-button--primary" disabled={pending} type="submit">
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function ProfileForms({ city, department, email, fullName, phone }: ProfileFormsProps) {
  const { showToast } = useToast();
  const [profileState, profileAction] = useActionState(saveProfileAction, initialProfileActionState);
  const [emailState, emailAction] = useActionState(changeProfileEmailAction, initialProfileActionState);
  const announcedProfile = useRef<typeof profileState | null>(null);
  const announcedEmail = useRef<typeof emailState | null>(null);

  useEffect(() => {
    if (profileState.status === "success" && announcedProfile.current !== profileState) {
      announcedProfile.current = profileState;
      showToast(profileState.message ?? "Tus datos se guardaron correctamente.");
    }
  }, [profileState, showToast]);

  useEffect(() => {
    if (emailState.status === "success" && announcedEmail.current !== emailState) {
      announcedEmail.current = emailState;
      showToast(emailState.message ?? "Solicitud enviada.");
    }
  }, [emailState, showToast]);

  return (
    <div className="avend-profile-edit-grid">
      <section aria-labelledby="personal-data-title" className="avend-profile-edit-card">
        <div>
          <p className="avend-eyebrow">Información personal</p>
          <h2 id="personal-data-title">Tus datos</h2>
          <p>Actualiza la información que ayuda a identificarte y contactarte.</p>
        </div>
        <ValidatedForm
          action={profileAction}
          className="avend-profile-form"
          rules={{}}
          serverErrors={profileState.fieldErrors}
          submissionState={profileState}
        >
          <FormField label="Nombre completo" name="fullName" required>
            <input className="avend-field" defaultValue={fullName} maxLength={160} minLength={2} name="fullName" required />
          </FormField>
          <div className="avend-profile-form-row">
            <FormField hint="Entre 6 y 20 caracteres." label="Teléfono" name="phone">
              <input autoComplete="tel" className="avend-field" defaultValue={phone ?? ""} maxLength={20} name="phone" type="tel" />
            </FormField>
            <FormField label="Departamento" name="department">
              <input autoComplete="address-level1" className="avend-field" defaultValue={department ?? ""} maxLength={120} name="department" />
            </FormField>
          </div>
          <FormField label="Ciudad" name="city">
            <input autoComplete="address-level2" className="avend-field" defaultValue={city ?? ""} maxLength={120} name="city" />
          </FormField>
          {profileState.status === "error" && profileState.message ? (
            <p className="avend-feedback avend-feedback--error" role="alert">{profileState.message}</p>
          ) : null}
          <div className="avend-profile-form-actions"><SaveButton label="Guardar cambios" /></div>
        </ValidatedForm>
      </section>

      <section aria-labelledby="access-email-title" className="avend-profile-edit-card">
        <div>
          <p className="avend-eyebrow">Acceso a la cuenta</p>
          <h2 id="access-email-title">Correo electrónico</h2>
          <p>Si cambias tu correo, recibirás un enlace para confirmarlo antes de usarlo.</p>
        </div>
        <ValidatedForm
          action={emailAction}
          className="avend-profile-form"
          rules={{}}
          serverErrors={emailState.fieldErrors}
          submissionState={emailState}
        >
          <FormField label="Correo de acceso" name="email" required>
            <input autoComplete="email" className="avend-field" defaultValue={email} maxLength={254} name="email" required type="email" />
          </FormField>
          {emailState.status === "error" && emailState.message ? (
            <p className="avend-feedback avend-feedback--error" role="alert">{emailState.message}</p>
          ) : null}
          {emailState.status === "success" && emailState.message ? (
            <p className="avend-feedback avend-feedback--success" role="status">{emailState.message}</p>
          ) : null}
          <div className="avend-profile-form-actions"><SaveButton label="Actualizar correo" /></div>
        </ValidatedForm>
      </section>
    </div>
  );
}
