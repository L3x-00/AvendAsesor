export interface SupabaseAuthClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
    resetPasswordForEmail(
      email: string,
      options: { redirectTo: string },
    ): Promise<{ error: unknown }>;
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{ error: unknown }>;
    signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
    signUp(credentials: {
      email: string;
      options: {
        data: { full_name: string };
        emailRedirectTo: string;
      };
      password: string;
    }): Promise<{ error: unknown }>;
    updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
  };
}

export class AuthService {
  constructor(private readonly client: SupabaseAuthClient) {}

  async signUp(input: {
    email: string;
    emailRedirectTo: string;
    fullName: string;
    password: string;
  }): Promise<void> {
    await this.client.auth.signUp({
      email: input.email,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: input.emailRedirectTo,
      },
      password: input.password,
    });
  }

  async signIn(input: { email: string; password: string }): Promise<boolean> {
    const { error } = await this.client.auth.signInWithPassword(input);

    return !error;
  }

  async requestPasswordReset(input: {
    email: string;
    redirectTo: string;
  }): Promise<void> {
    await this.client.auth.resetPasswordForEmail(input.email, {
      redirectTo: input.redirectTo,
    });
  }

  async updatePassword(password: string): Promise<boolean> {
    const { data, error } = await this.client.auth.getUser();

    if (error || !data.user) {
      return false;
    }

    const update = await this.client.auth.updateUser({ password });

    return !update.error;
  }

  async signOut(): Promise<boolean> {
    const { error } = await this.client.auth.signOut({ scope: 'local' });

    return !error;
  }
}
