import { Inject, Injectable } from '@nestjs/common';
import { API_PREFIX } from '@opshub/shared';
import { OAuth2Client } from 'google-auth-library';
import { ENV, type Env } from '../config/env';

export interface GoogleIdentity {
  email: string;
  name: string | undefined;
}

export type GoogleLoginFailure = 'email_unverified' | 'domain_not_allowed' | 'token_invalid';

/** Google Workspace sign-in (PRD NFR, Hosting guide 5). Only the SySpree domains are accepted. */
@Injectable()
export class GoogleOidcService {
  private readonly client: OAuth2Client | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client =
      env.AUTH_MODE === 'google'
        ? new OAuth2Client({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Served through the app origin (ALB in prod, Next rewrite locally) so the cookie is first-party.
            redirectUri: `${env.APP_URL.replace(/\/$/, '')}/${API_PREFIX}/auth/callback`,
          })
        : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  authUrl(state: string): string {
    return this.require().generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
      // A hint only; the domain is enforced on the verified token below.
      hd: this.env.GOOGLE_ALLOWED_DOMAINS.length === 1 ? this.env.GOOGLE_ALLOWED_DOMAINS[0] : undefined,
    });
  }

  async exchange(code: string): Promise<GoogleIdentity | GoogleLoginFailure> {
    const client = this.require();
    try {
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) return 'token_invalid';
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p?.email) return 'token_invalid';
      if (!p.email_verified) return 'email_unverified';
      const domain = (p.hd ?? p.email.split('@')[1] ?? '').toLowerCase();
      if (!this.env.GOOGLE_ALLOWED_DOMAINS.includes(domain)) return 'domain_not_allowed';
      return { email: p.email.toLowerCase(), name: p.name };
    } catch {
      return 'token_invalid';
    }
  }

  private require(): OAuth2Client {
    if (!this.client) throw new Error('Google sign-in is not enabled (AUTH_MODE=google)');
    return this.client;
  }
}
