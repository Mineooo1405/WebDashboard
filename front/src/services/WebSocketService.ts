const WEBSOCKET_URL = process.env.REACT_APP_WS_BRIDGE_URL || 'ws://localhost:9003/ws'; // Lấy từ biến môi trường hoặc mặc định
const RECONNECT_INTERVAL = 5000; // Thử kết nối lại sau mỗi 5 giây

type MessageListener = (data: any) => void;
type ConnectionStatusListener = (isConnected: boolean) => void;
type ErrorListener = (error: Event) => void;

interface TypedMessageListener {
  type: string;
  callback: MessageListener;
  id: string; // Để có thể hủy đăng ký
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private messageListeners: Map<string, TypedMessageListener[]> = new Map(); // messageType -> listeners
  private rawMessageListeners: Set<MessageListener> = new Set(); // Listeners cho tất cả message (ít dùng)
  private connectionStatusListeners: Set<ConnectionStatusListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private onSendListeners: Array<(message: any) => void> = [];
  
  private isConnected = false;
  private reconnectTimeoutId: number | null = null;
  private explicitlyClosed = false;

  private static instance: WebSocketService;

  // Singleton pattern
  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  public addOnSendListener(listener: (message: any) => void): () => void {
    this.onSendListeners.push(listener);
    return () => {
      this.onSendListeners = this.onSendListeners.filter(l => l !== listener);
    };
  }

  connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.warn('[WebSocketService] Already connected.');
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      console.warn('[WebSocketService] Connection already in progress.');
      return;
    }

    this.explicitlyClosed = false;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    console.log(`[WebSocketService] Connecting to ${WEBSOCKET_URL}...`);
    this.socket = new WebSocket(WEBSOCKET_URL);

    this.socket.onopen = () => {
      console.log('[WebSocketService] Connected successfully.');
      this.isConnected = true;
      this.notifyConnectionStatusChange(true);
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        // console.debug('[WebSocketService] Message received:', message);

        this.dispatchToSubscribers(message.type, message);

      } catch (error) {
        console.error('[WebSocketService] Error parsing message:', error, event.data);
      }
    };

    this.socket.onerror = (error) => {
      console.error('[WebSocketService] Error:', error);
      this.isConnected = false; // Thường thì onclose sẽ được gọi sau onerror
      this.notifyError(error);
      // onclose sẽ xử lý việc kết nối lại
    };

    this.socket.onclose = (event) => {
      console.log(`[WebSocketService] Disconnected. Code: ${event.code}, Reason: ${event.reason}, WasClean: ${event.wasClean}`);
      this.isConnected = false;
      this.notifyConnectionStatusChange(false);
      this.socket = null;

      if (!this.explicitlyClosed && !event.wasClean) { // Chỉ kết nối lại nếu không phải do chủ động đóng hoặc lỗi nghiêm trọng
        this.scheduleReconnect();
      }
    };
  }

  disconnect(): void {
    this.explicitlyClosed = true;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.socket) {
      console.log('[WebSocketService] Disconnecting...');
      this.socket.close(1000, "User initiated disconnect"); // 1000 là mã đóng bình thường
    }
    // onclose sẽ được gọi và cập nhật isConnected, notify listeners
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }
    console.log(`[WebSocketService] Scheduling reconnect in ${RECONNECT_INTERVAL / 1000} seconds...`);
    this.reconnectTimeoutId = window.setTimeout(() => {
      if (!this.explicitlyClosed && (!this.socket || this.socket.readyState === WebSocket.CLOSED)) {
        console.log('[WebSocketService] Attempting to reconnect...');
        this.connect();
      }
    }, RECONNECT_INTERVAL);
  }

  public sendMessage(data: object): boolean {
    console.log('[WebSocketService] Attempting to send:', JSON.stringify(data)); // DÒNG LOG QUAN TRỌNG
    this.onSendListeners.forEach(listener => {
      try {
        listener(data);
      } catch (e) {
        console.error('Error in onSendListener:', e);
      }
    });

    const simulatorMessage = data as { type?: string; actual_type?: string; payload?: any };

    if (simulatorMessage.type === 'SIMULATOR_DISPATCH_MESSAGE_TO_WIDGETS') {
      const { actual_type, payload } = simulatorMessage;
      if (actual_type && payload) {
        console.log('[WebSocketService] Intercepted simulator message. Dispatching locally:', { actual_type, payload });
        this.dispatchToSubscribers(actual_type, payload);
      }
      return true;
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('[WebSocketService] Cannot send message: Not connected.');
      return false;
    }
    try {
      this.socket.send(JSON.stringify(data));
      // console.debug('[WebSocketService] Message sent:', data);
      return true;
    } catch (error) {
      console.error('[WebSocketService] Error sending message:', error);
      return false;
    }
  }

  // Đăng ký nhận message theo type
  subscribeToMessageType(messageType: string, callback: MessageListener, id: string): () => void {
    if (!this.messageListeners.has(messageType)) {
      this.messageListeners.set(messageType, []);
    }
    const listeners = this.messageListeners.get(messageType)!;
    const existingListener = listeners.find(l => l.id === id && l.type === messageType);
    if (existingListener) {
        console.warn(`[WebSocketService] Listener with id '${id}' for type '${messageType}' already subscribed.`);
        return () => this.unsubscribeFromMessageType(messageType, id);
    }

    listeners.push({ type: messageType, callback, id });
    
    return () => this.unsubscribeFromMessageType(messageType, id);
  }

  unsubscribeFromMessageType(messageType: string, id: string): void {
    const listeners = this.messageListeners.get(messageType);
    if (listeners) {
      const filteredListeners = listeners.filter(listener => listener.id !== id);
      if (filteredListeners.length === 0) {
        this.messageListeners.delete(messageType);
      } else {
        this.messageListeners.set(messageType, filteredListeners);
      }
    }
  }
  
  // Đăng ký nhận tất cả message (ít dùng)
  subscribeToAllMessages(callback: MessageListener): () => void {
    this.rawMessageListeners.add(callback);
    return () => this.rawMessageListeners.delete(callback);
  }

  // Đăng ký nhận thay đổi trạng thái kết nối
  onConnectionStatusChange(callback: ConnectionStatusListener): () => void {
    this.connectionStatusListeners.add(callback);
    // Gọi ngay callback với trạng thái hiện tại
    callback(this.isConnected);
    return () => this.connectionStatusListeners.delete(callback);
  }

  private notifyConnectionStatusChange(isConnected: boolean): void {
    this.connectionStatusListeners.forEach(listener => listener(isConnected));
  }

  // Đăng ký nhận lỗi WebSocket
  onError(callback: ErrorListener): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  private notifyError(error: Event): void {
    this.errorListeners.forEach(listener => listener(error));
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  private dispatchToSubscribers(type: string, payload: any): void {
    const subscribers = this.messageListeners.get(type);
    if (subscribers) {
      subscribers.forEach(sub => {
        try {
          sub.callback(payload);
        } catch (e) {
          console.error(`Error in subscriber for type ${type} (id: ${sub.id}):`, e);
        }
      });
    }
    
    this.rawMessageListeners.forEach(listener => {
        try {
            listener({ type, ...payload});
        } catch(e) {
            console.error('Error in raw message listener:', e);
        }
    });
  }
}

// Xuất ra một instance duy nhất (singleton)
const webSocketService = WebSocketService.getInstance();
export default webSocketService; 