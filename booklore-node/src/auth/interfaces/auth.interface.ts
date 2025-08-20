import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface UserDto {
  id: number;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
}

export interface AuthResult {
  user: UserDto;
  access_token: string;
  refresh_token: string;
}
