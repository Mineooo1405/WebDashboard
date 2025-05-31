import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Power, Save, RotateCcw, AlertTriangle, Download } from 'lucide-react';
import { useRobotContext, ReadyState } from './RobotContext';
import WidgetConnectionHeader from './WidgetConnectionHeader';

// Interface cho thông số PID
interface PIDValues {
  kp: number;
  ki: number;
  kd: number;
}

// Interface for storing all motor PIDs loaded from server
interface AllMotorPIDValues {
  [motorId: number]: PIDValues;
}

const PIDControlWidget: React.FC = () => {
  const { 
    selectedRobotId,
    connectedRobots,
    sendJsonMessage,
    lastJsonMessage,
    readyState 
  } = useRobotContext();
  
  // State
  const [pidValues, setPidValues] = useState<PIDValues>({
    kp: 1.0,
    ki: 0.1,
    kd: 0.01
  });
  const [motorId, setMotorId] = useState(1);
  const [isSending, setIsSending] = useState(false);
  const [commandStatus, setCommandStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [serverPidConfigs, setServerPidConfigs] = useState<AllMotorPIDValues | null>(null);

  // Get the IP of the selected robot
  const getSelectedRobotIp = useCallback((): string | null => {
    if (!selectedRobotId) return null;
    const robot = connectedRobots.find(r => r.alias === selectedRobotId);
    return robot ? robot.ip : null;
  }, [selectedRobotId, connectedRobots]);
  
  // Effect to update pidValues when motorId changes and serverPidConfigs is available
  useEffect(() => {
    if (serverPidConfigs && serverPidConfigs[motorId]) {
      setPidValues(serverPidConfigs[motorId]);
    } else {
      // Optionally reset to defaults or keep current if no server config for this motor
      // For now, let's reset to local defaults if switching motor and no server config for it.
      // This behavior can be refined.
      setPidValues({ kp: 1.0, ki: 0.1, kd: 0.01 });
    }
  }, [motorId, serverPidConfigs]);

  // Handle incoming messages for PID config
  useEffect(() => {
    if (lastJsonMessage) {
      const message = lastJsonMessage as any;
      const currentRobotIp = getSelectedRobotIp();

      // Chỉ xử lý tin nhắn cho robot đang chọn
      if (message.robot_ip !== currentRobotIp && message.robot_alias !== selectedRobotId) {
        return; 
      }

      if (message.type === 'pid_config_response') { // Phản hồi cho lệnh load_pid_config
        if (message.status === 'loaded' && message.pids) {
          const pidsFromServer = message.pids as AllMotorPIDValues;
          setServerPidConfigs(pidsFromServer);
          if (pidsFromServer[motorId]) {
            setPidValues(pidsFromServer[motorId]); // Update UI for current motor
            setStatusMessage('Cấu hình PID đã được tải từ server.');
            setCommandStatus('success');
          } else {
            setStatusMessage(`Không có cấu hình PID cho Motor ${motorId} từ server.`);
            setCommandStatus('error'); // Or 'idle' if just informational
        }
        } else {
          setStatusMessage('Lỗi khi tải cấu hình PID từ server.');
          setCommandStatus('error');
        }
        setIsSending(false); // Reset isSending cho cả trường hợp load
        setTimeout(() => setCommandStatus('idle'), 3000);

      } else if (message.type === 'command_response') {
        // Kiểm tra xem phản hồi này có liên quan đến lệnh PID đã gửi không
        // Backend nên gửi lại thông tin về lệnh gốc hoặc payload type
        if (message.original_command === "send_to_robot" && message.payload_type_sent_to_robot === "pid_values") {
          if (message.status === 'success' || message.status === 'sent_to_robot') {
            setStatusMessage(message.message || 'Cấu hình PID đã được gửi tới robot!');
            setCommandStatus('success');
          } else { // status === 'error'
            setStatusMessage(message.message || 'Lỗi gửi lệnh PID tới robot.');
            setCommandStatus('error');
          }
          setIsSending(false); // Quan trọng: reset isSending
          setTimeout(() => setCommandStatus('idle'), 3000);
        }
      }
    }
  }, [lastJsonMessage, motorId, getSelectedRobotIp, selectedRobotId]); // Thêm selectedRobotId

  // Send current PID values to the selected robot
  const sendPIDValuesToRobot = async () => {
    const targetRobotIp = getSelectedRobotIp();
    if (!targetRobotIp) {
      setStatusMessage("IP của robot không có sẵn. Vui lòng chọn robot.");
      setCommandStatus('error');
      setTimeout(() => setCommandStatus('idle'), 3000);
      return;
    }
    if (readyState !== ReadyState.OPEN) {
      setStatusMessage("WebSocket không kết nối. Không thể gửi lệnh.");
      setCommandStatus('error');
      setTimeout(() => setCommandStatus('idle'), 3000);
      return;
    }
    
    setIsSending(true);
    setStatusMessage(null);
    
    sendJsonMessage({
      command: "send_to_robot",
      robot_ip: targetRobotIp,
      payload: {
        type: "pid_values",
        motor: motorId,
        kp: pidValues.kp,
        ki: pidValues.ki,
        kd: pidValues.kd
      }
    });
    // Confirmation will be handled by lastJsonMessage effect
  };
  
  // Request loading PID config from server file
  const loadPIDFromServer = () => {
    const targetRobotIp = getSelectedRobotIp();
    if (!targetRobotIp) {
      setStatusMessage("IP của robot không có sẵn. Vui lòng chọn robot.");
      setCommandStatus('error');
      setTimeout(() => setCommandStatus('idle'), 3000);
      return;
    }
    if (readyState !== ReadyState.OPEN) {
      setStatusMessage("WebSocket không kết nối. Không thể tải cấu hình.");
      setCommandStatus('error');
      setTimeout(() => setCommandStatus('idle'), 3000);
      return;
    }
    
    setStatusMessage("Đang yêu cầu tải PID từ server...");
    setCommandStatus('idle');
    sendJsonMessage({
      command: "load_pid_config",
      robot_ip: targetRobotIp
    });
  };

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = parseFloat(value);
    
    setPidValues(prev => ({
      ...prev,
      [name]: numValue
    }));
    // If user manually changes a PID value, we can assume they deviate from server config
    // setServerPidConfigs(null); // Or a more nuanced approach
  };

  // Reset to local defaults
  const resetToLocalDefaults = () => {
    setPidValues({
      kp: 1.0,
      ki: 0.1,
      kd: 0.01
    });
    setServerPidConfigs(null); // Clear any loaded server configs as we are resetting to local defaults
    setStatusMessage("Đã reset về giá trị PID mặc định cục bộ.");
    setCommandStatus('idle');
  };

  const triggerPIDTaskOnRobot = async () => {
    const targetRobotIp = getSelectedRobotIp();
    if (!targetRobotIp) {
      setStatusMessage("IP của robot không có sẵn. Vui lòng chọn robot.");
      setCommandStatus('error');
      setTimeout(() => setCommandStatus('idle'), 3000);
      return;
    }
    if (readyState !== ReadyState.OPEN) {
      setStatusMessage("WebSocket không kết nối. Không thể gửi lệnh.");
      setCommandStatus('error');
      setTimeout(() => setCommandStatus('idle'), 3000);
      return;
    }
    
    setIsSending(true);
    setStatusMessage("Đang gửi lệnh kích hoạt PID task...");
    setCommandStatus('idle'); // Or 'sending' if you have such a state
    
    sendJsonMessage({
      command: "trigger_robot_pid_task",
      robot_ip: targetRobotIp,
      robot_alias: selectedRobotId, // Send alias too for logging/confirmation
    });
    // Confirmation will be handled by lastJsonMessage effect
    // setIsSending will be reset by the effect upon receiving a response
  };

  const selectedRobotIp = getSelectedRobotIp();
  const widgetReady = readyState === ReadyState.OPEN && !!selectedRobotId && !!selectedRobotIp;
  
  let statusTextForHeader = "";
  if (!selectedRobotId) {
    statusTextForHeader = "Vui lòng chọn một robot";
  } else if (!selectedRobotIp) {
    statusTextForHeader = `Đang chờ thông tin IP cho ${selectedRobotId}...`;
  } else if (readyState === ReadyState.CONNECTING) {
    statusTextForHeader = "WebSocket: Đang kết nối...";
  } else if (readyState !== ReadyState.OPEN) {
    statusTextForHeader = "WebSocket: Chưa kết nối";
  } else if (widgetReady) {
    statusTextForHeader = `Sẵn sàng gửi tới ${selectedRobotId} (${selectedRobotIp})`;
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow flex flex-col gap-3">
      <WidgetConnectionHeader 
        title="Cấu hình PID" 
        isConnected={widgetReady}
        error={commandStatus === 'error' ? statusMessage : null}
        statusTextOverride={statusTextForHeader}
        hideConnectionControls={true}
      />
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Motor</label>
        <select
          value={motorId}
          onChange={(e) => setMotorId(parseInt(e.target.value))}
          className="w-full p-2 border border-gray-300 rounded-md"
          disabled={!widgetReady || isSending}
        >
          {[1, 2, 3].map(id => (
            <option key={id} value={id}>Motor {id}</option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        <div>
          <label className="flex justify-between">
            <span className="text-sm font-medium text-gray-700">Kp (Tỉ lệ)</span>
            <span className="text-sm text-gray-500">{pidValues.kp.toFixed(2)}</span>
          </label>
          <input
            type="range"
            name="kp"
            min="0"
            max="10"
            step="0.01"
            value={pidValues.kp}
            onChange={handleChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!widgetReady || isSending}
          />
          <input 
            type="number"
            name="kp"
            min="0"
            max="10"
            step="0.01"
            value={pidValues.kp}
            onChange={handleChange}
            className="mt-1 w-full p-1 text-sm border border-gray-300 rounded-md"
            disabled={!widgetReady || isSending}
          />
        </div>
        
        <div>
          <label className="flex justify-between">
            <span className="text-sm font-medium text-gray-700">Ki (Tích phân)</span>
            <span className="text-sm text-gray-500">{pidValues.ki.toFixed(2)}</span>
          </label>
          <input
            type="range"
            name="ki"
            min="0"
            max="5"
            step="0.01"
            value={pidValues.ki}
            onChange={handleChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!widgetReady || isSending}
          />
          <input 
            type="number"
            name="ki"
            min="0"
            max="5"
            step="0.01"
            value={pidValues.ki}
            onChange={handleChange}
            className="mt-1 w-full p-1 text-sm border border-gray-300 rounded-md"
            disabled={!widgetReady || isSending}
          />
        </div>
        
        <div>
          <label className="flex justify-between">
            <span className="text-sm font-medium text-gray-700">Kd (Đạo hàm)</span>
            <span className="text-sm text-gray-500">{pidValues.kd.toFixed(3)}</span>
          </label>
          <input
            type="range"
            name="kd"
            min="0"
            max="1"
            step="0.001"
            value={pidValues.kd}
            onChange={handleChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!widgetReady || isSending}
          />
          <input 
            type="number"
            name="kd"
            min="0"
            max="1"
            step="0.001"
            value={pidValues.kd}
            onChange={handleChange}
            className="mt-1 w-full p-1 text-sm border border-gray-300 rounded-md"
            disabled={!widgetReady || isSending}
          />
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <button
          onClick={sendPIDValuesToRobot}
          disabled={!widgetReady || isSending}
          className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending && commandStatus !== 'success' && commandStatus !== 'error' ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Đang gửi...</span>
            </>
          ) : (
            <>
              <Save size={14} />
              <span>Gửi tới Robot</span>
            </>
          )}
        </button>
        
        <button
          onClick={loadPIDFromServer}
          disabled={!widgetReady || isSending}
          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          <span>Tải từ Server</span>
        </button>

        <button
          onClick={triggerPIDTaskOnRobot} // Added this button
          disabled={!widgetReady || isSending}
          className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Gửi lệnh 'Set PID' để robot bắt đầu task PID (nếu có)"
        >
          <Power size={14} />
          <span>Kích hoạt PID Task</span>
        </button>
        
        <button
          onClick={resetToLocalDefaults}
          disabled={isSending} // Keep this disabled if any send operation is in progress
          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-md flex items-center justify-center"
        >
          <RotateCcw size={14} />
        </button>
      </div>
      
      {commandStatus !== 'idle' && statusMessage && (
        <div className={`px-3 py-2 rounded text-sm flex items-center gap-1 mt-2 ${
          commandStatus === 'success' ? 'bg-green-100 border border-green-400 text-green-700' :
          commandStatus === 'error' ? 'bg-red-100 border border-red-400 text-red-700' :
          'bg-blue-100 border border-blue-400 text-blue-700'
        }`}>
          {commandStatus === 'success' && <Save size={14} />}
          {commandStatus === 'error' && <AlertTriangle size={14} />}
          {statusMessage}
        </div>
      )}
    </div>
  );
};

export default PIDControlWidget;