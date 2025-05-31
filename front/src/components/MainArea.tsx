import React, { useRef } from "react";
import { useDrop } from "react-dnd";
import { WidgetInstance } from "../App";
import PlacedWidget from "./PlacedWidget";

interface MainAreaProps {
  widgets: WidgetInstance[];
  onWidgetDrop: (widgetType: string, position: { x: number; y: number }) => void;
  onRemoveWidget: (widgetId: string) => void;
  onWidgetMove: (widgetId: string, position: { x: number; y: number }) => void;
  onWidgetResize: (widgetId: string, size: { width: number; height: number }) => void;
  onWidgetFocus: (widgetId: string) => void; // Thêm prop mới
}

const MainArea: React.FC<MainAreaProps> = ({ 
  widgets, 
  onWidgetDrop, 
  onRemoveWidget,
  onWidgetMove,
  onWidgetResize,
  onWidgetFocus
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Thiết lập drop zone
  const [, drop] = useDrop(() => ({
    accept: 'WIDGET',
    drop: (item: { id: string; type: string }, monitor) => {
      if (!containerRef.current) return;

      // Lấy vị trí thả tương đối so với container
      const containerRect = containerRef.current.getBoundingClientRect();
      const dropOffset = monitor.getClientOffset();
      
      if (dropOffset) {
        const position = {
          x: dropOffset.x - containerRect.left,
          y: dropOffset.y - containerRect.top,
        };
        
        onWidgetDrop(item.type, position);
      }
    },
  }), [onWidgetDrop]);

  return (
    <div 
      ref={(el) => {
        containerRef.current = el;
        drop(el);
      }}
      className="relative w-full h-full p-6 bg-gray-100 overflow-auto"
    >
      {widgets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <p>Drag and drop widgets here</p>
            <p className="text-sm mt-2">Use the sidebar to add widgets to your dashboard</p>
          </div>
        </div>
      )}
      
      {widgets.map(widget => (
        <PlacedWidget
          key={widget.id}
          id={widget.id}
          type={widget.type}
          position={widget.position}
          size={widget.size}
          zIndex={widget.zIndex || 1} // Truyền zIndex hoặc mặc định là 1
          onRemove={() => onRemoveWidget(widget.id)}
          onMove={(position) => onWidgetMove(widget.id, position)}
          onResize={(size) => onWidgetResize(widget.id, size)}
          onFocus={() => onWidgetFocus(widget.id)} // Thêm handler cho sự kiện focus
        />
      ))}
    </div>
  );
};

export default MainArea;

