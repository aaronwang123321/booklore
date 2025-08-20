import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { io, Socket } from 'socket.io-client';
import { ProgressGateway } from './gateways/progress.gateway';
import { ProgressService } from './services/progress.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../shared/database/prisma.service';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';

describe.skip('WebSocket Integration', () => {
  let app: INestApplication;
  let progressGateway: ProgressGateway;
  let progressService: ProgressService;
  let authService: AuthService;
  let prismaService: PrismaService;
  let clientSocket: Socket;
  let testUser: any;
  let testToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env'],
        }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
        EventEmitterModule.forRoot(),
      ],
      providers: [
        ProgressGateway,
        ProgressService,
        WsJwtGuard,
        {
          provide: AuthService,
          useValue: {
            validateUser: vi.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              create: vi.fn(),
              findUnique: vi.fn(),
            },
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    progressGateway = moduleFixture.get<ProgressGateway>(ProgressGateway);
    progressService = moduleFixture.get<ProgressService>(ProgressService);
    authService = moduleFixture.get<AuthService>(AuthService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.listen(3001);

    // Create test user and token
    testUser = {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      role: 'USER',
      isActive: true,
    };

    testToken = 'test-jwt-token';

    // Mock auth service
    (authService.validateUser as any).mockResolvedValue(testUser);
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WebSocket Connection', () => {
    it('should accept connection with valid token', () => {
      return new Promise<void>((resolve, reject) => {
        clientSocket = io('http://localhost:3001/progress', {
          auth: {
            token: testToken,
          },
        });

        clientSocket.on('connected', (data) => {
          try {
            expect(data.userId).toBe(testUser.id);
            expect(data.message).toContain('Successfully connected');
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        clientSocket.on('connect_error', (error) => {
          reject(error);
        });
      });
    });

    it('should reject connection with invalid token', () => {
      return new Promise<void>((resolve, reject) => {
        (authService.validateUser as any).mockResolvedValue(null);

        const invalidSocket = io('http://localhost:3001/progress', {
          auth: {
            token: 'invalid-token',
          },
        });

        invalidSocket.on('connect', () => {
          reject(new Error('Should not connect with invalid token'));
        });

        invalidSocket.on('connect_error', (error) => {
          try {
            expect(error).toBeDefined();
            invalidSocket.disconnect();
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    });
  });

  describe('Room Management', () => {
    beforeEach(() => {
      return new Promise<void>((resolve) => {
        clientSocket = io('http://localhost:3001/progress', {
          auth: {
            token: testToken,
          },
        });

        clientSocket.on('connected', () => {
          resolve();
        });
      });
    });

    it('should allow joining and leaving library rooms', () => {
      return new Promise<void>((resolve, reject) => {
        const libraryId = 1;
        let joinedLibrary = false;

        clientSocket.emit('join-library', { libraryId });

        clientSocket.on('joined-library', (data) => {
          try {
            expect(data.libraryId).toBe(libraryId);
            joinedLibrary = true;

            // Now test leaving
            clientSocket.emit('leave-library', { libraryId });
          } catch (error) {
            reject(error);
          }
        });

        clientSocket.on('left-library', (data) => {
          try {
            expect(data.libraryId).toBe(libraryId);
            expect(joinedLibrary).toBe(true);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  });

  describe('Progress Notifications', () => {
    beforeEach(() => {
      return new Promise<void>((resolve) => {
        clientSocket = io('http://localhost:3001/progress', {
          auth: {
            token: testToken,
          },
        });

        clientSocket.on('connected', () => {
          resolve();
        });
      });
    });

    it('should receive progress updates', () => {
      return new Promise<void>((resolve, reject) => {
        const testProgress = {
          jobId: 'test-job-1',
          userId: testUser.id,
          progress: 50,
          status: 'progress' as const,
          message: 'Processing file...',
        };

        clientSocket.on('progress-update', (update) => {
          try {
            expect(update.jobId).toBe(testProgress.jobId);
            expect(update.progress).toBe(testProgress.progress);
            expect(update.status).toBe(testProgress.status);
            expect(update.message).toBe(testProgress.message);
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        // Simulate progress update
        setTimeout(() => {
          progressGateway.notifyProgress(testProgress);
        }, 100);
      });
    });

    it('should handle file processing events', () => {
      return new Promise<void>((resolve, reject) => {
        const jobId = 'test-job-2';
        const fileName = 'test-file.epub';

        clientSocket.on('progress-update', (update) => {
          try {
            expect(update.jobId).toBe(jobId);
            expect(update.userId).toBe(testUser.id);
            expect(update.status).toBe('started');
            expect(update.message).toContain(fileName);
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        // Simulate file processing started event
        setTimeout(() => {
          progressGateway.notifyFileProcessingStarted(testUser.id, jobId, fileName);
        }, 100);
      });
    });
  });

  describe('Connection Statistics', () => {
    it('should track connection statistics', () => {
      const stats = progressService.getConnectionStats();

      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('uniqueUsers');
      expect(stats).toHaveProperty('pendingProgressUpdates');
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.uniqueUsers).toBe('number');
      expect(typeof stats.pendingProgressUpdates).toBe('number');
    });

    it('should check if user is connected', () => {
      const isConnected = progressService.isUserConnected(testUser.id);
      expect(typeof isConnected).toBe('boolean');
    });

    it('should get user socket count', () => {
      const socketCount = progressService.getUserSocketCount(testUser.id);
      expect(typeof socketCount).toBe('number');
      expect(socketCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Event Handling', () => {
    it('should handle file processing events', async () => {
      const mockEvent = {
        jobId: 'test-job-3',
        userId: '1',
        fileName: 'test.pdf',
      };

      // Test that the service can handle events without throwing
      await expect(
        progressService.handleFileProcessingStarted(mockEvent)
      ).resolves.not.toThrow();
    });

    it('should handle progress events', async () => {
      const mockEvent = {
        jobId: 'test-job-4',
        userId: '1',
        progress: 75,
      };

      await expect(
        progressService.handleFileProcessingProgress(mockEvent)
      ).resolves.not.toThrow();
    });

    it('should handle completion events', async () => {
      const mockEvent = {
        jobId: 'test-job-5',
        userId: '1',
        result: { success: true },
      };

      await expect(
        progressService.handleFileProcessingCompleted(mockEvent)
      ).resolves.not.toThrow();
    });

    it('should handle failure events', async () => {
      const mockEvent = {
        jobId: 'test-job-6',
        userId: '1',
        error: 'Processing failed',
      };

      await expect(
        progressService.handleFileProcessingFailed(mockEvent)
      ).resolves.not.toThrow();
    });
  });
});