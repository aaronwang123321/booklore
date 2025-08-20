import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WsJwtGuard } from './ws-jwt.guard';
import { AuthService } from '../../auth/auth.service';
import { JwtPayload } from '../../auth/interfaces/auth.interface';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: any;
  let authService: any;
  let mockExecutionContext: any;
  let mockSocket: any;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
 };

  const mockJwtPayload: JwtPayload = {
    sub: 1,
    email: 'test@example.com',
    role: 'USER' as any,
    iat: Date.now(),
    exp: Date.now() + 3600000,
  };

  beforeEach(async () => {
    const mockJwtService = {
      verify: vi.fn(),
    };

    const mockAuthService = {
      validateUser: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsJwtGuard,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    guard = module.get<WsJwtGuard>(WsJwtGuard);
    jwtService = module.get(JwtService);
    authService = module.get(AuthService);

    // Mock socket
    mockSocket = {
      handshake: {
        headers: {},
        query: {},
        auth: {},
      },
      data: {},
    } as any;

    // Mock execution context
    mockExecutionContext = {
      switchToWs: vi.fn().mockReturnValue({
        getClient: vi.fn().mockReturnValue(mockSocket),
      }),
    } as any;

    // Mock logger to avoid console output during tests
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should return true for valid token and user', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(authService.validateUser).toHaveBeenCalledWith(mockJwtPayload);
      expect(mockSocket.data.user).toEqual(mockUser);
    });

    it('should throw WsException when no token provided', async () => {
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(authService.validateUser).not.toHaveBeenCalled();
    });

    it('should throw WsException when token is invalid', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer invalid-token';
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(jwtService.verify).toHaveBeenCalledWith('invalid-token');
      expect(authService.validateUser).not.toHaveBeenCalled();
    });

    it('should throw WsException when user validation fails', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(null);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(authService.validateUser).toHaveBeenCalledWith(mockJwtPayload);
    });

    it('should extract token from authorization header', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer header-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await guard.canActivate(mockExecutionContext);

      expect(jwtService.verify).toHaveBeenCalledWith('header-token');
    });

    it('should extract token from query parameters', async () => {
      mockSocket.handshake.query.token = 'query-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await guard.canActivate(mockExecutionContext);

      expect(jwtService.verify).toHaveBeenCalledWith('query-token');
    });

    it('should extract token from auth object', async () => {
      mockSocket.handshake.auth.token = 'auth-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await guard.canActivate(mockExecutionContext);

      expect(jwtService.verify).toHaveBeenCalledWith('auth-token');
    });

    it('should prioritize authorization header over query parameters', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer header-token';
      mockSocket.handshake.query.token = 'query-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await guard.canActivate(mockExecutionContext);

      expect(jwtService.verify).toHaveBeenCalledWith('header-token');
    });

    it('should prioritize query parameters over auth object', async () => {
      mockSocket.handshake.query.token = 'query-token';
      mockSocket.handshake.auth.token = 'auth-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await guard.canActivate(mockExecutionContext);

      expect(jwtService.verify).toHaveBeenCalledWith('query-token');
    });

    it('should handle malformed authorization header', async () => {
      mockSocket.handshake.headers.authorization = 'InvalidFormat token';

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should handle non-string token in query', async () => {
      mockSocket.handshake.query.token = ['array-token'] as any;

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should handle non-string token in auth object', async () => {
      mockSocket.handshake.auth.token = { object: 'token' } as any;

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should log error when authentication fails', async () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error');
      mockSocket.handshake.headers.authorization = 'Bearer invalid-token';
      jwtService.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(errorSpy).toHaveBeenCalledWith(
        'WebSocket authentication failed: Token expired',
      );
    });

    it('should handle JWT service throwing different error types', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer malformed-token';
      jwtService.verify.mockImplementation(() => {
        throw new Error('Malformed JWT');
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(jwtService.verify).toHaveBeenCalledWith('malformed-token');
    });

    it('should handle auth service throwing errors', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockRejectedValue(new Error('Database error'));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new WsException('Authentication failed'),
      );

      expect(authService.validateUser).toHaveBeenCalledWith(mockJwtPayload);
    });
  });

  describe('extractTokenFromSocket', () => {
    it('should return null when no token sources are available', () => {
      // Access the private method through bracket notation for testing
      const result = (guard as any).extractTokenFromSocket(mockSocket);
      
      expect(result).toBeNull();
    });

    it('should extract token from Bearer authorization header', () => {
      mockSocket.handshake.headers.authorization = 'Bearer test-token';
      
      const result = (guard as any).extractTokenFromSocket(mockSocket);
      
      expect(result).toBe('test-token');
    });

    it('should return null for non-Bearer authorization header', () => {
      mockSocket.handshake.headers.authorization = 'Basic dGVzdDp0ZXN0';
      
      const result = (guard as any).extractTokenFromSocket(mockSocket);
      
      expect(result).toBeNull();
    });

    it('should extract token from query parameters', () => {
      mockSocket.handshake.query.token = 'query-test-token';
      
      const result = (guard as any).extractTokenFromSocket(mockSocket);
      
      expect(result).toBe('query-test-token');
    });

    it('should extract token from auth object', () => {
      mockSocket.handshake.auth.token = 'auth-test-token';
      
      const result = (guard as any).extractTokenFromSocket(mockSocket);
      
      expect(result).toBe('auth-test-token');
    });
  });
});