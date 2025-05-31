import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import webSocketService from '../services/WebSocketService';

interface WebSocketContextType {
  isConnected: boolean;
  lastJsonMessage: any | null; // Lưu message JSON cuối cùng nhận được (nếu backend gửi JSON)
  lastRawMessage: string | null; // Lưu message thô cuối cùng (nếu backend gửi text)
  sendMessage: (data: object) => boolean;
  subscribeToMessageType: (messageType: string, callback: (data: any) => void, id: string) => () => void;
  error: Event | null;
  addOnSendListener: (listener: (message: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(webSocketService.getIsConnected());
  const [lastJsonMessage, setLastJsonMessage] = useState<any | null>(null);
  const [lastRawMessage, setLastRawMessage] = useState<string | null>(null);
  const [error, setError] = useState<Event | null>(null);
  
  // Dùng ref để lưu trữ các message listeners để tránh re-render không cần thiết khi callback thay đổi
  // và để đảm bảo luôn gọi callback mới nhất.
  const messageTypeListenersRef = useRef<Map<string, Map<string, (data: any) => void>>>(new Map());

  useEffect(() => {
    // Tự động kết nối khi provider được mount
    if (!webSocketService.getIsConnected()) {
        webSocketService.connect();
    }

    const handleConnectionStatus = (status: boolean) => {
      setIsConnected(status);
      if (!status) {
        // Reset last message khi mất kết nối để tránh hiển thị dữ liệu cũ
        setLastJsonMessage(null);
        setLastRawMessage(null);
      }
    };

    const handleRawMessage = (message: any) => { // Service gửi message đã parse JSON
      setLastJsonMessage(message); // Giả sử message từ service luôn là JSON đã parse
      setLastRawMessage(JSON.stringify(message)); // Lưu dạng chuỗi nếu cần
      
      // Gọi các typed listeners đã đăng ký thông qua context
      const type = message?.type;
      if (type && messageTypeListenersRef.current.has(type)) {
        messageTypeListenersRef.current.get(type)!.forEach(callback => callback(message));
      }
    };

    const handleError = (err: Event) => {
      setError(err);
    };

    const unsubscribeStatus = webSocketService.onConnectionStatusChange(handleConnectionStatus);
    // Sử dụng subscribeToAllMessages từ service để nhận tất cả message đã parse
    // và sau đó context sẽ phân phối lại cho các typed listeners của nó.
    const unsubscribeMessages = webSocketService.subscribeToAllMessages(handleRawMessage);
    const unsubscribeError = webSocketService.onError(handleError);

    return () => {
      unsubscribeStatus();
      unsubscribeMessages();
      unsubscribeError();
      // Không ngắt kết nối ở đây trừ khi Provider bị unmount hoàn toàn khỏi ứng dụng
      // webSocketService.disconnect(); 
    };
  }, []);

  const sendMessage = useCallback((data: object) => {
    return webSocketService.sendMessage(data);
  }, []);

  const addOnSendListener = useCallback((listener: (message: any) => void) => {
    return webSocketService.addOnSendListener(listener);
  }, []);

  const subscribeToMessageType = useCallback((messageType: string, callback: (data: any) => void, id: string) => {
    if (!messageTypeListenersRef.current.has(messageType)) {
      messageTypeListenersRef.current.set(messageType, new Map());
    }
    const typeListeners = messageTypeListenersRef.current.get(messageType)!;
    
    if (typeListeners.has(id)) {
        console.warn(`[WebSocketProvider] Listener with id '${id}' for type '${messageType}' already subscribed via context.`);
    } else {
        typeListeners.set(id, callback);
    }

    // Trả về hàm để hủy đăng ký
    return () => {
      const currentTypeListeners = messageTypeListenersRef.current.get(messageType);
      if (currentTypeListeners) {
        currentTypeListeners.delete(id);
        if (currentTypeListeners.size === 0) {
          messageTypeListenersRef.current.delete(messageType);
        }
      }
    };
  }, []);

  const contextValue = useMemo(() => ({
    isConnected,
    lastJsonMessage,
    lastRawMessage,
    sendMessage,
    subscribeToMessageType,
    error,
    addOnSendListener,
  }), [isConnected, lastJsonMessage, lastRawMessage, sendMessage, subscribeToMessageType, error, addOnSendListener]);

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}; 