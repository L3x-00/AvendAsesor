import type { FieldErrors } from '@/lib/ui/field-validation';

export type AdminActionState = {
  downloadUrl?: string;
  /**
   * Errores atribuibles a un campo concreto. El formulario los pinta debajo de
   * su campo; `message` queda para lo que no pertenece a ninguno (fallo de red,
   * de permisos o de sesión).
   */
  fieldErrors?: FieldErrors;
  message?: string;
  status: 'error' | 'idle' | 'success';
};

export const initialAdminActionState: AdminActionState = {
  status: 'idle',
};
