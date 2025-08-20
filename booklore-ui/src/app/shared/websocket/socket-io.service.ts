import { Injectable, Injector } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { API_CONFIG } from '../../config/api-config';
import { AuthService } from '../../core/service/auth.service';

export interface SocketMessage {
  event: string;
  data: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class SocketIOService {
  private socket: Socket | null = null;
  private connectionState$ = new BehaviorSubject<boolean>(false);
  private messageSubject = new Subject<SocketMessage>();
  private authService: AuthService;

  constructor(private injector: Injector) {
    this.authService = this.injector.get(AuthService);
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const token = this.getToken();
    if (!token) {
      console.warn('[SocketIO] No token available for connection');
      return;
    }

    // 连接到 Node.js 后端的 Socket.IO 服务器
    this.socket = io(API_CONFIG.BASE_URL, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      autoConnect: true
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[SocketIO] Connected to server');
      this.connectionState$.next(true);
      
      // 连接到不同的命名空间
      this.joinNamespace('/notifications');
      this.joinNamespace('/progress');
    });

    this.socket.on('disconnect', () => {
      console.log('[SocketIO] Disconnected from server');
      this.connectionState$.next(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SocketIO] Connection error:', error);
      this.connectionState$.next(false);
    });

    // 监听所有消息
    this.socket.onAny((event, data) => {
      this.messageSubject.next({ event, data });
    });
  }

  private joinNamespace(namespace: string): void {
    if (!this.socket) return;
    
    const token = this.getToken();
    const namespaceSocket = io(`${API_CONFIG.BASE_URL}${namespace}`, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling']
    });

    namespaceSocket.on('connect', () => {
      console.log(`[SocketIO] Connected to ${namespace} namespace`);
    });

    namespaceSocket.onAny((event, data) => {
      this.messageSubject.next({ event: `${namespace}:${event}`, data });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionState$.next(false);
    }
  }

  // 兼容 RxStomp 的接口
  activate(): void {
    this.connect();
  }

  deactivate(): void {
    this.disconnect();
  }

  // 监听特定事件
  watch(destination: string): Observable<{ body: string }> {
    return new Observable(observer => {
      const subscription = this.messageSubject.subscribe(message => {
        // 将 STOMP 风格的 destination 转换为 Socket.IO 事件
        const eventName = this.convertDestinationToEvent(destination);
        if (message.event === eventName || message.event.endsWith(`:${eventName}`)) {
          observer.next({ body: JSON.stringify(message.data) });
        }
      });

      return () => subscription.unsubscribe();
    });
  }

  // 发送消息
  publish(params: { destination: string; body: string }): void {
    if (!this.socket?.connected) {
      console.warn('[SocketIO] Cannot publish - not connected');
      return;
    }

    const eventName = this.convertDestinationToEvent(params.destination);
    const data = JSON.parse(params.body);
    this.socket.emit(eventName, data);
  }

  // 获取连接状态
  get connected$(): Observable<boolean> {
    return this.connectionState$.asObservable();
  }

  get connected(): boolean {
    return this.socket?.connected || false;
  }

  private getToken(): string | null {
    const oidcToken = this.authService.getOidcAccessToken();
    const internalToken = this.authService.getInternalAccessToken();
    return oidcToken || internalToken;
  }

  private convertDestinationToEvent(destination: string): string {
    // 将 STOMP 风格的 destination 转换为 Socket.IO 事件名
    // 例如: '/topic/notifications' -> 'notifications'
    //      '/topic/progress' -> 'progress'
    return destination.replace(/^\/topic\//, '').replace(/^\//, '');
  }
}