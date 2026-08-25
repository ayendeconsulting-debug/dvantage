import { Injectable, Inject } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AUTH_INSTANCE, type AuthInstance } from './auth.config';

/** Shape of the session object returned by better-auth. */
export interface AuthSession {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  ipAddress: string | null | undefined;
  userAgent: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape of the user object returned by better-auth. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  image: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionResult {
  session: AuthSession;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: AuthInstance) {}

  /**
   * Validate the session cookie / bearer token from a Fastify request.
   * Returns null if the request is unauthenticated or the session is expired.
   */
  async getSession(request: FastifyRequest): Promise<SessionResult | null> {
    // Convert Fastify headers to Web API Headers for better-auth
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      }
    }

    const result = await this.auth.api.getSession({ headers });
    if (!result) return null;

    return result as unknown as SessionResult;
  }
}
