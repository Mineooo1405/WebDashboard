import React, { useEffect, useState } from 'react';
import { useRobotContext, ConnectedRobot } from './RobotContext';
import { ReadyState } from 'react-use-websocket';
import { Bot, RefreshCw } from 'lucide-react';

// Nên định nghĩa interface này ở một nơi dùng chung nếu nhiều component sử dụng
interface RobotListItem {
  robot_id: string;
  ip: string;
  active?: boolean;
  // Thêm các trường khác nếu API trả về, ví dụ: port, last_seen
}

const WebSocketStatusIndicator: React.FC<{ readyState: ReadyState | undefined }> = ({ readyState }) => {
  let statusText = "WS: Không rõ";
  let textColor = "text-gray-400";

  switch (readyState) {
    case ReadyState.CONNECTING:
      statusText = "WS: Đang kết nối...";
      textColor = "text-yellow-400";
      break;
    case ReadyState.OPEN:
      statusText = "WS: Online";
      textColor = "text-green-400";
      break;
    case ReadyState.CLOSING:
      statusText = "WS: Đang đóng...";
      textColor = "text-yellow-400";
      break;
    case ReadyState.CLOSED:
      statusText = "WS: Offline";
      textColor = "text-red-400";
      break;
    case ReadyState.UNINSTANTIATED:
      statusText = "WS: Chưa khởi tạo";
      textColor = "text-gray-500";
      break;
  }
  return <span className={`text-xs ml-3 ${textColor}`}>{statusText}</span>;
};

const GlobalRobotSelector: React.FC = () => {
  const {
    selectedRobotId,
    setSelectedRobotId,
    connectedRobots,
    readyState,
    requestRobotListUpdate,
  } = useRobotContext();

  const [isLoadingRobots, setIsLoadingRobots] = useState(false);
  const [robotListError, setRobotListError] = useState<string | null>(null);

  // useEffect to primarily manage isLoadingRobots and log context changes
  useEffect(() => {
    // console.log('[GlobalRobotSelector] Context changed - selectedRobotId:', selectedRobotId, 'connectedRobots:', connectedRobots.length, 'readyState:', readyState);
    // Logic for auto-selecting or clearing selection is now primarily handled by RobotContext
    // This widget will just reflect the selectedRobotId from the context.
    if (readyState === ReadyState.OPEN && isLoadingRobots) {
        // If we were loading and WS is open, assume list has been (or will be) processed by context
        setIsLoadingRobots(false);
    }
  }, [connectedRobots, readyState, selectedRobotId, isLoadingRobots]); // Keep selectedRobotId if needed for other logic or logging

  const handleRobotSelectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newSelectedAlias = event.target.value;
    // console.log('[GlobalRobotSelector] User selected:', newSelectedAlias);
    setSelectedRobotId(newSelectedAlias === "" ? null : newSelectedAlias); // Call context's setSelectedRobotId
  };
  
  const handleRefreshRobots = () => { // Made non-async as requestRobotListUpdate is not async
    if (readyState === ReadyState.OPEN) {
      setIsLoadingRobots(true);
      setRobotListError(null);
      requestRobotListUpdate(); 
      // setIsLoadingRobots(false) will be handled by the useEffect above when connectedRobots updates (or fails in context)
    } else {
      setRobotListError("Kết nối WebSocket chưa sẵn sàng để làm mới.");
      setIsLoadingRobots(false); // Stop loading if WS not open
    }
  };

  const getDisplayMessage = () => {
    if (readyState === ReadyState.CONNECTING) return "Đang kết nối...";
    if (robotListError) return robotListError;
    if (readyState !== ReadyState.OPEN && readyState !== ReadyState.UNINSTANTIATED) {
        // If WS was open and then closed, and we have a selected robot, it might become invalid
        // RobotContext should clear selectedRobotId on close/error
        return "WebSocket đã đóng";
    }
    if (isLoadingRobots) return "Đang tải danh sách...";
    if (readyState === ReadyState.OPEN && connectedRobots.length === 0) return "Không có robot nào";
    // If robots are available but none is selected, prompt to select.
    // This relies on selectedRobotId being null if no valid selection.
    if (readyState === ReadyState.OPEN && connectedRobots.length > 0 && !selectedRobotId) return "Vui lòng chọn robot"; 
    return null; 
  };

  const displayMessage = getDisplayMessage();

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-white/20 px-2 py-1 rounded-md">
        <Bot size={18} className="mr-2 text-blue-100" />
        <select
          value={selectedRobotId || ''} // Reflect selectedRobotId from context
          onChange={handleRobotSelectionChange}
          className="bg-transparent text-white border-none outline-none py-1 pr-6 appearance-none"
          style={{
            backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,<svg width=\"12\" height=\"8\" viewBox=\"0 0 12 8\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M6 7.4L0.6 2L2 0.599998L6 4.6L10 0.599998L11.4 2L6 7.4Z\" fill=\"white\"/></svg>')",
            backgroundRepeat: "no-repeat", 
            backgroundPosition: "right 0.25rem center",
            paddingRight: "1.5rem"
          }}
          disabled={readyState !== ReadyState.OPEN || connectedRobots.length === 0 || isLoadingRobots}
        >
          {displayMessage && <option value="" className="text-gray-800">{displayMessage}</option>}
          
          {/* Only show list if no overriding displayMessage and robots are available */}
          {!displayMessage && readyState === ReadyState.OPEN && connectedRobots.map(robot => (
            <option key={robot.alias} value={robot.alias} className="text-gray-800">
              {robot.alias} ({robot.ip})
            </option>
          ))}
        </select>
      </div>
      
      <button 
        onClick={handleRefreshRobots}
        className={`text-white/80 hover:text-white p-1 rounded-full ${(isLoadingRobots && readyState === ReadyState.OPEN) ? 'animate-spin' : ''}`}
        title="Refresh robots list"
        disabled={readyState !== ReadyState.OPEN || isLoadingRobots}
      >
        <RefreshCw size={16} /> 
      </button>
      <WebSocketStatusIndicator readyState={readyState} />
    </div>
  );
};

export default GlobalRobotSelector;