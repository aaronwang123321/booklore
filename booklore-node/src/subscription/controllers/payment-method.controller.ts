import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { PaymentMethodService } from '../services/payment-method.service';
import { StripeService } from '../services/stripe.service';
import {
  AttachPaymentMethodDto,
  SetDefaultPaymentMethodDto,
  ApplyCouponDto,
} from '../dto/payment-method.dto';

class CreateSetupIntentDto {
  usage?: 'off_session' | 'on_session';
  metadata?: Record<string, string>;
}

@ApiTags('Payment Methods')
@Controller('payment-methods')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentMethodController {
  constructor(
    private readonly paymentMethodService: PaymentMethodService,
    private readonly stripeService: StripeService,
  ) {}

  @Post('setup-intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create setup intent for adding payment methods' })
  @ApiBody({ type: CreateSetupIntentDto })
  @ApiResponse({ status: 200, description: 'Setup intent created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createSetupIntent(
    @CurrentUser() user: User,
    @Body() _createSetupIntentDto: CreateSetupIntentDto,
  ) {
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }

    const setupIntent = await this.paymentMethodService.createSetupIntent(user.id.toString());

    return setupIntent;
  }

  @Get()
  @ApiOperation({ summary: 'Get user payment methods' })
  @ApiResponse({ status: 200, description: 'Payment methods retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPaymentMethods(@CurrentUser() user: User) {
    if (!user.stripeCustomerId) {
      return {
        success: true,
        data: {
          paymentMethods: [],
          defaultPaymentMethodId: null,
        },
        message: 'No Stripe customer found',
      };
    }

    const paymentMethods = await this.paymentMethodService.getCustomerPaymentMethods(
      user.stripeCustomerId,
    );

    const result = await this.paymentMethodService.getDefaultPaymentMethod(user.id.toString());
    const defaultPaymentMethod = result.data?.paymentMethod;

    return {
      success: true,
      data: {
        paymentMethods: paymentMethods.map(pm => ({
          id: pm.id,
          type: pm.type,
          card: pm.card
            ? {
                brand: pm.card.brand,
                last4: pm.card.last4,
                expMonth: pm.card.exp_month,
                expYear: pm.card.exp_year,
              }
            : null,
          isDefault: pm.id === defaultPaymentMethod?.id,
          created: new Date(pm.created * 1000),
        })),
        defaultPaymentMethodId: defaultPaymentMethod?.id || null,
      },
    };
  }

  @Post('attach')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach payment method to customer' })
  @ApiBody({ type: AttachPaymentMethodDto })
  @ApiResponse({ status: 200, description: 'Payment method attached successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async attachPaymentMethod(
    @CurrentUser() user: User,
    @Body() attachPaymentMethodDto: AttachPaymentMethodDto,
  ) {
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }

    const { paymentMethodId, setAsDefault } = attachPaymentMethodDto;

    if (!paymentMethodId) {
      throw new BadRequestException('Payment method ID is required');
    }

    await this.paymentMethodService.attachPaymentMethod(user.id.toString(), paymentMethodId);

    if (setAsDefault) {
      await this.paymentMethodService.setDefaultPaymentMethod(user.id.toString(), paymentMethodId);
    }

    // Get the attached payment method details
    const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId);

    return {
      success: true,
      data: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expMonth: paymentMethod.card.exp_month,
              expYear: paymentMethod.card.exp_year,
            }
          : null,
      },
      message: 'Payment method attached successfully',
    };
  }

  @Delete(':paymentMethodId')
  @ApiOperation({ summary: 'Detach payment method from customer' })
  @ApiParam({ name: 'paymentMethodId', description: 'Payment method ID' })
  @ApiResponse({ status: 200, description: 'Payment method detached successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async detachPaymentMethod(
    @CurrentUser() user: User,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    if (!paymentMethodId) {
      throw new BadRequestException('Payment method ID is required');
    }

    // Verify payment method belongs to user
    const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId);
    if (paymentMethod.customer !== user.stripeCustomerId) {
      throw new BadRequestException('Payment method does not belong to user');
    }

    await this.paymentMethodService.detachPaymentMethod(paymentMethodId);

    return {
      success: true,
      message: 'Payment method detached successfully',
    };
  }

  @Post('set-default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set default payment method' })
  @ApiBody({ type: SetDefaultPaymentMethodDto })
  @ApiResponse({ status: 200, description: 'Default payment method set successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async setDefaultPaymentMethod(
    @CurrentUser() user: User,
    @Body() setDefaultPaymentMethodDto: SetDefaultPaymentMethodDto,
  ) {
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }

    const { paymentMethodId } = setDefaultPaymentMethodDto;

    if (!paymentMethodId) {
      throw new BadRequestException('Payment method ID is required');
    }

    // Verify payment method belongs to user
    const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId);
    if (paymentMethod.customer !== user.stripeCustomerId) {
      throw new BadRequestException('Payment method does not belong to user');
    }

    await this.paymentMethodService.setDefaultPaymentMethod(user.id.toString(), paymentMethodId);

    return {
      success: true,
      message: 'Default payment method set successfully',
    };
  }

  @Get('default')
  @ApiOperation({ summary: 'Get default payment method' })
  @ApiResponse({ status: 200, description: 'Default payment method retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDefaultPaymentMethod(@CurrentUser() user: User) {
    return await this.paymentMethodService.getDefaultPaymentMethod(user.id.toString());
  }

  @Post('apply-coupon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply coupon to customer' })
  @ApiBody({ type: ApplyCouponDto })
  @ApiResponse({ status: 200, description: 'Coupon applied successfully' })
  @ApiResponse({ status: 400, description: 'Invalid coupon' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async applyCoupon(@CurrentUser() user: User, @Body() applyCouponDto: ApplyCouponDto) {
    if (!user?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }

    const { couponId } = applyCouponDto;

    if (!couponId) {
      throw new BadRequestException('Coupon ID is required');
    }

    // Validate coupon first
    const coupon = await this.stripeService.validateCoupon(couponId);

    if (!coupon) {
      throw new BadRequestException('Invalid coupon');
    }

    // Apply coupon to customer
    await this.stripeService.applyCouponToCustomer(user.stripeCustomerId, couponId);

    return {
      success: true,
      data: {
        couponId: coupon.id,
        name: coupon.name,
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off,
        currency: coupon.currency,
      },
      message: 'Coupon applied successfully',
    };
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove coupon from customer' })
  @ApiResponse({ status: 200, description: 'Coupon removed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeCoupon(@CurrentUser() user: User) {
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }

    await this.stripeService.removeCouponFromCustomer(user.stripeCustomerId);

    return {
      success: true,
      message: 'Coupon removed successfully',
    };
  }
}
