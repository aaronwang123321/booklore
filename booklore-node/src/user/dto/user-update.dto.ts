import { IsEmail, IsOptional, IsString, IsEnum, IsArray, IsInt } from 'class-validator';
import { Role } from '@prisma/client';

export class UserUpdateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assignedLibraries?: number[];
}
