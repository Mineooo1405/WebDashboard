import React, { useState, useRef, useEffect } from "react";
import { X, Move } from "lucide-react";
import { RobotProvider } from "./RobotContext";
import MainArea from "./MainArea";
import ConnectionStatusWidget from "./ConnectionStatusWidget";
import PIDControlWidget from "./PIDControlWidget";
import TrajectoryWidget from "./TrajectoryWidget"; // Sử dụng phiên bản TS
import RobotStatusWidget from "./RobotStatusWidget";
import FirmwareUpdateWidget from "./FirmwareUpdateWidget";
import IMUWidget from "./IMUWidget"; // Sử dụng phiên bản chính
import EncoderDataWidget from "./EncoderDataWidget"; // Thêm mới
import RobotControlWidget from "./RobotControlWidget"; // Thêm widget điều khiển mới
import LogWidget from './LogWidget';
import { widgetComponents } from '../App';

interface PlacedWidgetProps {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number; // Thêm thuộc tính zIndex
  onRemove: () => void;
  onMove: (position: { x: number; y: number }) => void;
  onResize: (size: { width: number; height: number }) => void;
  onFocus: () => void; // Thêm hàm xử lý focus
}

const PlacedWidget: React.FC<PlacedWidgetProps> = ({
  id,
  type,
  position,
  size,
  zIndex, // Thêm tham số
  onRemove,
  onMove,
  onResize,
  onFocus // Thêm tham số
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  // Xử lý khi widget được click
  const handleWidgetClick = (e: React.MouseEvent) => {
    // Chỉ gọi onFocus nếu không đang kéo widget
    if (!isDragging) {
      onFocus();
    }
  };

  // Xử lý bắt đầu kéo
  const handleDragStart = (e: React.MouseEvent) => {
    if (widgetRef.current) {
      const rect = widgetRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);

      // Khi bắt đầu kéo, gọi onFocus để đưa widget lên trên cùng
      onFocus();
    }
  };

  // Xử lý kéo
  const handleDrag = (e: MouseEvent) => {
    if (isDragging && widgetRef.current) {
      const parentRect = widgetRef.current.parentElement?.getBoundingClientRect();
      if (parentRect) {
        // Tính toán vị trí mới
        const newX = e.clientX - parentRect.left - dragOffset.x;
        const newY = e.clientY - parentRect.top - dragOffset.y;

        // Giới hạn vị trí trong parent
        const constrainedX = Math.max(0, Math.min(newX, parentRect.width - size.width));
        const constrainedY = Math.max(0, Math.min(newY, parentRect.height - size.height));

        onMove({ x: constrainedX, y: constrainedY });
      }
    }
  };

  // Xử lý kết thúc kéo
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Xử lý resize
  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const handleResizeMove = (e: MouseEvent) => {
      const width = Math.max(200, startWidth + (e.clientX - startX));
      const height = Math.max(150, startHeight + (e.clientY - startY));
      onResize({ width, height });
    };

    const handleResizeEnd = () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  // Thêm event listeners khi component mount
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", handleDragEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", handleDragEnd);
    };
  }, [isDragging]);

  // Render nội dung widget dựa trên loại
  // Thêm type assertion để TypeScript biết rằng type là key hợp lệ
  const renderContent = () => {
    // Sử dụng type assertion để TypeScript chấp nhận
    const WidgetComponent = widgetComponents[type as keyof typeof widgetComponents];
    if (WidgetComponent) {
      return <WidgetComponent />;
    }
    return <div>Unknown widget type: {type}</div>;
  };

  // Convert type id to display name
  const getWidgetTitle = () => {
    switch (type) {
      case "server-control":
        return "Server Control";
      case "trajectory":
        return "Trajectory";
      case "trajectory-visualization":
        return "Trajectory";
      case "pid-control":
        return "PID Control";
      case "firmware-update":
        return "Firmware Update";
      case "motor-control":
        return "Robot Control"; // Cập nhật tên hiển thị
      case "connection-status":
        return "Connection Status";
      case "robot-control":
        return "Robot Control";
      case "imu-visualization":
        return "IMU Data";
      case "imu":
        return "IMU Data";
      case "encoder-data":
        return "Encoder Data";
      default:
        return type
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
    }
  };

  return (
    <div
      ref={widgetRef}
      className="absolute bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden"
      onClick={handleWidgetClick}
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: isDragging ? zIndex + 10 : zIndex,
      }}
    >
      {/* Widget Header */}
      <div
        className="h-10 bg-slate-100 border-b border-slate-200 px-3 py-2 flex justify-between items-center cursor-move"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <Move size={14} className="text-slate-500" />
          <h3 className="font-semibold text-sm text-slate-700">{getWidgetTitle()}</h3>
        </div>
        <button
          onClick={onRemove}
          className="text-slate-500 hover:text-red-600 hover:bg-slate-200 p-1 rounded-full"
        >
          <X size={14} />
        </button>
      </div>

      {/* Widget Content */}
      <div className="p-3 overflow-auto bg-white" style={{ height: "calc(100% - 40px)" }}>
        {renderContent()}
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResize}
        style={{
          backgroundImage: "radial-gradient(circle, #999 1px, transparent 1px)",
          backgroundSize: "3px 3px",
          backgroundPosition: "center",
        }}
      />
    </div>
  );
};

export default PlacedWidget;