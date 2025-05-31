import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Play, Pause, AlertCircle } from 'lucide-react';
import WidgetConnectionHeader from './WidgetConnectionHeader';
import { useRobotContext } from './RobotContext';
import { ReadyState } from 'react-use-websocket';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

// Modify these constants for faster updates
const MAX_HISTORY_POINTS = 100; // Increased for better visualization, adjust as needed
const UI_UPDATE_INTERVAL = 50; // milliseconds, adjust for balance between responsiveness and performance

// Re-define EncoderData interface
interface EncoderData {
  rpm_1: number;
  rpm_2: number;
  rpm_3: number;
  timestamp: number; // Consistently use number for timestamp (epoch seconds or ms)
  robot_ip: string;
  robot_alias: string; // Added for clarity, though filtering will use this
}

const EncoderDataWidget: React.FC = () => {
  const { selectedRobotId, sendJsonMessage, lastJsonMessage, readyState } = useRobotContext();
  
  const [encoderData, setEncoderData] = useState<EncoderData>({
    rpm_1: 0,
    rpm_2: 0,
    rpm_3: 0,
    timestamp: Date.now() / 1000,
    robot_ip: '',
    robot_alias: ''
  });
  
  const [encoderHistory, setEncoderHistory] = useState<{
    timestamps: string[]; // For chart labels, formatted string
    encoder1: number[];
    encoder2: number[];
    encoder3: number[];
  }>({ timestamps: [], encoder1: [], encoder2: [], encoder3: [] });
  
  const [liveUpdate, setLiveUpdate] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  
  const messageBuffer = useRef<EncoderData[]>([]);
  const lastUIUpdateTime = useRef(0);
  const animationFrameId = useRef<number | null>(null);
  const chartRef = useRef<any>(null);
  const subscribedRobotId = useRef<string | null>(null); // Track the currently subscribed robot ID

  const formatTimestampForChart = (timestamp: number): string => {
    // Assuming timestamp is in seconds, convert to milliseconds for Date object
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2 });
  };
  
  const processMessageBuffer = useCallback(() => {
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
      if (messageBuffer.current.length === 0 || isPaused) return; // Added isPaused check here too
    
      const newMessages = [...messageBuffer.current];
      messageBuffer.current = [];
  
      if (newMessages.length > 0) {
        const latestMessage = newMessages[newMessages.length - 1];
        setEncoderData(latestMessage); // Update latest data display even if paused
      
      // Only update history if not paused
      //if (!isPaused) { // Removed the !isPaused check here, let it accumulate if needed, control display with pause
        setEncoderHistory(prev => {
            const newTimestamps = newMessages.map(msg => formatTimestampForChart(msg.timestamp));
            const newEncoder1 = newMessages.map(msg => msg.rpm_1);
            const newEncoder2 = newMessages.map(msg => msg.rpm_2);
            const newEncoder3 = newMessages.map(msg => msg.rpm_3);
          return {
              timestamps: [...prev.timestamps, ...newTimestamps].slice(-MAX_HISTORY_POINTS),
              encoder1: [...prev.encoder1, ...newEncoder1].slice(-MAX_HISTORY_POINTS),
              encoder2: [...prev.encoder2, ...newEncoder2].slice(-MAX_HISTORY_POINTS),
              encoder3: [...prev.encoder3, ...newEncoder3].slice(-MAX_HISTORY_POINTS)
          };
        });
      //} // Removed closing bracket
    }
  }, [isPaused]); // isPaused dependency is correct

  const scheduleUIUpdate = useCallback(() => {
    if (animationFrameId.current !== null) return;
    const now = Date.now();
    // Only schedule if there are messages and enough time passed OR if paused (to potentially clear buffer if needed later?)
    // Let's keep it simple: only schedule if not paused and buffer has messages
    if (!isPaused && messageBuffer.current.length > 0 && (now - lastUIUpdateTime.current) >= UI_UPDATE_INTERVAL) {
        lastUIUpdateTime.current = now;
      animationFrameId.current = requestAnimationFrame(() => {
        processMessageBuffer();
        animationFrameId.current = null; // Reset after processing
      });
    } else if (isPaused && animationFrameId.current) {
        // If paused, ensure any pending animation frame is cancelled
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
    }
  }, [processMessageBuffer, isPaused]); // Added isPaused

  useEffect(() => {
    if (lastJsonMessage && selectedRobotId) {
      const message = lastJsonMessage as any;
      if (message.robot_alias === selectedRobotId && message.type === 'encoder_data') {
        const rpmList = message.data as number[]; 

        if (rpmList && Array.isArray(rpmList) && rpmList.length >= 3) {
          const newEncoderEntry: EncoderData = {
            rpm_1: rpmList[0] ?? 0, 
            rpm_2: rpmList[1] ?? 0, 
            rpm_3: rpmList[2] ?? 0, 
            timestamp: message.timestamp || Date.now() / 1000,
            robot_ip: message.robot_ip, 
            robot_alias: message.robot_alias
          };
          
          if (liveUpdate) {
              messageBuffer.current.push(newEncoderEntry);
              scheduleUIUpdate(); 
              setWidgetError(null); 
          }
        } else {
          // console.warn("EncoderDataWidget: Received encoder_data but RPM data is missing, not an array, or not enough values:", message);
          // setWidgetError("Invalid RPM data received from robot."); // Keep this commented unless sure it's not flooding
        }
      }
    }
  }, [lastJsonMessage, selectedRobotId, liveUpdate, scheduleUIUpdate]); // Dependencies for message handling

  useEffect(() => {
    const shouldBeSubscribed = liveUpdate && !!selectedRobotId && readyState === ReadyState.OPEN;
    const isSubscribed = subscribedRobotId.current === selectedRobotId;

    // Need to subscribe?
    if (shouldBeSubscribed && !isSubscribed) {
      console.log(`EncoderWidget: Subscribing to encoder_data for ${selectedRobotId}`);
      sendJsonMessage({
        command: "direct_subscribe",
        type: "encoder_data",
        robot_alias: selectedRobotId
      });
      subscribedRobotId.current = selectedRobotId;
      setEncoderHistory({ timestamps: [], encoder1: [], encoder2: [], encoder3: [] });
      setEncoderData({ rpm_1: 0, rpm_2: 0, rpm_3: 0, timestamp: Date.now() / 1000, robot_ip: '', robot_alias: '' });
      messageBuffer.current = [];
      setWidgetError(null);
    }
    // Need to unsubscribe?
    else if (!shouldBeSubscribed && subscribedRobotId.current) {
      console.log(`EncoderWidget: Unsubscribing from encoder_data for ${subscribedRobotId.current}`);
      sendJsonMessage({
        command: "direct_unsubscribe",
        type: "encoder_data",
        robot_alias: subscribedRobotId.current
      });
      subscribedRobotId.current = null;
       messageBuffer.current = []; 
    }

    // Cleanup function
    return () => {
      if (subscribedRobotId.current && readyState === ReadyState.OPEN) {
        console.log(`EncoderWidget: Cleanup - Unsubscribing from ${subscribedRobotId.current} (encoder_data) on unmount/dependency change`);
        sendJsonMessage({
            command: "direct_unsubscribe",
            type: "encoder_data",
            robot_alias: subscribedRobotId.current
        });
        subscribedRobotId.current = null;
      }
    };
  }, [selectedRobotId, liveUpdate, readyState, sendJsonMessage]);

  const toggleLiveUpdate = useCallback(() => {
    if (readyState !== ReadyState.OPEN) {
      setWidgetError("WebSocket không kết nối.");
      return;
    }
    if (!selectedRobotId) {
      setWidgetError("Chưa chọn robot (alias).");
      return;
    }
    
    const newLiveStatus = !liveUpdate; // This will be the new state of liveUpdate after setLiveUpdate
    setLiveUpdate(newLiveStatus);
    setWidgetError(null);
    
    if (newLiveStatus) {
      // This block executes when turning live updates ON
      // The useEffect above will handle the actual subscription if conditions are met
      // (selectedRobotId is present, readyState is OPEN)
      // We can clear data here if desired when (re)starting live updates
      setEncoderHistory({ timestamps: [], encoder1: [], encoder2: [], encoder3: [] });
      setEncoderData({ rpm_1: 0, rpm_2: 0, rpm_3: 0, timestamp: Date.now() / 1000, robot_ip: '', robot_alias: '' });
      messageBuffer.current = [];
      // The useEffect will now see liveUpdate as true and should subscribe
    } else {
      // This block executes when turning live updates OFF
      // The useEffect above will handle the unsubscription
      messageBuffer.current = []; // Clear buffer when stopping
      // Data can be kept frozen or cleared based on preference
    }

  }, [selectedRobotId, readyState, liveUpdate, sendJsonMessage]); // sendJsonMessage is a dependency for useEffect

  useEffect(() => {
    const intervalId = setInterval(scheduleUIUpdate, UI_UPDATE_INTERVAL);
    return () => clearInterval(intervalId);
  }, [scheduleUIUpdate]);

  useEffect(() => {
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, []);

  const clearHistory = () => {
    setEncoderHistory({ timestamps: [], encoder1: [], encoder2: [], encoder3: [] });
    messageBuffer.current = [];
    setEncoderData({ rpm_1: 0, rpm_2: 0, rpm_3: 0, timestamp: Date.now() / 1000, robot_ip: '', robot_alias: '' });
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  const downloadData = () => {
    if (encoderHistory.timestamps.length === 0) {
      setWidgetError("Không có dữ liệu lịch sử để tải xuống.");
      return;
    }
    setWidgetError(null);
    const csvHeader = "Timestamp,RPM1,RPM2,RPM3\\n";
    const csvRows = encoderHistory.timestamps.map((ts, idx) => 
      `${ts},${encoderHistory.encoder1[idx]},${encoderHistory.encoder2[idx]},${encoderHistory.encoder3[idx]}`
    ).join("\\n");
    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `encoder_data_${selectedRobotId || 'unknown'}_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
    // When resuming, might want to immediately schedule an update if buffer has data
    if (!isPaused) { // Note: isPaused is the value *before* toggle
        scheduleUIUpdate();
    }
  }, [isPaused, scheduleUIUpdate]); // Added scheduleUIUpdate

  let derivedStatusText: string;
  if (readyState === ReadyState.CONNECTING) {
    derivedStatusText = "WS: Connecting...";
  } else if (readyState !== ReadyState.OPEN) {
    derivedStatusText = "WS: Disconnected";
  } else if (!selectedRobotId) {
    derivedStatusText = "No robot selected";
  } else if (liveUpdate && subscribedRobotId.current === selectedRobotId) { // Check subscription status too
    derivedStatusText = "Live Update Active";
  } else if (liveUpdate && subscribedRobotId.current !== selectedRobotId) {
    derivedStatusText = "Live Update Pending..."; // Indicate waiting for subscription
  } else {
    derivedStatusText = "Connected (Idle)";
  }

  const chartData = {
    labels: encoderHistory.timestamps,
    datasets: [
      {
        label: 'Encoder 1 RPM',
        data: encoderHistory.encoder1,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1,
        pointRadius: 2,
      },
      {
        label: 'Encoder 2 RPM',
        data: encoderHistory.encoder2,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.1,
        pointRadius: 2,
      },
      {
        label: 'Encoder 3 RPM',
        data: encoderHistory.encoder3,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        tension: 0.1,
        pointRadius: 2,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const, // Disable Chart.js animation for performance with frequent updates
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 10, // Adjust for readability
          color: '#AAA',
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#AAA',
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#CCC',
        }
      },
      title: {
        display: false,
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x' as const,
        },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x' as const,
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full p-4 bg-gray-800 text-gray-200 rounded-lg shadow-xl">
      <WidgetConnectionHeader
        title={`Encoder Data (${selectedRobotId || 'Chưa chọn Robot'})`}
        statusTextOverride={derivedStatusText}
        isConnected={liveUpdate}
        error={widgetError}
        onConnect={!liveUpdate ? toggleLiveUpdate : undefined}
        onDisconnect={liveUpdate ? toggleLiveUpdate : undefined}
        hideConnectionControls={!(selectedRobotId && readyState === ReadyState.OPEN)}
      />
      
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <button
          onClick={togglePause}
          disabled={!liveUpdate || readyState !== ReadyState.OPEN || !selectedRobotId} 
          title={isPaused ? 'Tiếp tục biểu đồ' : 'Đóng băng biểu đồ'}
          className={`px-3 py-1.5 rounded-md flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed
            ${isPaused ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
          <span>{isPaused ? 'Resume Chart' : 'Freeze Chart'}</span>
        </button>
        
        <button
          onClick={clearHistory}
          title="Xóa lịch sử và reset biểu đồ"
          className="px-3 py-1.5 bg-gray-600 text-white rounded-md flex items-center gap-1 hover:bg-gray-700 disabled:opacity-50"
        >
          <RefreshCw size={14} />
          <span>Clear</span>
        </button>
        
        <button
          onClick={downloadData}
          disabled={encoderHistory.timestamps.length === 0}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-md flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
        >
          <span>Download CSV</span>
        </button>
      </div>

      {widgetError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-sm break-all">
          <AlertCircle size={16} className="inline mr-2" /> {widgetError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[encoderData.rpm_1, encoderData.rpm_2, encoderData.rpm_3].map((rpm, idx) => (
          <div key={idx} className={`p-3 rounded-lg text-center shadow-md 
            ${idx === 0 ? 'bg-blue-700' : idx === 1 ? 'bg-red-700' : 'bg-green-700'} text-white`}
          >
            <div className="text-sm opacity-80 mb-1">Encoder {idx + 1}</div>
            <div className={`text-2xl font-bold`}>{rpm.toFixed(1)}</div>
            <div className="text-xs opacity-80">RPM</div>
        </div>
        ))}
      </div>

      <div className="flex-grow relative" style={{ minHeight: '300px' }}>
        { (readyState === ReadyState.OPEN && selectedRobotId && encoderHistory.timestamps.length > 0) || (!liveUpdate && encoderHistory.timestamps.length > 0) ? (
          <div className="relative h-full w-full">
            <Line ref={chartRef} options={chartOptions as any} data={chartData} />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 border border-dashed border-gray-700 rounded-md bg-gray-800/30">
            { readyState !== ReadyState.OPEN ? "WebSocket chưa kết nối.":
              !selectedRobotId ? "Vui lòng chọn một robot." :
              !liveUpdate && encoderHistory.timestamps.length === 0 ? "Nhấn 'Start Live' trong header để xem dữ liệu." : // Updated text
              liveUpdate && subscribedRobotId.current !== selectedRobotId ? "Đang đăng ký nhận dữ liệu..." : // Added state
              liveUpdate && encoderHistory.timestamps.length === 0 ? "Đang chờ dữ liệu encoder..." :
              "Không có dữ liệu để hiển thị."
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default EncoderDataWidget;