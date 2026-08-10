export type AuthFieldName =
  | 'email'
  | 'fullName'
  | 'password'
  | 'passwordConfirmation';

export interface AuthActionState {
  fieldErrors?: Partial<Record<AuthFieldName, string>>;
  message?: string;
  status: 'error' | 'idle' | 'success';
}

export const initialAuthActionState: AuthActionState = {
  status: 'idle',
};
