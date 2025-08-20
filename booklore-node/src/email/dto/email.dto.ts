import {
  IsEmail,
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendBookByEmailDto {
  @ApiProperty({ description: 'Book ID to send' })
  @IsNumber()
  bookId: number;

  @ApiProperty({ description: 'List of recipient email addresses', type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  recipients: string[];

  @ApiProperty({ description: 'Optional message to include in email', required: false })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ description: 'Email subject', required: false })
  @IsOptional()
  @IsString()
  subject?: string;
}

export class CreateEmailProviderDto {
  @ApiProperty({ description: 'Provider name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'SMTP host' })
  @IsString()
  host: string;

  @ApiProperty({ description: 'SMTP port' })
  @IsNumber()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({ description: 'Use secure connection (TLS/SSL)' })
  @IsBoolean()
  secure: boolean;

  @ApiProperty({ description: 'SMTP username' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'SMTP password' })
  @IsString()
  password: string;

  @ApiProperty({ description: 'Set as default provider', required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateEmailProviderDto {
  @ApiProperty({ description: 'Provider name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'SMTP host', required: false })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiProperty({ description: 'SMTP port', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ description: 'Use secure connection (TLS/SSL)', required: false })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @ApiProperty({ description: 'SMTP username', required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ description: 'SMTP password', required: false })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({ description: 'Set as default provider', required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateEmailRecipientDto {
  @ApiProperty({ description: 'Recipient email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Recipient name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Set as default recipient', required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateEmailRecipientDto {
  @ApiProperty({ description: 'Recipient name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Set as default recipient', required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class TestEmailDto {
  @ApiProperty({ description: 'Test email recipient' })
  @IsEmail()
  recipient: string;

  @ApiProperty({ description: 'Email provider ID to test', required: false })
  @IsOptional()
  @IsNumber()
  providerId?: number;
}

export interface EmailJobData {
  bookId: number;
  recipients: string[];
  subject: string;
  message?: string;
  userId: number;
  providerId?: number;
}

export interface EmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentTo: string[];
  processingTime: number;
}
