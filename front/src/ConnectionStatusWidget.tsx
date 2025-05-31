import React from 'react';
import { useWebSocket } from './contexts/WebSocketProvider';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';

const ConnectionStatusWidget: React.FC = () => {
  const { isConnected, error: webSocketError } = useWebSocket();
  const [lastEventTimestamp, setLastEventTimestamp] = React.useState<string>(new Date().toLocaleTimeString());

  React.useEffect(() => {
    setLastEventTimestamp(new Date().toLocaleTimeString());
  }, [isConnected, webSocketError]);

  let statusText = 'Đang kiểm tra...';
  let statusColor = 'text-gray-500';
  let IconComponent = WifiOff;

  if (webSocketError) {
    statusText = `Lỗi kết nối WebSocket`;
    statusColor = 'text-red-500';
    IconComponent = AlertTriangle;
  } else if (isConnected) {
    statusText = 'Đã kết nối tới Bridge';
    statusColor = 'text-green-500';
    IconComponent = Wifi;
  } else {
    statusText = 'Đã ngắt kết nối khỏi Bridge';
    statusColor = 'text-yellow-500';
    IconComponent = WifiOff;
  }

  return (
    <div className="p-3 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-md">Trạng Thái WebSocket (Bridge)</h3>
      </div>
      
      <div className={`flex items-center gap-2 ${statusColor}`}>
        <IconComponent size={20} />
        <span className="font-medium">{statusText}</span>
      </div>
      {webSocketError && (
        <div className="text-xs text-red-600 mt-1 break-all">
          Chi tiết: {webSocketError.type} (Xem console để biết thêm)
        </div>
      )}
      <div className="text-xs text-gray-400 mt-2 text-right">
        Cập nhật cuối: {lastEventTimestamp}
      </div>
    </div>
  );
};

export default ConnectionStatusWidget;