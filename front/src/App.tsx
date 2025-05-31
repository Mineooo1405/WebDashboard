import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RobotProvider } from "./components/RobotContext";
import MainArea from "./components/MainArea";
import ConnectionStatusWidget from "./components/ConnectionStatusWidget";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { PlusCircle, Layers, Settings, MonitorSmartphone, ActivitySquare, 
         WifiOff, Code, ChevronLeft, ChevronRight, Cpu, BarChart3, Activity, Gamepad, Terminal,
         TestTubeDiagonal
       } from "lucide-react";
import DraggableWidget from "./components/DraggableWidget";
import { GlobalAppProvider } from "./contexts/GlobalAppContext";
import LogWidget from './components/LogWidget';
import RobotStatusWidget from './components/RobotStatusWidget';
import GlobalRobotSelector from './components/GlobalRobotSelector';
import IMUWidget from './components/IMUWidget';
import EncoderDataWidget from './components/EncoderDataWidget';
import PIDControlWidget from './components/PIDControlWidget';
import FirmwareUpdateWidget from './components/FirmwareUpdateWidget';
import RobotControlWidget from './components/RobotControlWidget';
import TrajectoryWidget from './components/TrajectoryWidget';
import WidgetDataSimulator from './components/WidgetDataSimulator';

// Widget option definition
interface WidgetOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "control" | "monitoring" | "configuration";
}

// Định nghĩa dữ liệu widget cần truyền vào MainArea
export interface WidgetInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  config?: any;
  zIndex: number; // Thêm thuộc tính zIndex để quản lý thứ tự chồng lớp
}

const widgetComponents: { [key: string]: React.FC<any> } = {
  "robot-status": RobotStatusWidget,
  "robot-control": RobotControlWidget,
  "pid-control": PIDControlWidget,
  "trajectory": TrajectoryWidget,
  "imu": IMUWidget,
  "encoder-data": EncoderDataWidget,
  "firmware-update": FirmwareUpdateWidget,
  "logs": LogWidget,
  "connection-status": ConnectionStatusWidget
};

// Export widgetComponents để các component khác có thể import
export { widgetComponents };

const App: React.FC = () => {
  const [showTester, setShowTester] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [collapseSidebar, setCollapseSidebar] = useState(false);
  const [connectionErrors, setConnectionErrors] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>("control");
  
  // Widget instances that have been placed on the dashboard
  const [widgetInstances, setWidgetInstances] = useState<WidgetInstance[]>([]);
  
  // Widget options that can be dragged to main area
  const widgetOptions = useMemo(() => [
    {
      id: "robot-status",
      name: "Trạng Thái Robot",
      description: "Hiển thị thông tin trạng thái tổng hợp của robot",
      icon: <ActivitySquare size={20} />,
      category: "monitoring"
    },
    {
      id: "robot-control",
      name: "Điều Khiển Robot",
      description: "Điều khiển chuyển động của robot",
      icon: <Gamepad size={20} />,
      category: "control"
    },
    {
      id: "pid-control",
      name: "Điều Khiển PID",
      description: "Cấu hình tham số PID cho các động cơ",
      icon: <Settings size={20} />,
      category: "configuration"
    },
    {
      id: "trajectory",
      name: "Quỹ Đạo Robot",
      description: "Hiển thị quỹ đạo chuyển động của robot",
      icon: <BarChart3 size={20} />,
      category: "monitoring"
    },
    {
      id: "imu",
      name: "Dữ Liệu IMU",
      description: "Hiển thị dữ liệu từ cảm biến IMU",
      icon: <Activity size={20} />,
      category: "monitoring"
    },
    {
      id: "encoder-data",
      name: "Dữ Liệu Encoder",
      description: "Hiển thị dữ liệu encoder của động cơ",
      icon: <Cpu size={20} />,
      category: "monitoring"
    },
    {
      id: "firmware-update",
      name: "Cập Nhật Firmware",
      description: "Tải lên và cập nhật firmware mới",
      icon: <Code size={20} />,
      category: "configuration"
    },
    {
      id: "connection-status",
      name: "Trạng Thái Kết Nối",
      description: "Theo dõi tình trạng kết nối WebSocket",
      icon: <WifiOff size={20} />,
      category: "monitoring"
    },
    {
      id: "logs",
      name: "Robot Logs",
      description: "Hiển thị log được gửi từ robot",
      icon: <Terminal size={20} />,
      category: "monitoring"
    }
  ], []);
  
  // Toggle sidebar collapse
  const toggleSidebar = useCallback(() => {
    setCollapseSidebar(prev => !prev);
  }, []);
  
  // Xử lý khi thả widget vào MainArea
  const handleWidgetDrop = useCallback((widgetType: string, position: { x: number; y: number }) => {
    // Tạo ID duy nhất cho widget mới
    const newId = `${widgetType}-${Date.now()}`;
    
    // Tính toán zIndex cao nhất hiện tại và tăng thêm 1
    const highestZIndex = widgetInstances.reduce(
      (max, widget) => Math.max(max, widget.zIndex || 0), 
      0
    );
    
    // Tạo instance mới
    const newWidget: WidgetInstance = {
      id: newId,
      type: widgetType,
      position,
      size: { width: 400, height: 300 }, // Kích thước mặc định
      config: {}, // Cấu hình mặc định
      zIndex: highestZIndex + 1 // Widget mới luôn nằm trên cùng
    };
    
    // Thêm widget mới vào danh sách
    setWidgetInstances(prev => [...prev, newWidget]);
  }, [widgetInstances]);
  
  // Xử lý xóa widget
  const handleRemoveWidget = useCallback((widgetId: string) => {
    setWidgetInstances(prev => prev.filter(widget => widget.id !== widgetId));
  }, []);
  
  // Cập nhật vị trí widget
  const handleWidgetMove = useCallback((widgetId: string, newPosition: { x: number, y: number }) => {
    setWidgetInstances(prev => 
      prev.map(widget => 
        widget.id === widgetId 
          ? { ...widget, position: newPosition }
          : widget
      )
    );
  }, []);
  
  // Cập nhật kích thước widget
  const handleWidgetResize = useCallback((widgetId: string, newSize: { width: number, height: number }) => {
    setWidgetInstances(prev => 
      prev.map(widget => 
        widget.id === widgetId 
          ? { ...widget, size: newSize }
          : widget
      )
    );
  }, []);

  // Thêm hàm mới để xử lý việc mang widget lên trước
  const bringWidgetToFront = useCallback((widgetId: string) => {
    // Tìm z-index cao nhất hiện tại
    const highestZIndex = widgetInstances.reduce(
      (max, widget) => Math.max(max, widget.zIndex || 0), 
      0
    );
    
    // Chỉ cập nhật nếu widget đang không ở trên cùng
    setWidgetInstances(prev => 
      prev.map(widget => 
        widget.id === widgetId && widget.zIndex !== highestZIndex
          ? { ...widget, zIndex: highestZIndex + 1 }
          : widget
      )
    );
  }, [widgetInstances]);
  
  // Thêm hàm này trong App component
  const handleAddRandomWidget = useCallback(() => {
    if (widgetOptions.length > 0) {
      const randomIndex = Math.floor(Math.random() * widgetOptions.length);
      const selectedWidget = widgetOptions[randomIndex];
      
      // Tính toán vị trí ngẫu nhiên trong MainArea
      // Giả sử MainArea có kích thước tối thiểu 800x600
      const randomPosition = {
        x: Math.floor(Math.random() * 400), // Giới hạn x
        y: Math.floor(Math.random() * 300), // Giới hạn y
      };
      
      // Thêm widget mới
      handleWidgetDrop(selectedWidget.id, randomPosition);
    }
  }, [widgetOptions, handleWidgetDrop]);

  // Thêm vào trong App.tsx, bên trong hàm App
  // Thiết lập một số widget mặc định khi ứng dụng khởi động
  useEffect(() => {
    // Chỉ thêm widget mặc định nếu dashboard đang trống
    if (widgetInstances.length === 0) {
      setWidgetInstances([
        {
          id: `robot-status-${Date.now()}`,
          type: "robot-status",
          position: { x: 20, y: 20 },
          size: { width: 500, height: 600 },
          zIndex: 1
        },
        {
          id: `robot-control-${Date.now() + 1}`,
          type: "robot-control",
          position: { x: 540, y: 20 },
          size: { width: 400, height: 300 },
          zIndex: 2
        },
        {
          id: `trajectory-${Date.now() + 2}`,
          type: "trajectory",
          position: { x: 540, y: 340 },
          size: { width: 400, height: 400 },
          zIndex: 3
        },
      ]);
    }
  }, []);

  // Lưu trạng thái dashboard vào localStorage
  useEffect(() => {
    if (widgetInstances.length > 0) {
      try {
        localStorage.setItem('dashboardWidgets', JSON.stringify(widgetInstances));
      } catch (error) {
        console.error("Error saving dashboard state:", error);
      }
    }
  }, [widgetInstances]);

  // Khôi phục trạng thái dashboard từ localStorage khi khởi động
  useEffect(() => {
    try {
      const savedWidgets = localStorage.getItem('dashboardWidgets');
      if (savedWidgets) {
        setWidgetInstances(JSON.parse(savedWidgets));
      }
    } catch (error) {
      console.error("Error restoring dashboard state:", error);
    }
  }, []);

  return (
    <GlobalAppProvider>
      <DndProvider backend={HTML5Backend}>
        <RobotProvider>
          <div className="w-screen h-screen flex flex-col bg-gray-100 overflow-hidden">
            {/* Header Bar */}
            <div className="bg-blue-700 text-white p-4 shadow-lg flex justify-between items-center">
              <div className="flex items-center">
                <MonitorSmartphone size={24} className="mr-3" />
                <h1 className="text-xl font-bold">ROBOT DASHBOARD</h1>
              </div>
              <div className="flex items-center gap-4">
                <GlobalRobotSelector />
                
                <div className="flex gap-2 items-center">
                  <button 
                    onClick={() => setDebugMode(!debugMode)}
                    className="bg-blue-600/50 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm flex items-center gap-1 transition-colors"
                  >
                    <Settings size={16} />
                    <span className="hidden sm:inline">{debugMode ? "Hide Debug" : "Debug Mode"}</span>
                  </button>

                  <button 
                    onClick={() => setShowTester(!showTester)}
                    className="bg-blue-600/50 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm flex items-center gap-1 transition-colors"
                  >
                    <Code size={16} />
                    <span className="hidden sm:inline">{showTester ? "Hide Tester" : "WS Tester"}</span>
                  </button>

                  <button 
                    onClick={() => setShowSimulator(prev => !prev)}
                    className={`p-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors 
                                ${showSimulator ? 'bg-blue-700' : 'bg-blue-500'}`}
                    title={showSimulator ? "Ẩn Simulator" : "Hiện Simulator"}
                  >
                    <TestTubeDiagonal size={20} />
                  </button>
                </div>
              </div>
            </div>
            
            {debugMode && (
              <div className="bg-gray-800 text-white p-2 text-xs overflow-auto max-h-32">
                <div className="font-bold mb-1">Debug Information:</div>
                <div>Environment: {import.meta.env.MODE}</div>
                <div className="mt-1">
                  <ConnectionStatusWidget />
                </div>
              </div>
            )}
            
            {/* Main Content with Sidebar and Drop Area */}
            <div className="flex-grow flex overflow-hidden">
              {/* Sidebar */}
              <div className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out
                ${collapseSidebar ? "w-16" : "w-64"}`}>
                
                {/* Sidebar Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  {!collapseSidebar && <h2 className="font-semibold">Widget Library</h2>}
                  <button 
                    onClick={toggleSidebar}
                    className="p-1 rounded-md hover:bg-gray-100 ml-auto text-gray-500"
                  >
                    {collapseSidebar ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                  </button>
                </div>
                
                {/* Category Selection */}
                <div className={`flex ${collapseSidebar ? "flex-col p-2" : "p-2 gap-1"}`}>
                  <button 
                    onClick={() => setActiveCategory("control")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2
                      ${activeCategory === "control" 
                        ? "bg-blue-100 text-blue-700" 
                        : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    <ActivitySquare size={16} />
                    {!collapseSidebar && <span>Control</span>}
                  </button>
                  
                  <button 
                    onClick={() => setActiveCategory("monitoring")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2
                      ${activeCategory === "monitoring" 
                        ? "bg-blue-100 text-blue-700" 
                        : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    <Layers size={16} />
                    {!collapseSidebar && <span>Monitoring</span>}
                  </button>
                  
                  <button 
                    onClick={() => setActiveCategory("configuration")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2
                      ${activeCategory === "configuration" 
                        ? "bg-blue-100 text-blue-700" 
                        : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    <Settings size={16} />
                    {!collapseSidebar && <span>Configuration</span>}
                  </button>
                </div>
                
                {/* Widgets List */}
                <div className="flex-grow overflow-auto p-3">
                  {!collapseSidebar && <h3 className="text-xs uppercase text-gray-500 font-semibold mb-2">Available Widgets</h3>}
                  
                  <div className="space-y-2">
                    {widgetOptions.map((widget) => (
                      <DraggableWidget 
                        key={widget.id}
                        widget={widget as WidgetOption}
                        collapsed={collapseSidebar}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Add Widget Button */}
                {!collapseSidebar && (
                  <div className="p-3 border-t border-gray-200">
                    <button 
                      onClick={handleAddRandomWidget}
                      className="w-full bg-blue-600 text-white rounded-md py-2 px-3 flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
                    >
                      <PlusCircle size={16} />
                      <span>Add Widget</span>
                    </button>
                  </div>
                )}
              </div>
              
              {/* Main Drop Area */}
              <div className="flex-grow overflow-auto">
                <MainArea 
                  widgets={widgetInstances}
                  onWidgetDrop={handleWidgetDrop}
                  onRemoveWidget={handleRemoveWidget}
                  onWidgetMove={handleWidgetMove}
                  onWidgetResize={handleWidgetResize}
                  onWidgetFocus={bringWidgetToFront}
                />
              </div>
            </div>
            
            {/* WebSocket Tester Overlay */}
            {showTester && (
              <div className="absolute inset-0 bg-white/90 z-50 p-5 overflow-auto">
                <button 
                  onClick={() => setShowTester(false)}
                  className="fixed bottom-4 right-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2"
                >
                  <Code size={18} />
                  Close Tester
                </button>
              </div>
            )}

            {/* ADDED: Render Simulator conditionally as a modal or overlay */}
            {showSimulator && (
              <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-full max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">Widget Data Simulator</h2>
                    <button 
                      onClick={() => setShowSimulator(false)} 
                      className="p-2 rounded-md hover:bg-gray-200 text-gray-600"
                      title="Đóng Simulator"
                    >
                      &times; {/* Hoặc một icon X */}
                    </button>
                  </div>
                  <div className="flex-grow overflow-y-auto"> {/* Ensure simulator content can scroll */}
                    <WidgetDataSimulator />
                  </div>
                </div>
              </div>
            )}
          </div>  
        </RobotProvider>
      </DndProvider>
    </GlobalAppProvider>
  );
};

export default App;