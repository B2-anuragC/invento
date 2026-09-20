export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AccessTokenPayload {
  sub: string;
  type: 'access';
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  exp: number;
}
