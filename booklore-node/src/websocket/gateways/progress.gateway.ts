import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../auth/auth.service';
import { JwtPayload } from '../../auth/interfaces/auth.interface';
import { WsJwtGuard } from '../guards/ws-jwt.guard';
import { WebSocketReconnectionService } from '../services/websocket-reconnection.service';
import { WebSocketRateLimitService } from '../services/websocket-rate-limit.service';

export interface ProgressUpdate {
  jobId: string;
  userId: number;
  progress: number;
  status: 'started' | 'progress' | 'completed' | 'failed';
  message?: string;
  data?: any;
  error?: string;
}

export interface RoomJoinData {
  libraryId?: number;
  bookId?: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/progress',
})
export class ProgressGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  _server: Server;

  private readonly logger = new Logger(ProgressGateway.name);
  private readonly connectedUsers = new Map<string, number>(); // socketId -> userId
  private readonly userSockets = new Map<number, Set<string>>(); // userId -> Set<socketId>
  private readonly userProgress = new Map<number, Map<string, ProgressUpdate>>(); // userId -> jobId -> progress

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly reconnectionService: WebSocketReconnectionService,
    private readonly rateLimitService: WebSocketRateLimitService,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractTokenFromSocket(client);
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      const user = await this.authService.validateUser(payload);

      if (!user) {
        this.logger.warn(`Connection rejected: Invalid user for token`);
        client.disconnect();
        return;
      }

      // Store user connection
      this.connectedUsers.set(client.id, user.id);

      if (!this.userSockets.has(user.id)) {
        this.userSockets.set(user.id, new Set());
      }
      this.userSockets.get(user.id)!.add(client.id);

      // Join user to their personal room
      await client.join(`user:${user.id}`);

      // Register client with reconnection service
      this.reconnectionService.registerConnection(client, user.id);

      this.logger.log(`User ${user.email} connected with socket ${client.id}`);

      // Send any pending progress updates
      await this.sendPendingProgress(client, user.id);

      // Notify client of successful connection
      client.emit('connected', {
        userId: user.id,
        message: 'Successfully connected to progress updates',
      });
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);

    if (userId) {
      // Remove socket from user's socket set
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(client.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
        }
      }

      this.connectedUsers.delete(client.id);

      // Unregister from reconnection service
      this.reconnectionService.unregisterConnection(client.id);

      this.logger.log(`User ${userId} disconnected (socket: ${client.id})`);
    }
  }

  @SubscribeMessage('join-library')
  @UseGuards(WsJwtGuard)
  async handleJoinLibrary(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { libraryId: number },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) {
      client.emit('error', { message: 'User not authenticated' });
      return;
    }

    // Check rate limit
    const rateLimitResult = await this.rateLimitService.checkRateLimit(
      client,
      'join_library',
      userId,
    );

    if (!rateLimitResult.allowed) {
      this.logger.warn(`Rate limit exceeded for user ${userId} on join_library`);
      client.emit('error', {
        message: 'Rate limit exceeded',
        retryAfter: rateLimitResult.info?.msBeforeNext,
      });
      return;
    }

    try {
      // TODO: Add library access validation here
      // For now, we'll allow joining any library

      await client.join(`library:${data.libraryId}`);

      this.logger.log(`User ${userId} joined library ${data.libraryId}`);

      client.emit('joined-library', {
        libraryId: data.libraryId,
        message: `Successfully joined library ${data.libraryId}`,
      });

      // Record successful request
      this.rateLimitService.recordRequest(client, 'join_library', true, userId);
    } catch (error) {
      this.logger.error(`Error joining library: ${error.message}`);
      client.emit('error', { message: 'Failed to join library' });

      // Record failed request
      this.rateLimitService.recordRequest(client, 'join_library', false, userId);
    }
  }

  @SubscribeMessage('leave-library')
  @UseGuards(WsJwtGuard)
  async handleLeaveLibrary(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { libraryId: number },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) {
      client.emit('error', { message: 'User not authenticated' });
      return;
    }

    // Check rate limit
    const rateLimitResult = await this.rateLimitService.checkRateLimit(
      client,
      'leave_library',
      userId,
    );

    if (!rateLimitResult.allowed) {
      this.logger.warn(`Rate limit exceeded for user ${userId} on leave_library`);
      client.emit('error', {
        message: 'Rate limit exceeded',
        retryAfter: rateLimitResult.info?.msBeforeNext,
      });
      return;
    }

    await client.leave(`library:${data.libraryId}`);

    this.logger.log(`User ${userId} left library ${data.libraryId}`);

    client.emit('left-library', {
      libraryId: data.libraryId,
      message: `Successfully left library ${data.libraryId}`,
    });

    // Record successful request
    this.rateLimitService.recordRequest(client, 'leave_library', true, userId);
  }

  @SubscribeMessage('get-progress')
  @UseGuards(WsJwtGuard)
  async handleGetProgress(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId?: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) {
      client.emit('error', { message: 'User not authenticated' });
      return;
    }

    // Check rate limit
    const rateLimitResult = await this.rateLimitService.checkRateLimit(
      client,
      'get_progress',
      userId,
    );

    if (!rateLimitResult.allowed) {
      this.logger.warn(`Rate limit exceeded for user ${userId} on get_progress`);
      client.emit('error', {
        message: 'Rate limit exceeded',
        retryAfter: rateLimitResult.info?.msBeforeNext,
      });
      return;
    }

    const userProgressMap = this.userProgress.get(userId);
    if (!userProgressMap) {
      client.emit('progress-status', { jobs: [] });
      // Record successful request
      this.rateLimitService.recordRequest(client, 'get_progress', true, userId);
      return;
    }

    if (data.jobId) {
      const progress = userProgressMap.get(data.jobId);
      client.emit('progress-status', {
        jobId: data.jobId,
        progress: progress || null,
      });
    } else {
      const allProgress = Array.from(userProgressMap.values());
      client.emit('progress-status', { jobs: allProgress });
    }

    // Record successful request
    this.rateLimitService.recordRequest(client, 'get_progress', true, userId);
  }

  // Public methods for sending progress updates
  async notifyProgress(update: ProgressUpdate) {
    const { userId, jobId } = update;

    // Store progress update
    if (!this.userProgress.has(userId)) {
      this.userProgress.set(userId, new Map());
    }
    this.userProgress.get(userId)!.set(jobId, update);

    // Send to user's personal room
    this._server.to(`user:${userId}`).emit('progress-update', update);

    this.logger.log(
      `Progress update sent to user ${userId}: ${update.status} (${update.progress}%)`,
    );

    // Clean up completed/failed jobs after a delay
    if (update.status === 'completed' || update.status === 'failed') {
      setTimeout(() => {
        const userProgressMap = this.userProgress.get(userId);
        if (userProgressMap) {
          userProgressMap.delete(jobId);
          if (userProgressMap.size === 0) {
            this.userProgress.delete(userId);
          }
        }
      }, 60000); // Clean up after 1 minute
    }
  }

  async notifyFileProcessingStarted(userId: number, jobId: string, fileName: string) {
    await this.notifyProgress({
      jobId,
      userId,
      progress: 0,
      status: 'started',
      message: `Started processing file: ${fileName}`,
    });
  }

  async notifyFileProcessingProgress(userId: number, jobId: string, progress: number) {
    await this.notifyProgress({
      jobId,
      userId,
      progress,
      status: 'progress',
      message: `Processing file... ${progress}%`,
    });
  }

  async notifyFileProcessingCompleted(userId: number, jobId: string, data: any) {
    await this.notifyProgress({
      jobId,
      userId,
      progress: 100,
      status: 'completed',
      message: 'File processing completed successfully',
      data,
    });
  }

  async notifyFileProcessingFailed(userId: number, jobId: string, error: string) {
    await this.notifyProgress({
      jobId,
      userId,
      progress: 0,
      status: 'failed',
      message: 'File processing failed',
      error,
    });
  }

  async notifyFileMovementProgress(progress: any) {
    const { transactionId, totalFiles, processedFiles, status, currentFile } = progress;

    // Get transaction to find user ID
    const transaction = await this.getTransactionUser(transactionId);
    if (!transaction) return;

    const progressPercent = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;

    await this.notifyProgress({
      jobId: transactionId,
      userId: transaction.userId,
      progress: progressPercent,
      status: this.mapFileMovementStatus(status, processedFiles),
      message: currentFile || `Moving files: ${processedFiles}/${totalFiles}`,
      data: {
        type: 'file_movement',
        transactionId,
        totalFiles,
        processedFiles,
        currentFile,
        status,
      },
    });
  }

  private mapFileMovementStatus(
    status: string,
    processedFiles: number = 0,
  ): 'started' | 'progress' | 'completed' | 'failed' {
    switch (status) {
      case 'pending':
        return 'started';
      case 'in_progress':
        return processedFiles === 0 ? 'started' : 'progress';
      case 'completed':
        return 'completed';
      case 'failed':
      case 'cancelled':
        return 'failed';
      default:
        return 'progress';
    }
  }

  private async getTransactionUser(_transactionId: string): Promise<{ userId: number } | null> {
    try {
      // This would normally use a service to get transaction details
      // For now, we'll return null and handle it gracefully
      return null;
    } catch (error) {
      this.logger.error(`Error getting transaction user: ${error.message}`);
      return null;
    }
  }

  // Utility methods
  private extractTokenFromSocket(client: Socket): string | null {
    // Try to get token from auth header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try to get token from query parameters
    const token = client.handshake.query.token;
    if (typeof token === 'string') {
      return token;
    }

    // Try to get token from auth object
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') {
      return authToken;
    }

    return null;
  }

  private async sendPendingProgress(client: Socket, userId: number) {
    const userProgressMap = this.userProgress.get(userId);
    if (userProgressMap && userProgressMap.size > 0) {
      const pendingUpdates = Array.from(userProgressMap.values());
      for (const update of pendingUpdates) {
        client.emit('progress-update', update);
      }
      this.logger.log(`Sent ${pendingUpdates.length} pending progress updates to user ${userId}`);
    }
  }

  // Get connection statistics
  getConnectionStats() {
    return {
      totalConnections: this.connectedUsers.size,
      uniqueUsers: this.userSockets.size,
      pendingProgressUpdates: Array.from(this.userProgress.values()).reduce(
        (total, userMap) => total + userMap.size,
        0,
      ),
    };
  }

  // Check if user is connected
  isUserConnected(userId: number): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  // Get user's socket count
  getUserSocketCount(userId: number): number {
    return this.userSockets.get(userId)?.size || 0;
  }
}
