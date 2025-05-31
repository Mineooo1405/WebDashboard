import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketProvider';
import { RefreshCw, Activity, Gauge, Download, RotateCcw, Play, Pause } from 'lucide-react';
import WidgetConnectionHeader from './WidgetConnectionHeader';
import { Line } from 'react-chartjs-2';
import { useRobotContext } from './RobotContext';

// Định nghĩa kiểu dữ liệu
interface RobotStatus {
  connected: boolean;
  lastUpdate: number | null;
  encoders: {
    rpm: number[];
  };
  pid: {
    motor1: { kp: number; ki: number; kd: number };
    motor2: { kp: number; ki: number; kd: number };
    motor3: { kp: number; ki: number; kd: number };
  };
  position: {
    x: number;
    y: number;
    theta: number;
  };
  battery: {
    voltage: number;
    percent: number;
  };
}

// Cập nhật interface Trajectory để phù hợp với TrajectoryData
interface Trajectory {
  currentPosition: {
    x: number;
    y: number;
    theta: number;
  };
  points: {
    x: number[];
    y: number[];
    theta?: number[];
  };
  status: string;
  progress_percent: number;
}

// Define expected WebSocket message payloads
interface BaseMessagePayload {
  type: string;
  robot_ip?: string;
  timestamp?: number;
  message?: string;
}

interface RobotStatusPayload extends BaseMessagePayload {
  type: 'robot_status' | 'initial_data';
  encoders?: { rpm: number[] };
  pid?: RobotStatus['pid'];
  position?: RobotStatus['position'];
  battery?: RobotStatus['battery'];
  trajectory?: Trajectory;
}

interface TrajectoryDataPayload extends BaseMessagePayload {
  type: 'trajectory_data' | 'trajectory_update' | 'trajectory_history_response';
  current_x?: number;
  current_y?: number;
  current_theta?: number;
  points?: { x: number[]; y: number[]; theta?: number[] };
  status?: string;
  progress_percent?: number;
}

// Khởi tạo trạng thái robot mặc định
const defaultStatus: RobotStatus = {
  connected: false,
  lastUpdate: null,
  encoders: {
    rpm: [0, 0, 0],
  },
  pid: {
    motor1: { kp: 0, ki: 0, kd: 0 },
    motor2: { kp: 0, ki: 0, kd: 0 },
    motor3: { kp: 0, ki: 0, kd: 0 },
  },
  position: {
    x: 0,
    y: 0,
    theta: 0,
  },
  battery: {
    voltage: 0,
    percent: 0,
  },
};

const RobotStatusWidget: React.FC = () => {
  const { selectedRobotId } = useRobotContext();
  const { 
    sendMessage, 
    subscribeToMessageType, 
    isConnected: webSocketIsConnected, 
    error: webSocketError 
  } = useWebSocket();

  const [robotStatus, setRobotStatus] = useState<RobotStatus>(defaultStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(false);
  const [rpmHistory, setRpmHistory] = useState<{time: number[], motor1: number[], motor2: number[], motor3: number[]}>({
    time: [], motor1: [], motor2: [], motor3: [],
  });
  const [trajectory, setTrajectory] = useState<Trajectory>({
    currentPosition: { x: 0, y: 0, theta: 0 },
    points: { x: [], y: [] },
    status: 'unknown',
    progress_percent: 0
  });

  // Handler for robot_status messages
  const handleRobotStatusUpdate = useCallback((data: RobotStatusPayload) => {
    if (data.robot_ip && data.robot_ip !== selectedRobotId) return;

      setRobotStatus(prev => ({
        ...prev,
        connected: true,
      lastUpdate: data.timestamp || Date.now(),
      encoders: data.encoders !== undefined ? { rpm: data.encoders.rpm } : prev.encoders,
      pid: data.pid !== undefined ? data.pid : prev.pid,
      position: data.position !== undefined ? data.position : prev.position,
      battery: data.battery !== undefined ? data.battery : prev.battery,
    }));

    if (data.encoders?.rpm) {
      const now = data.timestamp || Date.now();
      setRpmHistory(prevHist => {
        const newTime = [...prevHist.time, now];
        const newMotor1 = [...prevHist.motor1, data.encoders!.rpm[0] || 0];
        const newMotor2 = [...prevHist.motor2, data.encoders!.rpm[1] || 0];
        const newMotor3 = [...prevHist.motor3, data.encoders!.rpm[2] || 0];
          
          const maxPoints = 100;
            return {
              time: newTime.slice(-maxPoints),
              motor1: newMotor1.slice(-maxPoints),
              motor2: newMotor2.slice(-maxPoints),
              motor3: newMotor3.slice(-maxPoints),
          };
        });
      }
    if (data.trajectory) {
        setTrajectory(prev => ({...prev, ...data.trajectory}));
    }
      setError(null);
  }, [selectedRobotId]);

  // Handler for trajectory messages
  const handleTrajectoryUpdate = useCallback((data: TrajectoryDataPayload) => {
    if (data.robot_ip && data.robot_ip !== selectedRobotId) return;

    setTrajectory(prev => ({
        currentPosition: {
        x: data.current_x ?? prev.currentPosition.x,
        y: data.current_y ?? prev.currentPosition.y,
        theta: data.current_theta ?? prev.currentPosition.theta,
        },
      points: data.points ?? prev.points,
      status: data.status ?? prev.status,
      progress_percent: data.progress_percent ?? prev.progress_percent,
    }));
    setLoading(false);
    setError(null);
  }, [selectedRobotId]);

  // Handler for error messages from WebSocket
  const handleErrorUpdate = useCallback((data: BaseMessagePayload) => {
    if (data.robot_ip && data.robot_ip !== selectedRobotId) return;
    setError(data.message || 'Đã xảy ra lỗi không xác định từ WebSocket');
      setLoading(false);
  }, [selectedRobotId]);

  // Subscribe to relevant WebSocket messages
  useEffect(() => {
    if (!selectedRobotId || !webSocketIsConnected) {
      setRobotStatus(prev => ({...defaultStatus, connected: false}));
      return;
    }
    
    setRobotStatus(prev => ({...prev, connected: true }));

    const subscriptions: (()=>void)[] = [];

    if (liveUpdateEnabled) {
        sendMessage({ type: "direct_subscribe", data_type: "robot_status", robot_ip: selectedRobotId });
        subscriptions.push(subscribeToMessageType('robot_status', handleRobotStatusUpdate as any, `status-widget-status-${selectedRobotId}`));
    } else {
        sendMessage({ type: "get_robot_status", robot_ip: selectedRobotId });
    }
    
    sendMessage({ type: "direct_subscribe", data_type: "trajectory_update", robot_ip: selectedRobotId });
    subscriptions.push(subscribeToMessageType('trajectory_update', handleTrajectoryUpdate as any, `status-widget-trajectory-${selectedRobotId}`));
    
    subscriptions.push(subscribeToMessageType('trajectory_history_response', handleTrajectoryUpdate as any, `status-widget-trajectory-history-${selectedRobotId}`));

    subscriptions.push(subscribeToMessageType('error', handleErrorUpdate as any, `status-widget-error-${selectedRobotId}`));

    return () => {
      sendMessage({ type: "direct_unsubscribe", data_type: "robot_status", robot_ip: selectedRobotId });
      sendMessage({ type: "direct_unsubscribe", data_type: "trajectory_update", robot_ip: selectedRobotId });
      subscriptions.forEach(unsub => unsub());
    };
  }, [selectedRobotId, webSocketIsConnected, liveUpdateEnabled, sendMessage, subscribeToMessageType, handleRobotStatusUpdate, handleTrajectoryUpdate, handleErrorUpdate]);

  // Yêu cầu dữ liệu quỹ đạo (lịch sử)
  const requestTrajectoryHistory = useCallback(() => {
    if (!selectedRobotId || !webSocketIsConnected) {
      setError("Chưa kết nối hoặc chưa chọn robot.");
      return;
    }
    setLoading(true);
    setError(null);
    sendMessage({
      type: 'get_trajectory_history',
      robot_ip: selectedRobotId
    });
  }, [selectedRobotId, webSocketIsConnected, sendMessage]);

  // Bật/tắt cập nhật trực tiếp cho Status/RPM
  const toggleLiveUpdate = useCallback(() => {
    setLiveUpdateEnabled(prev => !prev);
  }, []);

  // Đặt lại tất cả dữ liệu
  const resetData = () => {
    setRobotStatus(defaultStatus);
    setTrajectory({
        currentPosition: { x: 0, y: 0, theta: 0 },
        points: { x: [], y: [] }, status: 'unknown', progress_percent: 0
    });
    setRpmHistory({ time: [], motor1: [], motor2: [], motor3: [] });
    setError(null);
  };

  // Fetch initial data when robot is selected (if not using live update initially)
  useEffect(() => {
    if (selectedRobotId && webSocketIsConnected && !liveUpdateEnabled) {
      sendMessage({ type: "get_robot_status", robot_ip: selectedRobotId });
      requestTrajectoryHistory();
        }
  }, [selectedRobotId, webSocketIsConnected, liveUpdateEnabled, sendMessage, requestTrajectoryHistory]);

  const downloadTrajectoryData = useCallback(() => {
    if (!trajectory.points.x.length) return;

    const csvData = trajectory.points.x.map((xVal, i) => 
      `${xVal},${trajectory.points.y[i]},${trajectory.points.theta?.[i] ?? ''}`
    ).join('\n');
    
    const blob = new Blob([`X,Y,Theta\n${csvData}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectory_${selectedRobotId}_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [trajectory, selectedRobotId]);

  const resetRobotPosition = useCallback(() => {
    if (!selectedRobotId || !webSocketIsConnected) {
        setError("Chưa kết nối hoặc chưa chọn robot.");
        return;
    }
    sendMessage({
      type: 'robot_command',
      robot_id: selectedRobotId,
      command: 'reset_odometry'
    });
    setTimeout(() => {
      requestTrajectoryHistory();
    }, 500);
  },[selectedRobotId, webSocketIsConnected, sendMessage, requestTrajectoryHistory]);

  const widgetReady = webSocketIsConnected && !!selectedRobotId;
  let statusTextForHeader = "";
  if (!selectedRobotId) {
    statusTextForHeader = "Vui lòng chọn robot";
  } else if (!webSocketIsConnected) {
    statusTextForHeader = "WebSocket chưa kết nối";
  } else if (loading) {
    statusTextForHeader = "Đang tải dữ liệu...";
  } else if (widgetReady) {
    statusTextForHeader = `Đang theo dõi ${selectedRobotId}`;
    if (liveUpdateEnabled) statusTextForHeader += " (Live)";
  }

  // RPM Chart Data and Options (mostly unchanged, ensure data sources are correct)
  const rpmChartData = {
    labels: rpmHistory.time.map(t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
    datasets: [
      { label: 'Motor 1', data: rpmHistory.motor1, borderColor: 'rgba(255, 99, 132, 1)', backgroundColor: 'rgba(255, 99, 132, 0.2)', pointRadius: 0, borderWidth: 1.5, tension: 0.3 },
      { label: 'Motor 2', data: rpmHistory.motor2, borderColor: 'rgba(54, 162, 235, 1)', backgroundColor: 'rgba(54, 162, 235, 0.2)', pointRadius: 0, borderWidth: 1.5, tension: 0.3 },
      { label: 'Motor 3', data: rpmHistory.motor3, borderColor: 'rgba(75, 192, 192, 1)', backgroundColor: 'rgba(75, 192, 192, 0.2)', pointRadius: 0, borderWidth: 1.5, tension: 0.3 },
    ],
  };
  const rpmChartOptions = {
    scales: { x: { ticks: { maxTicksLimit: 10, autoSkipPadding: 15 } }, y: { title: { display: true, text: 'RPM' }, beginAtZero: true } },
    animation: false as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' as const } }
  };

  // Trajectory Chart Data and Options (updated to use 'trajectory' state)
  const trajectoryChartData = {
    datasets: [
      {
        label: 'Quỹ đạo',
        data: trajectory.points.x.map((x, i) => ({ x, y: trajectory.points.y[i] })),
        borderColor: 'rgba(54, 162, 235, 1)', backgroundColor: 'rgba(54, 162, 235, 0.2)',
        pointRadius: 1, showLine: true, borderWidth: 1.5, tension: 0.1
      },
      {
        label: 'Vị trí hiện tại',
        data: [{ x: trajectory.currentPosition.x, y: trajectory.currentPosition.y }],
        borderColor: 'rgba(255, 0, 0, 1)', backgroundColor: 'rgba(255, 0, 0, 1)',
        pointRadius: 6, pointStyle: 'triangle' as const, 
        rotation: trajectory.currentPosition.theta * 180 / Math.PI,
      }
    ],
  };
  const trajectoryChartOptions = {
    scales: { x: { type: 'linear' as const, position: 'bottom' as const, title: { display: true, text: 'X (m)' } }, y: { type: 'linear' as const, title: { display: true, text: 'Y (m)' } } },
    aspectRatio: 1.5, responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c:any) => `(X: ${c.raw.x.toFixed(2)}, Y: ${c.raw.y.toFixed(2)})` } } }
  };

  return (
    <div className="flex flex-col gap-4 p-3 bg-gray-50 rounded-lg">
      <WidgetConnectionHeader 
        title="Trạng thái Robot" 
        isConnected={widgetReady}
        error={webSocketError || error}
        statusTextOverride={statusTextForHeader}
        hideConnectionControls={true}
      />

      {error && !webSocketError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded mb-3">
          <p className="font-medium">Lỗi Widget:</p>
          <p>{error}</p>
        </div>
      )}
      {(webSocketError) && (
        <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-3 rounded mb-3">
          <p className="font-medium">Lỗi WebSocket:</p>
          <p>{typeof webSocketError === 'string' ? webSocketError : webSocketError.type || "Không rõ lỗi"}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Thông tin Robot</h3>
            <button 
              onClick={() => sendMessage({ type: "get_robot_status", robot_ip: selectedRobotId })}
              disabled={!widgetReady || loading}
              className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Kết nối Robot:</span>
              <span className={`font-medium ${robotStatus.connected && webSocketIsConnected ? "text-green-600" : "text-red-600"}`}>
                {robotStatus.connected && webSocketIsConnected ? "Đã kết nối" : "Ngắt kết nối"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Cập nhật cuối:</span>
              <span className="font-medium">
                {robotStatus.lastUpdate ? new Date(robotStatus.lastUpdate).toLocaleTimeString() : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Pin:</span>
              <span className="font-medium">
                {robotStatus.battery.voltage.toFixed(1)}V ({robotStatus.battery.percent.toFixed(0)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vị trí (X, Y):</span>
              <span className="font-medium">
                {robotStatus.position.x.toFixed(2)}m, {robotStatus.position.y.toFixed(2)}m
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hướng (Theta):</span>
              <span className="font-medium">
                {(robotStatus.position.theta * 180 / Math.PI).toFixed(1)}°
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium mb-4">RPM Bánh Xe</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[0, 1, 2].map(idx => (
              <div key={idx} className={`p-3 bg-${idx === 0 ? 'blue' : idx === 1 ? 'green' : 'purple'}-50 rounded-lg text-center`}>
                <div className="text-xs text-gray-500 mb-1">Motor {idx + 1}</div>
                <div className={`text-xl font-bold text-${idx === 0 ? 'blue' : idx === 1 ? 'green' : 'purple'}-700`}>
                    {robotStatus.encoders.rpm[idx]?.toFixed(0) ?? 'N/A'}
            </div>
              <div className="text-xs text-gray-500">RPM</div>
            </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Lịch sử RPM</h3>
          <div className="flex gap-2">
            <button
              onClick={toggleLiveUpdate}
              disabled={!widgetReady}
              className={`p-2 rounded-full ${liveUpdateEnabled 
                ? "bg-green-100 text-green-600 hover:bg-green-200" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {liveUpdateEnabled ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={() => setRpmHistory({ time: [], motor1: [], motor2: [], motor3: [] })}
              disabled={!widgetReady}
              className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        <div className="h-60">
          <Line data={rpmChartData} options={rpmChartOptions as any} />
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Quỹ đạo Robot</h3>
          <div className="flex gap-2">
            <button
              onClick={requestTrajectoryHistory}
              disabled={!widgetReady || loading}
              className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 disabled:opacity-50"
              title="Cập nhật lịch sử quỹ đạo"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={resetRobotPosition}
              disabled={!widgetReady}
              className="p-2 bg-yellow-100 text-yellow-600 rounded-full hover:bg-yellow-200 disabled:opacity-50"
              title="Đặt lại vị trí robot về (0,0,0)"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={downloadTrajectoryData}
              disabled={!widgetReady || trajectory.points.x.length === 0}
              className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 disabled:opacity-50"
              title="Tải xuống dữ liệu quỹ đạo dạng CSV"
            >
              <Download size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex justify-between mb-2 text-sm">
            <div>
              <span>X: <strong className="font-mono">{trajectory.currentPosition.x.toFixed(2)}m</strong></span>
              <span className="ml-3">Y: <strong className="font-mono">{trajectory.currentPosition.y.toFixed(2)}m</strong></span>
              <span className="ml-3">θ: <strong className="font-mono">{(trajectory.currentPosition.theta * 180 / Math.PI).toFixed(1)}°</strong></span>
            </div>
            <div className="text-gray-500">
              {trajectory.points.x.length} điểm lịch sử
            </div>
          </div>
          {trajectory.points.x.length > 0 ? (
            <div style={{ height: '300px', width: '100%' }}>
              <Line data={trajectoryChartData} options={trajectoryChartOptions as any} />
            </div>
          ) : (
            <div className="h-[300px] w-full flex items-center justify-center text-gray-400 border border-dashed rounded-md">
              {loading ? "Đang tải quỹ đạo..." : "Không có dữ liệu quỹ đạo lịch sử. Hãy thử làm mới."}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium mb-4">Thông số PID (Motor 1, 2, 3)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['motor1', 'motor2', 'motor3'] as const).map((motorKey, idx) => (
            <div key={motorKey} className={`border rounded-lg p-3 bg-${idx === 0 ? 'red' : idx === 1 ? 'green' : 'indigo'}-50`}>
              <div className={`text-center font-medium mb-2 text-${idx === 0 ? 'red' : idx === 1 ? 'green' : 'indigo'}-700`}>Motor {idx + 1}</div>
            <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Kp:</span><span className="font-mono">{robotStatus.pid[motorKey].kp.toFixed(3)}</span></div>
                <div className="flex justify-between"><span>Ki:</span><span className="font-mono">{robotStatus.pid[motorKey].ki.toFixed(3)}</span></div>
                <div className="flex justify-between"><span>Kd:</span><span className="font-mono">{robotStatus.pid[motorKey].kd.toFixed(3)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RobotStatusWidget;