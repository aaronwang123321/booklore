import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from '@prisma/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: vi.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockExecutionContext = (user: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as any;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access when no roles are required', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(undefined);

    const context = createMockExecutionContext({ role: Role.USER });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow access when user has required role', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue([Role.ADMIN]);

    const context = createMockExecutionContext({ role: Role.ADMIN });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should deny access when user does not have required role', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue([Role.ADMIN]);

    const context = createMockExecutionContext({ role: Role.USER });
    const result = guard.canActivate(context);

    expect(result).toBe(false);
  });

  it('should deny access when user is not present', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue([Role.USER]);

    const context = createMockExecutionContext(null);
    const result = guard.canActivate(context);

    expect(result).toBe(false);
  });

  it('should allow access when user has one of multiple required roles', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue([Role.ADMIN, Role.USER]);

    const context = createMockExecutionContext({ role: Role.USER });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });
});