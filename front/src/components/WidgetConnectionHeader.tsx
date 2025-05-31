import React from 'react';
import { Power, AlertTriangle, Wifi, WifiOff } from 'lucide-react';

interface WidgetConnectionHeaderProps {
  title: string;
  isConnected: boolean;
  error?: Event | string | null;
  statusTextOverride?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  hideConnectionControls?: boolean;
}

const WidgetConnectionHeader: React.FC<WidgetConnectionHeaderProps> = ({ 
  title, 
  isConnected, 
  error,
  statusTextOverride,
  onConnect, 
  onDisconnect,
  hideConnectionControls = false
}) => {
  let currentStatusText: string;
  let StatusIcon;
  let iconColorClass: string;

  if (isConnected) {
    StatusIcon = Wifi;
    iconColorClass = "text-green-500";
    currentStatusText = statusTextOverride || "Đã kết nối";
  } else if (error) {
    StatusIcon = AlertTriangle;
    iconColorClass = "text-red-500";
    currentStatusText = statusTextOverride || (typeof error === 'string' ? error : "Lỗi kết nối");
  } else {
    StatusIcon = WifiOff;
    iconColorClass = "text-gray-400";
    currentStatusText = statusTextOverride || "Đã ngắt kết nối";
  }

  return (
    <div className="flex items-center justify-between mb-3 px-1 pt-1">
      <div className="flex items-center gap-2">
        <StatusIcon size={16} className={iconColorClass} />
        <span className="font-medium">{title}</span>
        <span className="text-xs text-gray-500">({currentStatusText})</span>
      </div>
      
      {!hideConnectionControls && (
        <>
          {!isConnected && onConnect && (
        <button 
          onClick={onConnect}
              className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-1"
        >
              <Power size={14} />
              <span>Kết nối</span>
            </button>
          )}
          {isConnected && onDisconnect && (
        <button 
          onClick={onDisconnect}
          className="px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 flex items-center gap-1"
        >
          <Power size={14} />
          <span>Ngắt kết nối</span>
        </button>
          )}
        </>
      )}
    </div>
  );
};

export default WidgetConnectionHeader;