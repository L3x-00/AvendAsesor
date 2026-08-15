export type AdminActionState = {
  downloadUrl?: string;
  message?: string;
  status: 'error' | 'idle' | 'success';
};

export const initialAdminActionState: AdminActionState = {
  status: 'idle',
};
