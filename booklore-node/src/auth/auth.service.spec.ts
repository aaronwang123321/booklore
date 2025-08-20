import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../shared/database/prisma.service';
import { Role } from '@prisma/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock bcrypt
vi.mock('bcrypt');
const mockedBcrypt = vi.mocked(bcrypt);

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashedPassword',
    role: Role.USER,
    isActive: true,
    emailVerified: false,
    stripeCustomerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    avatar: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: vi.fn(),
              create: vi.fn(),
              update: vi.fn(),
            },
            refreshToken: {
              findUnique: vi.fn(),
              create: vi.fn(),
              delete: vi.fn(),
              deleteMany: vi.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('hashedPassword' as never);
      vi.mocked(prismaService.user.create).mockResolvedValue(mockUser);
      vi.mocked(jwtService.sign).mockReturnValue('mock-token');
      vi.mocked(configService.get).mockReturnValue('15m');
      vi.mocked(prismaService.refreshToken.create).mockResolvedValue({
        id: 'token-id',
        token: 'refresh-token',
        userId: 1,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user.email).toBe(registerDto.email);
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: registerDto.email,
          name: registerDto.name,
          password: 'hashedPassword',
          role: Role.USER,
        },
      });
    });

    it('should throw ConflictException if user already exists', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      vi.mocked(jwtService.sign).mockReturnValue('mock-token');
      vi.mocked(configService.get).mockReturnValue('15m');
      vi.mocked(prismaService.refreshToken.create).mockResolvedValue({
        id: 'token-id',
        token: 'refresh-token',
        userId: 1,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user.email).toBe(loginDto.email);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const inactiveUser = { ...mockUser, isActive: false };
      vi.mocked(prismaService.user.findUnique).mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user for valid payload', async () => {
      const payload = {
        sub: 1,
        email: 'test@example.com',
        role: Role.USER,
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser);

      const result = await service.validateUser(payload);

      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: payload.sub },
      });
    });

    it('should return null for inactive user', async () => {
      const payload = {
        sub: 1,
        email: 'test@example.com',
        role: Role.USER,
      };

      const inactiveUser = { ...mockUser, isActive: false };
      vi.mocked(prismaService.user.findUnique).mockResolvedValue(inactiveUser);

      const result = await service.validateUser(payload);

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const payload = {
        sub: 999,
        email: 'nonexistent@example.com',
        role: Role.USER,
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(null);

      const result = await service.validateUser(payload);

      expect(result).toBeNull();
    });
  });
});