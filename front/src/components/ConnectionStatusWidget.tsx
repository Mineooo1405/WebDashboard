import React from 'react';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { useWebSocket } from '../contexts/WebSocketProvider'; // Giả sử đường dẫn đúng
// Bỏ import CSS nếu bạn đã chuyển sang Tailwind hoặc CSS-in-JS, hoặc giữ lại nếu cần
// import './ConnectionStatusWidget.css'; // Đảm bảo file CSS này tồn tại nếu dùng

const ConnectionStatusWidget: React.FC = () => {
  const { isConnected, error } = useWebSocket();

  let statusText = 'Đang kết nối...';
  let StatusIcon = WifiOff;
  let iconColor = 'text-yellow-500';
  let bgColor = 'bg-yellow-100';
  let textColor = 'text-yellow-700';

  if (error) {
    statusText = 'Lỗi kết nối';
    StatusIcon = AlertTriangle;
    iconColor = 'text-red-500';
    bgColor = 'bg-red-100';
    textColor = 'text-red-700';
  } else if (isConnected) {
    statusText = 'Đã kết nối DirectBridge';
    StatusIcon = Wifi;
    iconColor = 'text-green-500';
    bgColor = 'bg-green-100';
    textColor = 'text-green-700';
  } else {
    // Trường hợp isConnected = false và không có error (đang cố kết nối lại hoặc chưa kết nối ban đầu)
    statusText = 'Đã ngắt kết nối'; // Hoặc 'Đang chờ kết nối...'
    StatusIcon = WifiOff;
    iconColor = 'text-gray-500';
    bgColor = 'bg-gray-100';
    textColor = 'text-gray-700';
      }

  // Nếu bạn muốn giữ lại CSS riêng, có thể dùng các class CSS cũ ở đây
  // Hoặc dùng Tailwind CSS như ví dụ:
  return (
    <div className={`flex items-center p-2 rounded-md text-sm ${bgColor} ${textColor}`}>
      <StatusIcon size={18} className={`mr-2 ${iconColor}`} />
      <span>{statusText}</span>
      {error && <span className="ml-2 text-xs">(Chi tiết trong console)</span>}
    </div>
  );
};

export default ConnectionStatusWidget;