export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  sessionVersion?: number;
}

export interface AccessTokenPayload {
  sub: string;
  type: 'access';
  sv?: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  sv?: number;
  exp: number;
}
