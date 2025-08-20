/**
 * Example: How to use SubscriptionGuard in your controllers
 *
 * This file demonstrates various ways to protect routes with subscription requirements
 */

import { Controller, Get, Post, UseGuards, Body, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  SubscriptionGuard,
  RequireSubscription,
  UsageLimitGuard,
} from '../guards/subscription.guard';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Example')
@Controller('example')
@UseGuards(JwtAuthGuard) // Always require authentication first
@ApiBearerAuth()
export class ExampleController {
  // Example 1: Free feature - no subscription required
  @Get('free-feature')
  async freeFeature(@CurrentUser() user: User) {
    return {
      message: 'This feature is available to all users',
      userId: user.id,
    };
  }

  // Example 2: Basic feature - requires any paid subscription
  @Get('basic-feature')
  @UseGuards(SubscriptionGuard)
  @RequireSubscription(
    SubscriptionPlan.BASIC,
    SubscriptionPlan.PREMIUM,
    SubscriptionPlan.ENTERPRISE,
  )
  async basicFeature(@CurrentUser() user: User) {
    return {
      message: 'This feature requires a paid subscription',
      userId: user.id,
    };
  }

  // Example 3: Premium feature - requires premium or enterprise
  @Get('premium-feature')
  @UseGuards(SubscriptionGuard)
  @RequireSubscription(SubscriptionPlan.PREMIUM, SubscriptionPlan.ENTERPRISE)
  async premiumFeature(@CurrentUser() user: User) {
    return {
      message: 'This feature requires a premium subscription or higher',
      userId: user.id,
    };
  }

  // Example 4: Enterprise-only feature
  @Get('enterprise-feature')
  @UseGuards(SubscriptionGuard)
  @RequireSubscription(SubscriptionPlan.ENTERPRISE)
  async enterpriseFeature(@CurrentUser() user: User) {
    return {
      message: 'This feature is only available to enterprise customers',
      userId: user.id,
    };
  }

  // Example 5: Check usage limits before allowing action
  @Post('create-library')
  @UseGuards(SubscriptionGuard, UsageLimitGuard)
  @RequireSubscription(
    SubscriptionPlan.BASIC,
    SubscriptionPlan.PREMIUM,
    SubscriptionPlan.ENTERPRISE,
  )
  async createLibrary(
    @CurrentUser() _user: User,
    @Body() _createLibraryDto: { name: string; description?: string },
    @Request() req: any,
  ) {
    // The UsageLimitGuard will add subscriptionLimits to the request
    const limits = req.subscriptionLimits;

    // Check if user has reached library limit
    if (limits.maxLibraries !== -1) {
      // Check current library count (this would be implemented in your service)
      // const currentLibraryCount = await this.libraryService.getUserLibraryCount(user.id);
      // if (currentLibraryCount >= limits.maxLibraries) {
      //   throw new ForbiddenException(`You have reached the maximum number of libraries (${limits.maxLibraries}) for your plan`);
      // }
    }

    return {
      message: 'Library created successfully',
      limits,
    };
  }

  // Example 6: Class-level subscription requirement
  // All methods in this class would require premium subscription
}

@Controller('premium-only')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@RequireSubscription(SubscriptionPlan.PREMIUM, SubscriptionPlan.ENTERPRISE)
@ApiBearerAuth()
export class PremiumOnlyController {
  @Get('analytics')
  async getAnalytics(@CurrentUser() user: User) {
    return {
      message: 'Advanced analytics data',
      userId: user.id,
    };
  }

  @Get('api-access')
  async getApiAccess(@CurrentUser() user: User) {
    return {
      message: 'API access credentials',
      userId: user.id,
    };
  }
}

/**
 * Usage in your main application:
 *
 * 1. Import the SubscriptionModule in your app module
 * 2. Use the guards in your controllers as shown above
 * 3. The guard will automatically check subscription status
 * 4. Users will receive appropriate error messages if they don't have access
 *
 * Error responses:
 * - 401: User not authenticated
 * - 403: No subscription found / Subscription not active / Plan not sufficient
 *
 * The guard also adds subscription information to the request object:
 * - request.subscription: Full subscription details
 * - request.subscriptionLimits: Usage limits for the current plan
 */

/**
 * Testing with curl:
 *
 * # Get JWT token first
 * curl -X POST http://localhost:3000/auth/login \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"user@example.com","password":"password"}'
 *
 * # Use token to access protected endpoint
 * curl -X GET http://localhost:3000/example/premium-feature \
 *   -H "Authorization: Bearer YOUR_JWT_TOKEN"
 *
 * # Expected responses:
 * # - 200: Success with subscription
 * # - 403: Subscription required or insufficient plan
 */
