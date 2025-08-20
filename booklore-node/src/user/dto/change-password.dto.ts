import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class ChangeUserPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword: string;
}
