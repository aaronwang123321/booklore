import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class AttachPaymentMethodDto {
  @ApiProperty({
    description: 'Payment method ID from Stripe',
    example: 'pm_1234567890',
  })
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @ApiProperty({
    description: 'Set as default payment method',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class SetDefaultPaymentMethodDto {
  @ApiProperty({
    description: 'Payment method ID to set as default',
    example: 'pm_1234567890',
  })
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;
}

export class ApplyCouponDto {
  @ApiProperty({
    description: 'Coupon ID to apply',
    example: 'SAVE20',
  })
  @IsString()
  @IsNotEmpty()
  couponId: string;
}
