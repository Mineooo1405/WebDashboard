import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRobotContext } from './RobotContext';
import { Download, RotateCcw, Search, Pause, Filter, XCircle, PlayCircle, LogIn, LogOut } from 'lucide-react';
import WidgetConnectionHeader from './WidgetConnectionHeader';
import { ReadyState } from 'react-use-websocket';

// Cấu trúc một mục log
interface LogEntry {
  message: string;
  timestamp: number;
  robotAlias: string; // Changed from robotIp to robotAlias
  level: string; 
  component: string; 
}

// Interface cho payload log từ WebSocket
interface WebSocketLogPayload {
  type: 'log'; // Nên khớp với type được gửi từ backend
  robot_alias: string; // Changed from robot_id to robot_alias
  message: string;
  timestamp: number;
  level: string;
  component?: string; // component có thể tùy chọn từ backend
  robot_ip?: string; // robot_ip is also available from the message
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-red-600 bg-red-50',
  WARNING: 'text-yellow-600 bg-yellow-50',
  INFO: 'text-blue-600 bg-blue-50',
  DEBUG: 'text-gray-600 bg-gray-100',
  VERBOSE: 'text-purple-600 bg-purple-50',
  DEFAULT: 'text-gray-700 bg-gray-50'
};

const LogWidget: React.FC = () => {
  const { selectedRobotId, sendJsonMessage, lastJsonMessage, readyState } = useRobotContext();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [componentFilter, setComponentFilter] = useState<string[]>([]); 
  const [availableComponents, setAvailableComponents] = useState<string[]>([]);
  const [showLevelFilter, setShowLevelFilter] = useState(false);
  const [showComponentFilter, setShowComponentFilter] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false); 
  const [widgetError, setWidgetError] = useState<string | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true);

  const parseComponentFromMessage = (message: string): string => {
    const componentMatch = message.match(/\(([^)]+)\)/); 
    return componentMatch && componentMatch[1] ? componentMatch[1].trim() : '';
  };

  useEffect(() => {
    if (readyState === ReadyState.OPEN && lastJsonMessage && selectedRobotId && isSubscribed) {
      const message = lastJsonMessage as WebSocketLogPayload;
      if (message.type === 'log' && message.robot_alias === selectedRobotId) {
        const newLogEntry: LogEntry = {
          timestamp: message.timestamp || Date.now(),
          level: message.level?.toUpperCase() || 'INFO',
          message: message.message || 'No message content',
          robotAlias: message.robot_alias,
          component: message.component || parseComponentFromMessage(message.message || '')
        };
        if (!isPaused) {
            setLogs(prev => [...prev, newLogEntry].slice(-1000));
            if (newLogEntry.component && !availableComponents.includes(newLogEntry.component)) {
                setAvailableComponents(prev => [...prev, newLogEntry.component].sort());
            }
        }
        setWidgetError(null);
      }
    } else if (readyState !== ReadyState.OPEN && isSubscribed) {
      // If WS disconnects while widget thinks it's subscribed, update state
      // setIsSubscribed(false); // Or show an error/warning
    }
  }, [lastJsonMessage, readyState, selectedRobotId, isSubscribed, isPaused, availableComponents]);

  useEffect(() => {
    if (isAutoScrollEnabled.current && scrollContainerRef.current && !isPaused) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  const toggleSubscription = useCallback(() => {
    if (readyState !== ReadyState.OPEN) {
      setWidgetError("WebSocket không kết nối.");
      return;
    }
    if (!selectedRobotId) {
      setWidgetError("Chưa chọn robot (alias).");
      return;
    }

    const newSubscribedState = !isSubscribed;
    setIsSubscribed(newSubscribedState);
    setWidgetError(null);

    if (newSubscribedState) {
      console.log(`LogWidget: Subscribing to log_data for alias ${selectedRobotId}`);
      sendJsonMessage({
        command: "direct_subscribe",
        type: "log",
        robot_alias: selectedRobotId
      });
      setLogs([]);
    } else {
      console.log(`LogWidget: Unsubscribing from log_data for alias ${selectedRobotId}`);
      sendJsonMessage({
        command: "direct_unsubscribe",
        type: "log",
        robot_alias: selectedRobotId
      });
    }
  }, [isSubscribed, selectedRobotId, sendJsonMessage, readyState]);
  
  useEffect(() => {
    if (selectedRobotId && readyState === ReadyState.OPEN) {
      if (isSubscribed) {
        console.log(`LogWidget: Re-subscribing to log_data for new alias ${selectedRobotId}`);
        sendJsonMessage({
          command: "direct_subscribe",
          type: "log",
          robot_alias: selectedRobotId
        });
        setLogs([]);
      }
    }

    return () => {
      if (selectedRobotId && readyState === ReadyState.OPEN && isSubscribed) { 
        console.log(`LogWidget: Unsubscribing from log_data for alias ${selectedRobotId} on cleanup/change`);
        sendJsonMessage({
          command: "direct_unsubscribe",
          type: "log",
          robot_alias: selectedRobotId
        });
      }
    };
  }, [selectedRobotId, readyState, isSubscribed, sendJsonMessage]);

  const filteredLogs = logs.filter(log => {
    if (filterText && !log.message.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (levelFilter.length > 0 && !levelFilter.includes(log.level)) return false;
    if (componentFilter.length > 0 && !componentFilter.includes(log.component)) return false;
    return true;
  });

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = () => {
    const logsToDownload = filteredLogs; 
    if (logsToDownload.length === 0) {
        setWidgetError("Không có log nào để tải xuống (dựa trên bộ lọc hiện tại).");
        return;
    }
    setWidgetError(null);
    
    let csvContent = 'Timestamp,Robot Alias,Level,Component,Message\n';
    logsToDownload.forEach(log => {
      const formattedMessage = log.message.replace(/"/g, '""');
      const ts = log.timestamp > 2000000000 ? log.timestamp : log.timestamp * 1000;
      const formattedTime = new Date(ts).toISOString(); 
      csvContent += `"${formattedTime}","${log.robotAlias}","${log.level}","${log.component}","${formattedMessage}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robot_logs_${selectedRobotId || 'all'}_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const togglePause = () => setIsPaused(!isPaused);

  const toggleLevelFilter = (level: string) => {
    setLevelFilter(prev => prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]);
  };

  const toggleComponentFilter = (component: string) => {
    setComponentFilter(prev => prev.includes(component) ? prev.filter(c => c !== component) : [...prev, component]);
  };

  const formatTimestamp = (timestamp: number) => {
    const ts = timestamp > 2000000000 ? timestamp : timestamp * 1000;
    return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2 });
  };

  const getLogLevelColor = (level: string): string => {
    return LOG_LEVEL_COLORS[level.toUpperCase()] || LOG_LEVEL_COLORS.DEFAULT;
  };

  let derivedStatusText: string;
  if (readyState === ReadyState.CONNECTING) {
    derivedStatusText = "WS: Connecting...";
  } else if (readyState !== ReadyState.OPEN) {
    derivedStatusText = "WS: Disconnected";
  } else if (!selectedRobotId) {
    derivedStatusText = "Chưa chọn robot";
  } else if (isSubscribed) {
    derivedStatusText = isPaused ? "Subscribed (Paused)" : "Subscribed - Live Logs";
  } else {
    derivedStatusText = "Connected (Idle - Not Subscribed)";
  }

  return (
    <div className="p-4 bg-gray-800 text-gray-200 rounded-lg shadow-xl h-full flex flex-col">
      <WidgetConnectionHeader
        title={`Robot Logs (${selectedRobotId || 'Chưa chọn Robot'})`}
        statusTextOverride={derivedStatusText}
        isConnected={readyState === ReadyState.OPEN && !!selectedRobotId}
        error={widgetError}
      />
      
      <div className="flex flex-wrap gap-2 mb-3 mt-3 items-center">
        {selectedRobotId && readyState === ReadyState.OPEN && (
          <button
            onClick={toggleSubscription}
            className={`px-3 py-2 rounded-md flex items-center gap-1 text-sm font-medium
                        ${isSubscribed 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-green-600 hover:bg-green-700 text-white'}`}
          >
            {isSubscribed ? <LogOut size={14} /> : <LogIn size={14} />}
            <span>{isSubscribed ? 'Stop Logs' : 'Start Logs'}</span>
          </button>
        )}

        <div className="relative flex-grow min-w-[150px]">
          <input
            type="text"
            placeholder="Tìm kiếm logs..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full px-3 py-2 pr-10 border border-gray-600 bg-gray-700 text-gray-200 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <Search size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowLevelFilter(!showLevelFilter)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md flex items-center gap-1 text-sm"
          >
            <Filter size={14} />
            <span>Level {levelFilter.length > 0 && `(${levelFilter.length})`}</span>
          </button>
          
          {showLevelFilter && (
            <div className="absolute top-full right-0 mt-1 z-20 bg-gray-700 shadow-lg border border-gray-600 rounded-md p-2 w-48">
              <div className="flex flex-col gap-1">
                {['ERROR', 'WARNING', 'INFO', 'DEBUG', 'VERBOSE'].map(level => (
                  <label key={level} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-600 rounded text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={levelFilter.includes(level)}
                      onChange={() => toggleLevelFilter(level)}
                      className="rounded text-blue-500 focus:ring-blue-400 bg-gray-600 border-gray-500"
                    />
                    <span className={getLogLevelColor(level).split(' ')[0]}>{level}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowComponentFilter(!showComponentFilter)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md flex items-center gap-1 text-sm"
            disabled={availableComponents.length === 0}
          >
            <Filter size={14} />
            <span>Component {componentFilter.length > 0 && `(${componentFilter.length})`}</span>
          </button>
          
          {showComponentFilter && availableComponents.length > 0 && (
            <div className="absolute top-full right-0 mt-1 z-20 bg-gray-700 shadow-lg border border-gray-600 rounded-md p-2 w-48 max-h-60 overflow-y-auto">
              <div className="flex flex-col gap-1">
                {availableComponents.map(comp => (
                  <label key={comp} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-600 rounded text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={componentFilter.includes(comp)}
                      onChange={() => toggleComponentFilter(comp)}
                      className="rounded text-blue-500 focus:ring-blue-400 bg-gray-600 border-gray-500"
                    />
                    <span>{comp}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <button
          onClick={togglePause}
          disabled={!isSubscribed}
          className={`px-3 py-2 rounded-md flex items-center gap-1 text-sm font-medium 
            ${ isPaused 
              ? "bg-green-600 hover:bg-green-700 text-white" 
              : "bg-yellow-600 hover:bg-yellow-700 text-white"}
            disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isPaused ? <PlayCircle size={14} /> : <Pause size={14} />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>
        
        <button
          onClick={clearLogs}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md flex items-center gap-1 text-sm disabled:opacity-50"
          disabled={logs.length === 0}
        >
          <RotateCcw size={14} />
          <span>Clear</span>
        </button>
        
        <button
          onClick={downloadLogs}
          disabled={filteredLogs.length === 0} 
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md flex items-center gap-1 text-sm disabled:opacity-50 ml-auto"
        >
          <Download size={14} />
          <span>CSV</span>
        </button>
      </div>
      
      {widgetError && (
        <div className="mb-3 p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-md flex items-center gap-2 text-sm">
          <XCircle size={14} />
          <span>{widgetError}</span>
        </div>
      )}
      
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto font-mono text-xs bg-gray-900 rounded-md p-2 border border-gray-700"
        style={{ minHeight: '200px'}}
        onScroll={(e) => {
          const element = e.currentTarget;
          const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 20; 
          isAutoScrollEnabled.current = isAtBottom;
        }}
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            {readyState !== ReadyState.OPEN ? "WebSocket chưa kết nối." :
             !selectedRobotId ? "Vui lòng chọn một robot." :
             !isSubscribed ? "Nhấn 'Start Logs' để xem log." :
             isPaused ? "Log đang tạm dừng. Nhấn Resume để tiếp tục." :
             "Đang chờ log từ robot..."
            }
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((log, index) => (
              <div key={index} className={`p-1.5 rounded-sm ${getLogLevelColor(log.level).split(' ')[1]}`}>
                <div className={`flex gap-2 mb-0.5 ${getLogLevelColor(log.level).split(' ')[0]}`}>
                  <span>{formatTimestamp(log.timestamp)}</span>
                  <span>(Alias: {log.robotAlias})</span>
                  {log.component && <span className="text-purple-400">[{log.component}]</span>}
                  <span className="font-semibold">{log.level}</span>
                </div>
                <div className={`whitespace-pre-wrap break-all ${getLogLevelColor(log.level).split(' ')[0]}`}>
                  {log.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        <span>Hiển thị {filteredLogs.length} / {logs.length} logs</span>
        <span>
          {readyState === ReadyState.OPEN ? 'WS: Connected' : 'WS: Disconnected'} -
          {selectedRobotId ? (isSubscribed ? (isPaused ? ' Paused' : ' Live') : ' Idle') : ' No Robot'}
        </span>
      </div>
    </div>
  );
};

export default LogWidget;