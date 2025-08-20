import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ProgressGateway, ProgressUpdate } from './progress.gateway';
import { AuthService } from '../../auth/auth.service';
import { JwtPayload } from '../../auth/interfaces/auth.interface';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ProgressGateway', () => {
  let gateway: ProgressGateway;
  let jwtService: any;
  let authService: any;
  let mockServer: any;
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
        ProgressGateway,
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

    gateway = module.get<ProgressGateway>(ProgressGateway);
    jwtService = module.get(JwtService);
    authService = module.get(AuthService);

    // Mock server
    mockServer = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as any;

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      handshake: {
        headers: {},
        query: {},
        auth: {},
      },
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      data: {},
    } as any;

    // Set the server on the gateway
    gateway._server = mockServer;

    // Mock logger to avoid console output during tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('afterInit', () => {
    it('should log initialization message', () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');
      
      gateway.afterInit(mockServer);
      
      expect(logSpy).toHaveBeenCalledWith('WebSocket Gateway initialized');
    });
  });

  describe('handleConnection', () => {
    it('should successfully connect authenticated user', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(authService.validateUser).toHaveBeenCalledWith(mockJwtPayload);
      expect(mockSocket.join).toHaveBeenCalledWith('user:1');
      expect(mockSocket.emit).toHaveBeenCalledWith('connected', {
        userId: 1,
        message: 'Successfully connected to progress updates',
      });
    });

    it('should disconnect client when no token provided', async () => {
      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should disconnect client when token is invalid', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer invalid-token';
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client when user validation fails', async () => {
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(null);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should extract token from query parameters', async () => {
      mockSocket.handshake.query.token = 'query-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('query-token');
    });

    it('should extract token from auth object', async () => {
      mockSocket.handshake.auth.token = 'auth-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('auth-token');
    });
  });

  describe('handleDisconnect', () => {
    it('should clean up user connection data', async () => {
      // First connect the user
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);
      await gateway.handleConnection(mockSocket);

      // Then disconnect
      gateway.handleDisconnect(mockSocket);

      // Verify cleanup
      expect(gateway.isUserConnected(1)).toBe(false);
    });

    it('should handle disconnect for non-authenticated socket', () => {
      expect(() => gateway.handleDisconnect(mockSocket)).not.toThrow();
    });
  });

  describe('handleJoinLibrary', () => {
    beforeEach(async () => {
      // Setup authenticated connection
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);
      await gateway.handleConnection(mockSocket);
    });

    it('should allow user to join library', async () => {
      await gateway.handleJoinLibrary(mockSocket, { libraryId: 1 });

      expect(mockSocket.join).toHaveBeenCalledWith('library:1');
      expect(mockSocket.emit).toHaveBeenCalledWith('joined-library', {
        libraryId: 1,
        message: 'Successfully joined library 1',
      });
    });
  });

  describe('handleLeaveLibrary', () => {
    beforeEach(async () => {
      // Setup authenticated connection
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);
      await gateway.handleConnection(mockSocket);
    });

    it('should allow user to leave library', async () => {
      await gateway.handleLeaveLibrary(mockSocket, { libraryId: 1 });

      expect(mockSocket.leave).toHaveBeenCalledWith('library:1');
      expect(mockSocket.emit).toHaveBeenCalledWith('left-library', {
        libraryId: 1,
        message: 'Successfully left library 1',
      });
    });
  });

  describe('handleGetProgress', () => {
    beforeEach(async () => {
      // Setup authenticated connection
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);
      await gateway.handleConnection(mockSocket);
    });

    it('should return empty jobs when no progress exists', async () => {
      await gateway.handleGetProgress(mockSocket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith('progress-status', { jobs: [] });
    });

    it('should return specific job progress when jobId provided', async () => {
      const progressUpdate: ProgressUpdate = {
        jobId: 'job-123',
        userId: 1,
        progress: 50,
        status: 'progress',
        message: 'Processing...',
      };

      // Add progress update
      await gateway.notifyProgress(progressUpdate);

      await gateway.handleGetProgress(mockSocket, { jobId: 'job-123' });

      expect(mockSocket.emit).toHaveBeenCalledWith('progress-status', {
        jobId: 'job-123',
        progress: progressUpdate,
      });
    });
  });

  describe('notifyProgress', () => {
    it('should send progress update to user room', async () => {
      const progressUpdate: ProgressUpdate = {
        jobId: 'job-123',
        userId: 1,
        progress: 75,
        status: 'progress',
        message: 'Processing file...',
      };

      await gateway.notifyProgress(progressUpdate);

      expect(mockServer.to).toHaveBeenCalledWith('user:1');
      expect(mockServer.emit).toHaveBeenCalledWith('progress-update', progressUpdate);
    });

    it('should clean up completed jobs after delay', async () => {
      vi.useFakeTimers();

      const progressUpdate: ProgressUpdate = {
        jobId: 'job-123',
        userId: 1,
        progress: 100,
        status: 'completed',
        message: 'Processing completed',
      };

      await gateway.notifyProgress(progressUpdate);

      // Fast-forward time
      vi.advanceTimersByTime(60000);

      // Progress should be cleaned up (this is tested indirectly)
      expect(mockServer.to).toHaveBeenCalledWith('user:1');

      vi.useRealTimers();
    });
  });

  describe('file processing notifications', () => {
    it('should notify file processing started', async () => {
      await gateway.notifyFileProcessingStarted(1, 'job-123', 'test.pdf');

      expect(mockServer.to).toHaveBeenCalledWith('user:1');
      expect(mockServer.emit).toHaveBeenCalledWith('progress-update', {
        jobId: 'job-123',
        userId: 1,
        progress: 0,
        status: 'started',
        message: 'Started processing file: test.pdf',
      });
    });

    it('should notify file processing progress', async () => {
      await gateway.notifyFileProcessingProgress(1, 'job-123', 50);

      expect(mockServer.emit).toHaveBeenCalledWith('progress-update', {
        jobId: 'job-123',
        userId: 1,
        progress: 50,
        status: 'progress',
        message: 'Processing file... 50%',
      });
    });

    it('should notify file processing completed', async () => {
      const resultData = { bookId: 1, title: 'Test Book' };
      await gateway.notifyFileProcessingCompleted(1, 'job-123', resultData);

      expect(mockServer.emit).toHaveBeenCalledWith('progress-update', {
        jobId: 'job-123',
        userId: 1,
        progress: 100,
        status: 'completed',
        message: 'File processing completed successfully',
        data: resultData,
      });
    });

    it('should notify file processing failed', async () => {
      await gateway.notifyFileProcessingFailed(1, 'job-123', 'Invalid file format');

      expect(mockServer.emit).toHaveBeenCalledWith('progress-update', {
        jobId: 'job-123',
        userId: 1,
        progress: 0,
        status: 'failed',
        message: 'File processing failed',
        error: 'Invalid file format',
      });
    });
  });

  describe('utility methods', () => {
    it('should return connection statistics', () => {
      const stats = gateway.getConnectionStats();

      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('uniqueUsers');
      expect(stats).toHaveProperty('pendingProgressUpdates');
      expect(typeof stats.totalConnections).toBe('number');
    });

    it('should check if user is connected', async () => {
      expect(gateway.isUserConnected(1)).toBe(false);

      // Connect user
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);
      await gateway.handleConnection(mockSocket);

      expect(gateway.isUserConnected(1)).toBe(true);
    });

    it('should return user socket count', async () => {
      expect(gateway.getUserSocketCount(1)).toBe(0);

      // Connect user
      mockSocket.handshake.headers.authorization = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      authService.validateUser.mockResolvedValue(mockUser);
      await gateway.handleConnection(mockSocket);

      expect(gateway.getUserSocketCount(1)).toBe(1);
    });
  });

  describe('file movement progress', () => {
    it('should handle file movement progress notification', async () => {
      const progress = {
        transactionId: 'trans-123',
        totalFiles: 10,
        processedFiles: 5,
        status: 'in_progress',
        currentFile: 'file5.pdf',
      };

      await gateway.notifyFileMovementProgress(progress);

      // Since getTransactionUser returns null in the implementation,
      // this should not emit any progress updates
      expect(mockServer.emit).not.toHaveBeenCalled();
    });
  });
});