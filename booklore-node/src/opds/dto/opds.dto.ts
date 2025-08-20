import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class OpdsSearchDto {
  @IsString()
  q: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CreateOpdsUserDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

export class UpdateOpdsUserDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  isActive?: boolean;
}
