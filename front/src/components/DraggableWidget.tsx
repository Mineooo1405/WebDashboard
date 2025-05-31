import React from "react";
import { useDrag } from "react-dnd";

// Interface phù hợp với WidgetOption từ App.tsx
interface WidgetOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "control" | "monitoring" | "configuration";
}

interface DraggableWidgetProps {
  widget: WidgetOption;
  collapsed: boolean;
}

const DraggableWidget: React.FC<DraggableWidgetProps> = ({ widget, collapsed }) => {
  // Sử dụng hook useDrag từ react-dnd
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'WIDGET',
    item: { type: widget.id, originalWidgetId: widget.id },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div 
      ref={drag as any}
      className={`bg-white border border-gray-200 rounded-md p-2 
                 hover:border-blue-400 hover:shadow-sm cursor-move transition-all 
                 select-none ${isDragging ? 'opacity-50 shadow-lg scale-105' : 'opacity-100'}`}
    >
      <div className="flex items-center gap-2">
        <div className="text-blue-600">
          {widget.icon}
        </div>
        {!collapsed && (
          <div>
            <h4 className="font-medium text-sm">{widget.name}</h4>
            <p className="text-xs text-gray-500 line-clamp-1">{widget.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DraggableWidget;