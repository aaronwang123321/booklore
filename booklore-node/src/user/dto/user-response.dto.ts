import { Role } from '@prisma/client';

export class UserResponseDto {
  id: number;
  email: string;
  name?: string;
  avatar?: string;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  assignedLibraries?: number[];
}

export class UserListResponseDto {
  users: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
}
