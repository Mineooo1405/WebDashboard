import React, { useState, useRef, useEffect, useCallback } from "react"; // Removed useContext
import { Upload, AlertCircle, Check, RefreshCw, Wifi, Network, Plug, Power, 
         Zap, FileType, Terminal, History, Info, ArrowRight, Clock, Download, 
         CheckCircle, XCircle, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useWebSocket } from '../contexts/WebSocketProvider';
import { useRobotContext } from './RobotContext';

// Cập nhật interface cho robot
// Removed unused Robot interface
// interface Robot { 
//   robot_id: string;
//   ip: string;
//   active?: boolean;
//   port?: number;
//   last_seen?: number;
// }

interface FirmwareMessage {
  type: string;
  robot_ip: string; // Changed from robot_id to robot_ip to match bridge's output
  filename?: string;
  filesize?: number;
  version?: string;
  ota_port?: number;
  chunk_index?: number;
  total_chunks?: number;
  data?: string;
  binary_format?: boolean; 
  status?: 'success' | 'error' | 'connected' | 'disconnected' | 'firmware_prepared_for_ota' | 'ota_progress' | 'ota_complete' | 'ota_failed' | 'firmware_chunk_ack'; // Added more specific statuses
  message?: string;
  progress?: number;
  build_date?: string;
  features?: string[];
  deviceTarget?: string;
  description?: string;
  md5_hash?: string; // Added based on bridge logic
  firmware_size?: number; // Added based on bridge logic for firmware_prepared_for_ota
  received?: number; // For firmware_chunk_ack
}

interface FirmwareHistory {
  timestamp: number;
  version: string;
  status: 'success' | 'failed';
  filesize?: number;
  filename?: string;
  duration?: number;
}

const FirmwareUpdateWidget: React.FC = () => {
  const { selectedRobotId, connectedRobots } = useRobotContext(); // Get connectedRobots for IP lookup
  const { sendMessage, subscribeToMessageType, isConnected: webSocketIsConnected, error: webSocketError } = useWebSocket();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Stages:
  // 'idle': Initial, or after a successful/failed OTA
  // 'file_selected': A robot is selected, file is selected. Ready to upload to bridge.
  // 'uploading_to_bridge': "Send Firmware" was clicked. File is being uploaded to bridge.
  // 'bridge_ready_for_robot': Bridge has the file and is ready for the robot to connect for OTA.
  // 'error': An error occurred.
  const [otaStatus, setOtaStatus] = useState<
    'idle' |
    'ota_type_selected' |
    'robot_selected_for_ota0' |
    'robot_selected_for_ota1' |
    'ota1_upgrade_command_sent' |
    'file_selected' | // Generic: file is selected, ready for upload (applies after robot selection for OTA0, or after OTA1 command)
    'uploading_to_bridge' |
    'bridge_ready_for_robot' |
    'error'
  >('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [showLogs, setShowLogs] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [firmwareHistory, setFirmwareHistory] = useState<FirmwareHistory[]>([]);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadBitrate, setUploadBitrate] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [firmwareInfo, setFirmwareInfo] = useState<{
    buildDate?: string;
    deviceTarget?: string;
    features?: string[];
    description?: string;
  }>({});
  const [targetRobotForOtaIp, setTargetRobotForOtaIp] = useState<string | null>(null);
  const [otaType, setOtaType] = useState<'OTA0' | 'OTA1' | null>(null);

  // State for expected OTA0 IP
  const [expectedOta0Ip, setExpectedOta0Ip] = useState<string>("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // const [ipAddress, setIpAddress] = useState(""); // This will be derived and stored in targetRobotForOtaIp
  
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setUpdateLogs(prev => [...prev, logMessage]);
  }, []);
    
  useEffect(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
  }, [updateLogs]);

  // Effect to determine and set the target IP for OTA operations
  useEffect(() => {
    addLog(`IP Determination Effect: otaType=${otaType}, selectedRobotId(alias)=${selectedRobotId}, expectedOta0Ip=${expectedOta0Ip}`);
    if (otaType === 'OTA0') {
      if (expectedOta0Ip) {
        setTargetRobotForOtaIp(expectedOta0Ip);
        addLog(`OTA0: Using expected IP: ${expectedOta0Ip}`);
      } else if (selectedRobotId) {
        const robot = connectedRobots.find(r => r.alias === selectedRobotId);
        if (robot && robot.ip) {
          setTargetRobotForOtaIp(robot.ip);
          addLog(`OTA0: Using IP from selected robot ${selectedRobotId}: ${robot.ip}`);
        } else {
          setTargetRobotForOtaIp(null); // Clear if robot not found or no IP
          addLog(`OTA0: Selected robot ${selectedRobotId} not found or has no IP. Cleared target IP.`);
        }
      } else {
        setTargetRobotForOtaIp(null); // No expected IP and no selected robot
        addLog("OTA0: No expected IP and no selected robot. Cleared target IP.");
      }
    } else if (otaType === 'OTA1') {
      if (selectedRobotId) {
        const robot = connectedRobots.find(r => r.alias === selectedRobotId);
        if (robot && robot.ip) {
          setTargetRobotForOtaIp(robot.ip);
          addLog(`OTA1: Using IP from selected robot ${selectedRobotId}: ${robot.ip}`);
        } else {
          setTargetRobotForOtaIp(null);
          addLog(`OTA1: Selected robot ${selectedRobotId} not found or has no IP. Cleared target IP.`);
        }
      } else {
        setTargetRobotForOtaIp(null); // No selected robot for OTA1
        addLog("OTA1: No selected robot. Cleared target IP.");
      }
    } else { // otaType is null
      setTargetRobotForOtaIp(null);
      addLog("No OTA type selected. Cleared target IP.");
    }
  }, [otaType, selectedRobotId, expectedOta0Ip, connectedRobots, addLog]);

  // Simplified otaStatus management based on targetRobotForOtaIp and selectedFile
  useEffect(() => {
    addLog(`OTA Status Effect: otaType=${otaType}, targetIP=${targetRobotForOtaIp}, file=${!!selectedFile}, currentOtaStatus=${otaStatus}`);

    // Guard: If in an active upload/ready state or error, don't change status automatically here.
    if (otaStatus === 'uploading_to_bridge' || otaStatus === 'bridge_ready_for_robot' || otaStatus === 'error') {
      addLog(`OTA Status Effect: Guarded, status is ${otaStatus}. No change.`);
      return;
    }

    // Guard: If no OTA type or no target IP, reset to idle (unless already idle).
    if (!otaType || !targetRobotForOtaIp) {
      if (otaStatus !== 'idle') {
        addLog(`OTA Status Effect: No otaType or targetIP. Setting to 'idle'.`);
        setOtaStatus('idle');
      }
      return;
    }

    // At this point, otaType and targetRobotForOtaIp are defined.
    // And otaStatus is not one of the guarded active/final states.

    if (selectedFile) {
      // File is selected. Generally, this means we're ready for upload, so 'file_selected'.
      if (otaStatus !== 'file_selected') {
        addLog(`OTA Status Effect: File selected. Setting to 'file_selected'.`);
        setOtaStatus('file_selected');
      }
    } else { // No file selected
      if (otaType === 'OTA0') {
        // OTA0, target IP is known, but no file yet.
        if (otaStatus !== 'robot_selected_for_ota0') {
          addLog(`OTA Status Effect: OTA0, no file. Setting to 'robot_selected_for_ota0'.`);
          setOtaStatus('robot_selected_for_ota0');
        }
      } else if (otaType === 'OTA1') {
        // OTA1, target IP is known, but no file yet.
        // If command was already sent, it should remain 'ota1_upgrade_command_sent' (waiting for file).
        // Otherwise, it's 'robot_selected_for_ota1' (waiting for command and/or file).
        if (otaStatus === 'ota1_upgrade_command_sent') {
          // Stay in this state, waiting for file.
          addLog(`OTA Status Effect: OTA1, no file, command already sent. Staying 'ota1_upgrade_command_sent'.`);
        } else if (otaStatus !== 'robot_selected_for_ota1') {
          // If not already 'robot_selected_for_ota1' (and not 'ota1_upgrade_command_sent'), set it.
          addLog(`OTA Status Effect: OTA1, no file, command not sent/pending. Setting to 'robot_selected_for_ota1'.`);
          setOtaStatus('robot_selected_for_ota1');
        } else if (otaStatus === 'robot_selected_for_ota1') {
            addLog(`OTA Status Effect: OTA1, no file, staying 'robot_selected_for_ota1'.`);
        }
      }
    }
  }, [otaType, targetRobotForOtaIp, selectedFile, otaStatus, addLog]); 

  const handleActualFirmwareResponse = useCallback((message: FirmwareMessage) => {
    addLog(`WS MSG: ${JSON.stringify(message)}`);
    // Filter by targetRobotForOtaIp
    if (message.robot_ip !== targetRobotForOtaIp) {
      addLog(`Ignoring message for ${message.robot_ip}, current target is ${targetRobotForOtaIp}`);
      return;
    }

    if (message.type === 'firmware_prepared_for_ota') { 
      // Backend now sends status inside the message, not as part of type.
      // Bridge sends robot_ip, ota_port, firmware_size, md5_hash
      setOtaStatus('bridge_ready_for_robot');
      setProgress(100); // Indicates bridge part is done
      addLog(`✅ Firmware đã sẵn sàng trên server cho robot ${message.robot_ip} (Port: ${message.ota_port}, Size: ${message.firmware_size}, MD5: ${message.md5_hash}). Vui lòng khởi động lại robot để bắt đầu cập nhật OTA.`);
      if (selectedFile) {
            const newHistory: FirmwareHistory = {
              timestamp: Date.now(),
              version: message.version || currentVersion, // Use version from message if available
              status: 'success', 
              filesize: selectedFile.size,
              filename: selectedFile.name,
              duration: uploadStartTime ? (Date.now() - uploadStartTime) / 1000 : undefined
            };
            setFirmwareHistory(prev => [newHistory, ...prev]);
      }
    } else if (message.type === 'firmware_status' && message.status === 'error') { // General error from bridge for this robot
        setOtaStatus('error');
        setErrorMessage(message.message || `Lỗi từ bridge cho robot ${message.robot_ip}`);
        addLog(`❌ Lỗi từ bridge cho ${message.robot_ip}: ${message.message || 'Không rõ lỗi'}`);
    } else if (message.type === 'firmware_response' && message.status === 'error') {
      setErrorMessage(message.message || "Lỗi không xác định từ firmware_response");
      setOtaStatus('error');
      addLog(`❌ Lỗi firmware_response: ${message.message || "Lỗi không xác định"}`);
      if (selectedFile) {
        const newHistory: FirmwareHistory = {
          timestamp: Date.now(),
          version: message.version || "unknown",
          status: 'failed',
          filesize: selectedFile.size,
          filename: selectedFile.name
        };
        setFirmwareHistory(prev => [newHistory, ...prev]);
      }
    } else if (message.type === 'firmware_chunk_ack') { 
        const receivedBytes = message.received as number | undefined;
        if (receivedBytes !== undefined && selectedFile) {
            const totalSize = selectedFile.size;
            const currentProgress = (receivedBytes / totalSize) * 100;
            setProgress(currentProgress);
            if (uploadStartTime) {
                const elapsedSeconds = (Date.now() - uploadStartTime) / 1000;
                if (elapsedSeconds > 0) {
                    const bitrateKBps = receivedBytes / elapsedSeconds / 1024;
                    setUploadBitrate(bitrateKBps);
                }
            }
        }
    } else if (message.type === 'ota_status') { // Messages from robot during OTA (e.g. progress, completion)
        addLog(`OTA Status from Robot ${message.robot_ip}: ${message.status} - ${message.message} (${message.progress}%)`);
        if (message.progress) setProgress(message.progress);
        if (message.status === 'ota_complete') {
            addLog(`✅ OTA thành công cho robot ${message.robot_ip}`);
            setOtaStatus('idle'); // Reset for next operation
            // Potentially clear selected file or target IP after success
        } else if (message.status === 'ota_failed') {
            addLog(`❌ OTA thất bại cho robot ${message.robot_ip}: ${message.message}`);
            setOtaStatus('error');
            setErrorMessage(message.message || "Lỗi OTA từ robot.");
        }
    }
  }, [addLog, selectedFile, uploadStartTime, currentVersion, targetRobotForOtaIp, setOtaStatus, setFirmwareHistory, setErrorMessage, setProgress, setUploadBitrate]);

  const handleActualFirmwareProgress = useCallback((message: FirmwareMessage) => {
        setProgress(message.progress || 0);
  }, [setProgress]);

  const handleActualFirmwareVersion = useCallback((message: FirmwareMessage) => {
    const newVersion = message.version || "Unknown";
    setCurrentVersion(newVersion);
    if (message.build_date || message.deviceTarget || message.features || message.description) {
          setFirmwareInfo({
            buildDate: message.build_date,
        deviceTarget: message.deviceTarget,
            features: message.features || [],
            description: message.description
          });
        }
    addLog(`Phiên bản firmware hiện tại: ${newVersion}`);
  }, [addLog, setCurrentVersion, setFirmwareInfo]);
        
  useEffect(() => {
    const uniqueIdPrefix = 'FirmwareUpdateWidget';

    const unsubFirmwarePrepared = subscribeToMessageType('firmware_prepared_for_ota', handleActualFirmwareResponse, `${uniqueIdPrefix}-firmware_prepared`);
    const unsubFirmwareStatusError = subscribeToMessageType('firmware_status', handleActualFirmwareResponse, `${uniqueIdPrefix}-firmware_status_error`); // For bridge errors
    const unsubFirmwareResponseError = subscribeToMessageType('firmware_response', handleActualFirmwareResponse, `${uniqueIdPrefix}-firmware_response_error`);
    const unsubChunkAck = subscribeToMessageType('firmware_chunk_ack', handleActualFirmwareResponse, `${uniqueIdPrefix}-chunk_ack`);
    const unsubOtaStatus = subscribeToMessageType('ota_status', handleActualFirmwareResponse, `${uniqueIdPrefix}-ota_status`); // For robot's OTA feedback
    const unsubFirmwareProg = subscribeToMessageType('firmware_progress', handleActualFirmwareProgress, `${uniqueIdPrefix}-firmware_progress`);
    const unsubFirmwareVer = subscribeToMessageType('firmware_version', handleActualFirmwareVersion, `${uniqueIdPrefix}-firmware_version`);

    return () => {
      unsubFirmwarePrepared();
      unsubFirmwareStatusError();
      unsubFirmwareResponseError();
      unsubChunkAck();
      unsubOtaStatus();
      unsubFirmwareProg();
      unsubFirmwareVer();
    };
  }, [subscribeToMessageType, handleActualFirmwareResponse, handleActualFirmwareProgress, handleActualFirmwareVersion]);
  
  useEffect(() => {
    if (webSocketError) {
      addLog(`WebSocket Connection Error: ${webSocketError.type}`);
      setErrorMessage(`Lỗi kết nối WebSocket. Kiểm tra console.`);
    }
  }, [webSocketError, addLog, setErrorMessage]);
  
  const handleUploadFileToBridge = async () => {
    // targetRobotForOtaIp is now set by the useEffect hook
    if (!selectedFile || !webSocketIsConnected || !targetRobotForOtaIp) {
      setErrorMessage("Chưa chọn file, chưa xác định IP robot mục tiêu, hoặc chưa kết nối tới DirectBridge.");
      setOtaStatus('error');
      addLog(`Upload precondition failed: file=${!!selectedFile}, ws=${webSocketIsConnected}, targetIP=${targetRobotForOtaIp}`);
      return;
    }
    
    // setTargetRobotForOtaIp(targetIpForUpload); // No longer needed here, set by useEffect
    setOtaStatus('uploading_to_bridge');
    setProgress(0);
    setErrorMessage('');
    setUploadStartTime(Date.now());
    setUploadBitrate(null);
    addLog(`Bắt đầu tải file firmware ${selectedFile.name} lên DirectBridge cho robot ${targetRobotForOtaIp}`);

    const reader = new FileReader();
    reader.onload = async (e) => {
      if (e.target?.result) {
        const arrayBuffer = e.target.result as ArrayBuffer;
        sendMessage({
          type: 'upload_firmware_start',
          robot_ip: targetRobotForOtaIp, // Use resolved IP
          filename: selectedFile.name,
          filesize: selectedFile.size
        });
        try {
          const bytes = new Uint8Array(arrayBuffer);
          const chunkSize = 1024 * 4; 
          const totalChunks = Math.ceil(bytes.length / chunkSize);
          addLog(`Chuẩn bị gửi ${totalChunks} chunks dữ liệu lên bridge...`);
        
          const sendChunkWithDelay = (chunkIndex: number): Promise<void> => {
            return new Promise((resolve, reject) => {
              setTimeout(() => {
                try {
                  const start = chunkIndex * chunkSize;
                  const end = Math.min(start + chunkSize, bytes.length);
                  const chunk = bytes.slice(start, end);
                  const isLastChunk = chunkIndex === totalChunks - 1;
                  const base64Chunk = btoa(Array.from(chunk).map(byte => String.fromCharCode(byte)).join(''));

                  sendMessage({
                    type: 'firmware_data_chunk',
                    robot_ip: targetRobotForOtaIp, // Use resolved IP
                    chunk_index: chunkIndex,
                    total_chunks: totalChunks,
                    data: base64Chunk,
                    is_last_chunk: isLastChunk 
                  });

                  if (chunkIndex % 25 === 0 || isLastChunk) {
                    if (isLastChunk) {
                         addLog(`Đã gửi chunk cuối cùng (${chunkIndex + 1}/${totalChunks}) lên bridge.`);
                    }
                  }
                  resolve();
                } catch (error) {
                    console.error(`Lỗi khi gửi chunk ${chunkIndex} lên bridge:`, error);
                    addLog(`Lỗi khi gửi chunk ${chunkIndex} lên bridge: ${error instanceof Error ? error.message : String(error)}`);
                    reject(error);
                }
              }, 5); 
            });
          };

          for (let i = 0; i < totalChunks; i++) {
            await sendChunkWithDelay(i);
          }
          
          sendMessage({
            command: 'upload_firmware_end',
            type: 'upload_firmware_end',
            robot_ip: targetRobotForOtaIp // Use resolved IP
          });
          addLog("Đã gửi tất cả các chunks lên bridge. Chờ bridge xác nhận chuẩn bị xong cho OTA.");
        } catch (error) {
          setOtaStatus('error');
          setErrorMessage(error instanceof Error ? error.message : "Lỗi không xác định khi gửi firmware");
          addLog(`❌ Lỗi trong quá trình gửi firmware: ${error instanceof Error ? error.message : "Lỗi không xác định"}`);
          if (selectedFile) {
            const newHistory: FirmwareHistory = {
              timestamp: Date.now(),
              version: "unknown",
              status: 'failed',
              filesize: selectedFile.size,
              filename: selectedFile.name
            };
            setFirmwareHistory(prev => [newHistory, ...prev]);
          }
        }
      }
    };
    reader.onerror = (error) => {
      setOtaStatus('error');
      setErrorMessage("Lỗi đọc file: " + error);
      addLog(`Lỗi đọc file: ${error}`);
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setProgress(0);
    setErrorMessage('');
    if (file) {
      addLog(`Đã chọn file: ${file.name} (${formatFileSize(file.size)})`);
      // otaStatus will be updated by the useEffect watching [otaType, targetRobotForOtaIp, selectedFile]
    } else {
      addLog("File đã được bỏ chọn.");
      // otaStatus will be updated by the useEffect
    }
  };

  const checkCurrentVersion = () => {
    if (!webSocketIsConnected) {
      setErrorMessage("Chưa kết nối tới DirectBridge để kiểm tra phiên bản.");
      return;
    }
    let ipToQuery = targetRobotForOtaIp;
    if (!ipToQuery && selectedRobotId) {
        const robot = connectedRobots.find(r => r.alias === selectedRobotId);
        if (robot && robot.ip) ipToQuery = robot.ip;
    }

    if (!ipToQuery) {
        setErrorMessage("Chưa chọn robot hoặc IP để kiểm tra phiên bản.");
        return;
    }
    addLog(`Đang yêu cầu phiên bản firmware hiện tại cho IP: ${ipToQuery}...`);
    sendMessage({
      type: "get_firmware_version",
      robot_ip: ipToQuery, // Send robot_ip
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const copyLogs = () => {
    const logsText = updateLogs.join('\n');
    navigator.clipboard.writeText(logsText)
      .then(() => {
        addLog("Logs đã được sao chép vào clipboard");
      })
      .catch(err => {
        console.error("Không thể sao chép logs:", err);
      });
  };

  const handleCommandRobotToUpgradeForOTA1 = () => {
    if (!targetRobotForOtaIp || !webSocketIsConnected) {
      setErrorMessage("Lệnh Upgrade: Cần chọn Robot (để có IP) và đảm bảo đã kết nối WebSocket.");
      addLog(`Precondition for Upgrade command failed: targetIP=${targetRobotForOtaIp}, wsConnected=${webSocketIsConnected}`);
      return;
    }
    
    // setTargetRobotForOtaIp(ipAddress); // Already set by useEffect
    addLog(`Gửi lệnh "Upgrade" tới robot ${targetRobotForOtaIp}...`);
    sendMessage({
      robot_ip: targetRobotForOtaIp, // Send robot_ip
      command: "upgrade_signal", // Command to be sent to the robot
      type: "upgrade_signal", // Type of message
    });
    setErrorMessage(''); 
    setOtaStatus('ota1_upgrade_command_sent'); 

    if (selectedFile) {
      addLog("Lệnh Upgrade đã gửi. File đã được chọn. Tự động bắt đầu tải file lên bridge...");
      handleUploadFileToBridge();
    } else {
      addLog("Lệnh Upgrade đã gửi. Chưa có file. Vui lòng chọn file và nhấn 'Tải Firmware lên Server'.");
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border h-full flex flex-col overflow-hidden">
      <h3 className="text-lg font-medium mb-4 flex items-center justify-between">
        <span>Cập Nhật Firmware</span>
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Chế độ OTA:</span>
            <select 
                value={otaType || ''} 
                onChange={(e) => setOtaType(e.target.value as 'OTA0' | 'OTA1')} 
                className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
                <option value="">Chọn chế độ...</option>
                <option value="OTA0">OTA0 (Robot tự vào OTA)</option>
                <option value="OTA1">OTA1 (Server gửi lệnh "Upgrade")</option>
            </select>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md hover:bg-gray-200"
        >
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{showAdvanced ? "Cơ bản" : "Nâng cao"}</span>
        </button>
      </h3>

      {/* OTA0 Specific: Input for Expected IP */}
      {otaType === 'OTA0' && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <label htmlFor="expectedOta0Ip" className="block text-sm font-medium text-yellow-700 mb-1">
            Địa chỉ IP Robot Dự Kiến (cho OTA0 tức thời)
          </label>
          <input 
            type="text" 
            id="expectedOta0Ip"
            value={expectedOta0Ip}
            onChange={(e) => setExpectedOta0Ip(e.target.value.trim())}
            placeholder="Ví dụ: 192.168.1.11"
            className="w-full px-3 py-2 border border-yellow-300 rounded-md shadow-sm focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
            disabled={otaStatus === 'uploading_to_bridge' || otaStatus === 'bridge_ready_for_robot'}
          />
          <p className="text-xs text-yellow-600 mt-1">
            Điền IP của robot OTA0 nếu bạn muốn chuẩn bị firmware trước khi robot hiển thị trong danh sách.
          </p>
        </div>
      )}

      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <div className="mb-4 flex items-center bg-blue-50 p-3 rounded-md text-blue-700">
            <Info size={20} className="mr-2 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Robot: {selectedRobotId || "Chưa chọn"} (IP mục tiêu: {targetRobotForOtaIp || "N/A"})</p>
              <p className="text-sm">Phiên bản hiện tại: {currentVersion}</p>
              
              {firmwareInfo.buildDate && (
                <p className="text-xs mt-1">Build date: {firmwareInfo.buildDate}</p>
              )}
              
              {firmwareInfo.deviceTarget && (
                <p className="text-xs">Target: {firmwareInfo.deviceTarget}</p>
              )}
            </div>
            <button
              onClick={checkCurrentVersion}
              className="ml-auto p-1 hover:bg-blue-100 rounded-full flex-shrink-0"
              title="Kiểm tra phiên bản"
              disabled={!webSocketIsConnected}
            >
              <RefreshCw size={16} className={!webSocketIsConnected ? "opacity-50" : ""} />
            </button>
          </div>

          <div className="mb-4 flex items-center justify-between bg-gray-50 p-3 rounded-md">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${webSocketIsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span>{webSocketIsConnected ? 'Đã kết nối tới DirectBridge' : 'Chưa kết nối'}</span>
            </div>

            {!webSocketIsConnected && (
              <button
                onClick={() => { /*sendMessage({type: 'request_connect'}) or rely on auto-reconnect of WebSocketProvider */ }} 
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Kết nối
              </button>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chọn file firmware (.bin)
            </label>
            <div className="flex items-center">
              <input
                type="file"
                accept=".bin"
                onChange={handleFileChange}
                className="hidden"
                id="firmware-file"
                ref={fileInputRef}
              />
              <label
                htmlFor="firmware-file"
                className="px-4 py-2 bg-gray-100 text-gray-800 rounded-l-md hover:bg-gray-200 cursor-pointer"
              >
                Chọn file
              </label>
              <div className="flex-grow px-3 py-2 bg-gray-50 rounded-r-md border-l truncate">
                {selectedFile ? selectedFile.name : 'Chưa có file nào được chọn'}
              </div>
            </div>
          </div>

          {/* OTA0 Path Guidance */}
          {otaStatus === 'robot_selected_for_ota0' && otaType === 'OTA0' && targetRobotForOtaIp && (
            <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-3 rounded">
              <p className="font-medium">Chế độ OTA0: Robot mục tiêu IP {targetRobotForOtaIp}.</p>
              <p>Vui lòng chọn file firmware để tiếp tục.</p>
            </div>
          )}

          {/* OTA1 Path Guidance: Step 1 - Robot Selected, Ready to Command Upgrade */}
          {otaStatus === 'robot_selected_for_ota1' && otaType === 'OTA1' && targetRobotForOtaIp && (
            <div className="mb-4 bg-orange-50 border-l-4 border-orange-500 text-orange-700 p-3 rounded">
              <p className="font-medium">Chế độ OTA1: Robot mục tiêu IP {targetRobotForOtaIp}.</p>
              <p>Nhấn "Yêu cầu Robot vào Chế Độ Nâng Cấp (OTA1)" để robot chuẩn bị nhận firmware.</p>
            </div>
          )}

          {/* OTA1 Path Guidance: Step 2 - Upgrade Command Sent, Ready to Select File & Upload */}
          {otaStatus === 'ota1_upgrade_command_sent' && otaType === 'OTA1' && targetRobotForOtaIp && (
            <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 p-3 rounded">
              <p className="font-medium">Đã gửi lệnh "Upgrade" cho Robot {targetRobotForOtaIp} (OTA1)!</p>
              <p>Robot nên khởi động lại vào chế độ OTA. Tiếp theo, chọn file firmware (nếu chưa) và nhấn "Tải Firmware lên Server...".</p>
            </div>
          )}

          {otaStatus === 'file_selected' && targetRobotForOtaIp && selectedFile && (
            <div className="mb-4 bg-green-50 border-l-4 border-green-500 text-green-700 p-3 rounded">
              <p className="font-medium">Sẵn sàng tải lên!</p>
              <p>File: {selectedFile.name}. Robot IP: {targetRobotForOtaIp}. Chế độ: {otaType}.</p>
              <p>Nhấn "Tải Firmware lên Server cho Robot {targetRobotForOtaIp}" để tiếp tục.</p>
            </div>
          )}
          
          {otaStatus === 'bridge_ready_for_robot' && targetRobotForOtaIp && (
            <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-3 rounded">
              <p className="font-medium">Firmware đã sẵn sàng trên Server!</p>
              <p>Firmware đã được chuẩn bị cho robot {targetRobotForOtaIp}.</p>
              <p className="mt-1 font-semibold">Vui lòng khởi động lại robot {targetRobotForOtaIp} để bắt đầu quá trình cập nhật OTA.</p>
            </div>
          )}

          {otaStatus === 'uploading_to_bridge' && (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Đang tải file lên server cho {targetRobotForOtaIp}...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              
              {uploadBitrate !== null && (
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Tốc độ: {uploadBitrate.toFixed(1)} KB/s</span>
                  {uploadStartTime && (
                    <span>Thời gian: {((Date.now() - uploadStartTime) / 1000).toFixed(1)}s</span>
                  )}
                </div>
              )}
            </div>
          )}

          {otaStatus === 'error' && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded">
              <p className="font-medium">Lỗi</p>
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={handleCommandRobotToUpgradeForOTA1}
              disabled={!(otaType === 'OTA1' && targetRobotForOtaIp && webSocketIsConnected && (otaStatus === 'robot_selected_for_ota1' || otaStatus === 'file_selected'))}
              className={`px-4 py-2 rounded-md flex items-center gap-2 bg-orange-500 text-white hover:bg-orange-600
                ${!(otaType === 'OTA1' && targetRobotForOtaIp && webSocketIsConnected && (otaStatus === 'robot_selected_for_ota1' || otaStatus === 'file_selected')) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <Zap size={16} />
              <span>Gửi lệnh Upgrade</span>
            </button>

            <button
              onClick={handleUploadFileToBridge} 
              disabled={!(
                  webSocketIsConnected &&
                  targetRobotForOtaIp &&
                  selectedFile &&
                  otaStatus === 'file_selected'
              )}
              className={`px-4 py-2 rounded-md flex items-center gap-2
                ${ 
                  !(
                    webSocketIsConnected &&
                    targetRobotForOtaIp &&
                    selectedFile &&
                    otaStatus === 'file_selected'
                   )
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
              {otaStatus === 'uploading_to_bridge' ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Đang tải lên... {progress.toFixed(0)}%</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Tải Firmware lên Server cho Robot {targetRobotForOtaIp || ""}</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div 
              className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded-md"
              onClick={() => setShowLogs(!showLogs)}
            >
              <Terminal size={16} />
              <span className="font-medium text-sm">Logs cập nhật</span>
              {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
            {showLogs && (
              <div className="flex gap-1">
                <button
                  onClick={copyLogs}
                  className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1"
                >
                  <Download size={12} />
                  <span>Copy</span>
                </button>
                <button
                  onClick={() => setUpdateLogs([])}
                  className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          
          {showLogs && (
            <div 
              ref={logContainerRef}
              className="flex-grow h-40 overflow-y-auto bg-gray-900 text-gray-200 p-2 rounded-md mb-3 font-mono text-xs"
            >
              {updateLogs.length > 0 ? (
                updateLogs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-gray-500 italic">
                  Chưa có logs nào. Hãy thực hiện các thao tác để xem logs.
                </div>
              )}
            </div>
          )}
          
          <div className="flex items-center justify-between mb-2 mt-2">
            <div 
              className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded-md"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History size={16} />
              <span className="font-medium text-sm">Lịch sử cập nhật</span>
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>
          
          {showHistory && (
            <div className="flex-grow overflow-y-auto border rounded-md">
              {firmwareHistory.length > 0 ? (
                <div className="divide-y">
                  {firmwareHistory.map((item, index) => (
                    <div key={index} className="p-2 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{item.version}</div>
                        <div className={`text-xs px-2 py-0.5 rounded-full 
                          ${item.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.status === 'success' ? (
                            <span className="flex items-center gap-1">
                              <CheckCircle size={12} />
                              Thành công
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <XCircle size={12} />
                              Thất bại
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center">
                        <Clock size={12} className="mr-1" />
                        {formatDate(item.timestamp)}
                      </div>
                      {item.filename && (
                        <div className="text-xs mt-1 flex items-center">
                          <FileType size={12} className="mr-1" />
                          {item.filename} ({formatFileSize(item.filesize || 0)})
                        </div>
                      )}
                      {item.duration && (
                        <div className="text-xs text-gray-600 mt-1">
                          Thời gian: {item.duration.toFixed(1)} giây
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  Chưa có lịch sử cập nhật firmware nào.
                </div>
              )}
            </div>
          )}
          
          <div className="mt-3 bg-blue-50 p-3 rounded-md text-sm text-blue-800">
            <div className="flex items-center mb-1">
              <HelpCircle size={16} className="mr-1" />
              <span className="font-medium">Hướng dẫn cập nhật firmware:</span>
            </div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Chọn chế độ OTA (OTA0 hoặc OTA1).</li>
              <li>Chọn robot từ danh sách.</li>
              <li><b>Nếu OTA1:</b> Nhấn "Yêu cầu Robot vào Chế Độ Nâng Cấp (OTA1)". Chờ robot khởi động lại.</li>
              <li>Chọn file firmware (.bin).</li>
              <li>Nhấn "Tải Firmware lên Server cho Robot [tên robot]".</li>
              <li>Đợi quá trình tải lên bridge hoàn tất và nhận thông báo "Firmware đã sẵn sàng...".</li>
              <li>(Tùy chọn) Kiểm tra phiên bản firmware mới sau khi robot khởi động lại.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirmwareUpdateWidget;