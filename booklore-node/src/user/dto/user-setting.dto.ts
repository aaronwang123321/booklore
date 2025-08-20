import { IsString } from 'class-validator';

export class UpdateUserSettingDto {
  @IsString()
  key: string;

  @IsString()
  value: string;
}
