import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketProvider';

// TODO: Define more specific mock payload interfaces if needed for better type safety
// interface MockImuPayload { robot_ip: string; roll: number; pitch: number; yaw: number; timestamp: number; }
// interface MockEncoderPayload { robot_ip: string; data: { fl: number; fr: number; rl: number; rr: number }; timestamp: number; }
// interface MockLogPayload { robot_ip: string; message: string; level: string; timestamp: number; }

const WidgetDataSimulator: React.FC = () => {
    const { sendMessage, addOnSendListener } = useWebSocket();
    const [simulatedRobotIp, setSimulatedRobotIp] = useState<string>('sim_robot_1');
    const [outgoingMessages, setOutgoingMessages] = useState<any[]>([]);

    // State for auto-simulation
    const [isAutoSimulating, setIsAutoSimulating] = useState<boolean>(false);

    // --- Mock Data States ---
    // IMU
    const [mockImuRoll, setMockImuRoll] = useState<number>(0);
    const [mockImuPitch, setMockImuPitch] = useState<number>(0);
    const [mockImuYaw, setMockImuYaw] = useState<number>(0);

    // Encoder
    const [mockEncoderFL, setMockEncoderFL] = useState<number>(0);
    const [mockEncoderFR, setMockEncoderFR] = useState<number>(0);
    const [mockEncoderRL, setMockEncoderRL] = useState<number>(0);
    const [mockEncoderRR, setMockEncoderRR] = useState<number>(0);
    
    // Log
    const [mockLogMessage, setMockLogMessage] = useState<string>('Đây là một tin nhắn log mô phỏng.');
    const [mockLogLevel, setMockLogLevel] = useState<string>('INFO');

    // Robot Status
    const [mockRobotStatus, setMockRobotStatus] = useState<string>('Đang hoạt động');
    const [mockRobotBattery, setMockRobotBattery] = useState<number>(85);

    // Position Update (Trajectory)
    const [mockPositionX, setMockPositionX] = useState<number>(1.0);
    const [mockPositionY, setMockPositionY] = useState<number>(2.5);
    const [mockPositionTheta, setMockPositionTheta] = useState<number>(0.785); // ~45 degrees in radians


    useEffect(() => {
        if (addOnSendListener) {
            const unsubscribe = addOnSendListener((message: any) => {
                if (message.type !== 'SIMULATOR_DISPATCH_MESSAGE_TO_WIDGETS') {
                    setOutgoingMessages(prev => [message, ...prev].slice(0, 50)); // Keep last 50, newest first
                }
            });
            return () => unsubscribe();
        }
    }, [addOnSendListener]);

    // useEffect for auto-simulation intervals
    useEffect(() => {
        let imuIntervalId: NodeJS.Timeout | undefined;
        let encoderIntervalId: NodeJS.Timeout | undefined;

        if (isAutoSimulating) {
            const sendRandomImuData = () => {
                const roll = Math.random() * 1 - 0.5; // -0.5 to 0.5 (approx)
                const pitch = Math.random() * 0.6 - 0.3; // -0.3 to 0.3 (approx)
                const yaw = Math.random() * (2 * Math.PI) - Math.PI; // -PI to PI
                dispatchMockData('imu', {
                    data: {
                        euler: [roll, pitch, yaw],
                        quaternion: [1, 0, 0, 0] // Default quaternion
                    }
                });
            };

            const sendRandomEncoderData = () => {
                const rpm1 = Math.random() * 60 - 30; // -30 to 30
                const rpm2 = Math.random() * 60 - 30;
                const rpm3 = Math.random() * 60 - 30;
                dispatchMockData('encoder', { rpm1, rpm2, rpm3 });
            };

            imuIntervalId = setInterval(sendRandomImuData, 1000); // Every 1 second
            encoderIntervalId = setInterval(sendRandomEncoderData, 1000); // Every 1 second
        }

        return () => {
            if (imuIntervalId) clearInterval(imuIntervalId);
            if (encoderIntervalId) clearInterval(encoderIntervalId);
        };
    }, [isAutoSimulating, simulatedRobotIp, sendMessage]); // Added dependencies

    const dispatchMockData = (actual_type: string, content_payload: any) => {
        if (!sendMessage) {
            console.warn('Simulator: sendMessage function is not available.');
            return;
        }

        let messageToSend;
        const FORWARD_TO_BACKEND_TYPE = 'FORWARD_TO_BACKEND_FOR_PROCESSING';
        const LOCAL_DISPATCH_TYPE = 'SIMULATOR_DISPATCH_MESSAGE_TO_WIDGETS';

        if (actual_type === 'imu' || actual_type === 'encoder') {
            let raw_robot_data_field;
            let robot_message_type_for_transform;

            if (actual_type === 'imu') {
                robot_message_type_for_transform = 'bno055'; // Match direct_bridge transform target
                // content_payload is expected to be { data: { euler: [...], quaternion: [...] } }
                raw_robot_data_field = {
                    time: Date.now() / 1000, // Timestamp from "robot"
                    euler: content_payload.data.euler,
                    quaternion: content_payload.data.quaternion
                };
            } else { // encoder
                robot_message_type_for_transform = 'encoder';
                // content_payload is expected to be { rpm1, rpm2, rpm3 }
                raw_robot_data_field = [content_payload.rpm1, content_payload.rpm2, content_payload.rpm3];
            }

            const raw_robot_message_to_forward = {
                id: simulatedRobotIp, // Robot's own ID field for transform_robot_message
                type: robot_message_type_for_transform,
                data: raw_robot_data_field
            };

            messageToSend = {
                type: FORWARD_TO_BACKEND_TYPE,
                robot_ip_context: simulatedRobotIp, // For backend to identify the simulated source
                raw_message_content: raw_robot_message_to_forward // The message resembling what a robot sends via TCP
            };
        } else {
            // For 'log', 'robot_status', 'position_update' - use local dispatch
            messageToSend = {
                type: LOCAL_DISPATCH_TYPE,
                actual_type,
                payload: {
                    robot_ip: simulatedRobotIp,
                    robot_alias: `${simulatedRobotIp}_alias_local_sim`,
                    original_id_field: simulatedRobotIp,
                    timestamp: Date.now() / 1000, // Simulate bridge's receive time
                    ...content_payload
                },
            };
        }
        sendMessage(messageToSend);
        console.log('Simulator dispatched:', messageToSend);
    };

    // --- Handlers for dispatching mock data ---
    const handleSendImu = () => {
        dispatchMockData('imu', { 
            data: { 
                euler: [mockImuRoll, mockImuPitch, mockImuYaw],
                quaternion: [1, 0, 0, 0] // Default quaternion
            } 
        });
    };

    const handleSendEncoder = () => {
        dispatchMockData('encoder', { 
            rpm1: mockEncoderFL, 
            rpm2: mockEncoderFR, 
            rpm3: mockEncoderRL 
            // mockEncoderRR is currently not mapped as backend expects rpm1,2,3
        });
    };
    
    const handleSendLog = () => {
        dispatchMockData('log', { message: mockLogMessage, level: mockLogLevel });
    };

    const handleSendRobotStatus = () => {
        dispatchMockData('robot_status', { 
            status: mockRobotStatus, 
            battery: mockRobotBattery, 
            wifi_signal: -55 // Example value
        });
    };

    const handleSendPositionUpdate = () => {
        dispatchMockData('position_update', {
            position: {
                x: mockPositionX,
                y: mockPositionY,
                theta: mockPositionTheta,
            }
            // Optional: velocity, angular_velocity
        });
    };
    
    const styles = {
        container: { padding: '20px', fontFamily: 'Arial, sans-serif', display: 'flex', gap: '20px', maxHeight: '90vh', overflow: 'hidden' },
        panel: { flex: 1, border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9', overflowY: 'auto' as 'auto'},
        h2: { marginTop: '0', borderBottom: '1px solid #eee', paddingBottom: '10px', color: '#333' },
        h4: { marginTop: '15px', marginBottom: '8px', color: '#555' },
        inputGroup: { marginBottom: '10px', display: 'flex', flexDirection: 'column' as 'column', gap: '5px' },
        label: { marginBottom: '3px', fontSize: '14px', color: '#444' },
        input: { padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' },
        button: { padding: '10px 15px', border: 'none', borderRadius: '4px', background: '#007bff', color: 'white', fontSize: '14px', cursor: 'pointer', marginTop: '5px' },
        logArea: { listStyleType: 'none' as 'none', padding: '0', maxHeight: 'calc(80vh - 100px)', overflowY: 'auto' as 'auto', background: '#fff', border: '1px solid #eee', borderRadius: '4px', marginTop: '10px' },
        logItem: { borderBottom: '1px solid #eee', padding: '8px', fontSize: '12px', wordBreak: 'break-all' as 'break-all'}
    };

    return (
        <div style={styles.container}>
            <div style={styles.panel}>
                <h2 style={styles.h2}>Bộ mô phỏng Dữ liệu Widget</h2>
                <div style={styles.inputGroup}>
                    <label htmlFor="simRobotIp" style={styles.label}>IP Robot Mô phỏng:</label>
                    <input id="simRobotIp" type="text" value={simulatedRobotIp} onChange={(e) => setSimulatedRobotIp(e.target.value)} style={styles.input}/>
                </div>

                {/* Auto-simulation toggle button */}
                <div style={{ marginTop: '15px', marginBottom: '15px' }}>
                    <button 
                        onClick={() => setIsAutoSimulating(prev => !prev)} 
                        style={{...styles.button, background: isAutoSimulating ? '#dc3545' : '#28a745', width: '100%'}}
                    >
                        {isAutoSimulating ? 'Dừng Mô phỏng Tự động' : 'Bắt đầu Mô phỏng Tự động (IMU & Encoder)'}
                    </button>
                </div>

                <hr style={{ margin: '20px 0' }} />

                {/* IMU Simulator */}
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={styles.h4}>Dữ liệu IMU (rad)</h4>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Roll: <input type="number" step="0.01" value={mockImuRoll} onChange={e => setMockImuRoll(parseFloat(e.target.value))} style={styles.input}/></label>
                        <label style={styles.label}>Pitch: <input type="number" step="0.01" value={mockImuPitch} onChange={e => setMockImuPitch(parseFloat(e.target.value))} style={styles.input}/></label>
                        <label style={styles.label}>Yaw: <input type="number" step="0.01" value={mockImuYaw} onChange={e => setMockImuYaw(parseFloat(e.target.value))} style={styles.input}/></label>
                    </div>
                    <button onClick={handleSendImu} style={styles.button}>Gửi Dữ liệu IMU</button>
                </div>

                {/* Encoder Simulator */}
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={styles.h4}>Dữ liệu Encoder</h4>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>FL: <input type="number" value={mockEncoderFL} onChange={e => setMockEncoderFL(parseInt(e.target.value,10))} style={styles.input}/></label>
                        <label style={styles.label}>FR: <input type="number" value={mockEncoderFR} onChange={e => setMockEncoderFR(parseInt(e.target.value,10))} style={styles.input}/></label>
                        <label style={styles.label}>RL: <input type="number" value={mockEncoderRL} onChange={e => setMockEncoderRL(parseInt(e.target.value,10))} style={styles.input}/></label>
                        <label style={styles.label}>RR: <input type="number" value={mockEncoderRR} onChange={e => setMockEncoderRR(parseInt(e.target.value,10))} style={styles.input}/></label>
                    </div>
                    <button onClick={handleSendEncoder} style={styles.button}>Gửi Dữ liệu Encoder</button>
                </div>

                {/* Log Simulator */}
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={styles.h4}>Tin nhắn Log</h4>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Nội dung: <input type="text" value={mockLogMessage} onChange={e => setMockLogMessage(e.target.value)} style={styles.input}/></label>
                        <label style={styles.label}>Cấp độ: 
                            <select value={mockLogLevel} onChange={e => setMockLogLevel(e.target.value)} style={styles.input}>
                                <option value="INFO">INFO</option>
                                <option value="WARNING">WARNING</option>
                                <option value="ERROR">ERROR</option>
                                <option value="DEBUG">DEBUG</option>
                            </select>
                        </label>
                    </div>
                    <button onClick={handleSendLog} style={styles.button}>Gửi Tin nhắn Log</button>
                </div>

                 {/* Robot Status Simulator */}
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={styles.h4}>Trạng thái Robot</h4>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Trạng thái: <input type="text" value={mockRobotStatus} onChange={e => setMockRobotStatus(e.target.value)} style={styles.input}/></label>
                        <label style={styles.label}>Pin (%): <input type="number" value={mockRobotBattery} onChange={e => setMockRobotBattery(parseFloat(e.target.value))} style={styles.input} min="0" max="100"/></label>
                    </div>
                    <button onClick={handleSendRobotStatus} style={styles.button}>Gửi Trạng thái Robot</button>
                </div>

                {/* Position Update Simulator */}
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={styles.h4}>Cập nhật Vị trí (rad)</h4>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>X: <input type="number" step="0.1" value={mockPositionX} onChange={e => setMockPositionX(parseFloat(e.target.value))} style={styles.input}/></label>
                        <label style={styles.label}>Y: <input type="number" step="0.1" value={mockPositionY} onChange={e => setMockPositionY(parseFloat(e.target.value))} style={styles.input}/></label>
                        <label style={styles.label}>Theta: <input type="number" step="0.01" value={mockPositionTheta} onChange={e => setMockPositionTheta(parseFloat(e.target.value))} style={styles.input}/></label>
                    </div>
                    <button onClick={handleSendPositionUpdate} style={styles.button}>Gửi Cập nhật Vị trí</button>
                </div>

            </div>

            <div style={styles.panel}>
                <h2 style={styles.h2}>Log Tin nhắn Gửi đi từ Widgets</h2>
                <ul style={styles.logArea}>
                    {outgoingMessages.length === 0 && <li style={styles.logItem}>Chưa có tin nhắn nào...</li>}
                    {outgoingMessages.map((msg, index) => (
                        <li key={index} style={styles.logItem}>
                            <pre>{JSON.stringify(msg, null, 2)}</pre>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default WidgetDataSimulator; 