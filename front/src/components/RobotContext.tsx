import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import useWebSocket, { ReadyState } from 'react-use-websocket';

// Define the WebSocket URL (direct_bridge.py default)
const WEBSOCKET_URL = process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:9003';

// Define the structure for a robot entry
export interface ConnectedRobot {
  alias: string;
  ip: string;
  key: string; // unique_key (ip:port) from backend
  status?: string; // Optional status like "connected"
}

interface RobotContextType {
  selectedRobotId: string | null; // Can be null if no robot is selected
  setSelectedRobotId: (alias: string | null) => void;
  connectedRobots: ConnectedRobot[]; // List of available robots
  sendJsonMessage: (jsonMessage: any, keep?: boolean | undefined) => void; 
  lastJsonMessage: any; 
  readyState: ReadyState;
  requestRobotListUpdate: () => void; 
}

const RobotContext = createContext<RobotContextType>({
  selectedRobotId: null,
  setSelectedRobotId: () => {},
  connectedRobots: [],
  sendJsonMessage: () => console.warn('sendJsonMessage called outside of RobotProvider'),
  lastJsonMessage: null,
  readyState: ReadyState.UNINSTANTIATED,
  requestRobotListUpdate: () => {},
});

export const useRobotContext = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error("useRobotContext must be used within a RobotProvider");
  }
  return context;
};

export const RobotProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [selectedRobotId, setSelectedRobotIdInternal] = useState<string | null>(null);
  const [connectedRobots, setConnectedRobotsState] = useState<ConnectedRobot[]>([]);

  const {
    sendJsonMessage,
    lastJsonMessage,
    readyState,
  } = useWebSocket(WEBSOCKET_URL, {
    share: true,
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('RobotContext: WebSocket Opened, requesting robot list.');
      sendJsonMessage({ command: 'get_available_robots' });
    },
    onClose: () => {
      console.log('RobotContext: WebSocket Closed.');
      setConnectedRobotsState([]);
      setSelectedRobotIdInternal(null);
    },
    onError: (event: Event) => {
      console.error('RobotContext: WebSocket Error:', event);
      setConnectedRobotsState([]);
      setSelectedRobotIdInternal(null);
    }
  });

  useEffect(() => {
    if (lastJsonMessage) {
      const message = lastJsonMessage as any;

      if ((message.type === 'connected_robots_list' || message.type === 'initial_robot_list') && message.robots) {
        console.log(`RobotContext: Received ${message.type} from backend`, message.robots);
        const newRobots: ConnectedRobot[] = Array.isArray(message.robots) ? message.robots.map((r: any) => ({
          alias: r.alias,
          ip: r.ip,
          key: r.key || r.unique_key,
          status: r.status
        })) : [];

        setConnectedRobotsState(newRobots);

        if (newRobots.length > 0) {
          const currentSelectedStillValid = newRobots.some(robot => robot.alias === selectedRobotId);
          if (selectedRobotId && !currentSelectedStillValid) {
            console.log(`[RobotContext] Selected robot ${selectedRobotId} is no longer valid. Clearing.`);
            setSelectedRobotIdInternal(null);
          } else if (!selectedRobotId) {
            console.log(`[RobotContext] No robot selected. Auto-selecting: ${newRobots[0].alias}`);
            setSelectedRobotIdInternal(newRobots[0].alias);
          }
        } else {
          if (selectedRobotId !== null) {
            console.log("[RobotContext] Robot list is empty. Clearing selection.");
            setSelectedRobotIdInternal(null);
          }
        }
      } else if (message.type === 'available_robot_update' && message.robot) {
        console.log('RobotContext: Received available_robot_update from backend', message);
        const updatedRobotInfo: ConnectedRobot = {
            alias: message.robot.alias,
            ip: message.robot.ip,
            key: message.robot.unique_key,
            status: message.robot.status
        };

        if (message.action === 'add') {
          setConnectedRobotsState(prevRobots => {
            if (!prevRobots.find(r => r.key === updatedRobotInfo.key)) {
              return [...prevRobots, updatedRobotInfo];
            }
            return prevRobots.map(r => r.key === updatedRobotInfo.key ? updatedRobotInfo : r);
          });
          if (!selectedRobotId) {
             setSelectedRobotIdInternal(updatedRobotInfo.alias);
          }
        } else if (message.action === 'remove') {
          setConnectedRobotsState(prevRobots => {
            const newRobots = prevRobots.filter(r => r.key !== updatedRobotInfo.key);
            if (selectedRobotId === updatedRobotInfo.alias) {
              console.log(`[RobotContext] Selected robot ${selectedRobotId} was removed via available_robot_update. Clearing selection.`);
              setSelectedRobotIdInternal(null);
            }
            return newRobots;
          });
        }
      }
    }
  }, [lastJsonMessage, selectedRobotId]);

  const setSelectedRobotId = useCallback((alias: string | null) => {
    console.log("[RobotContext] setSelectedRobotId called with:", alias, "| Current:", selectedRobotId);
    if (selectedRobotId !== alias) {
      setSelectedRobotIdInternal(alias);
    }
  }, [selectedRobotId]);

  useEffect(() => {
    console.log("[RobotContext] Current selectedRobotId state is now:", selectedRobotId);
  }, [selectedRobotId]);

  const requestRobotListUpdate = useCallback(() => {
    if (readyState === ReadyState.OPEN) {
      console.log('RobotContext: Manually requesting robot list update.');
      sendJsonMessage({ command: 'get_available_robots' });
    } else {
      console.warn("Cannot request robot list: WebSocket not open.");
    }
  }, [readyState, sendJsonMessage]);

  return (
    <RobotContext.Provider 
      value={{ 
        selectedRobotId, 
        setSelectedRobotId,
        connectedRobots, 
        sendJsonMessage,
        lastJsonMessage, 
        readyState,
        requestRobotListUpdate, 
      }}
    >
      {children}
    </RobotContext.Provider>
  );
};

// --- Utility functions for subscription (example) ---
// You might have these elsewhere
// let messageListeners: { [type: string]: { [id: string]: (message: any) => void } } = {};

// export const subscribeToMessageType = (type: string, callback: (message: any) => void, id: string): (() => void) => {
//     if (!messageListeners[type]) {
//         messageListeners[type] = {};
//     }
//     messageListeners[type][id] = callback;
//     return () => unsubscribeFromMessageType(type, id); // Return an unsubscribe function
// };

// export const unsubscribeFromMessageType = (type: string, id: string): void => {
//     if (messageListeners[type] && messageListeners[type][id]) {
//         delete messageListeners[type][id];
//         if (Object.keys(messageListeners[type]).length === 0) {
//             delete messageListeners[type];
//         }
//     }
// };

// // Need to call this function somewhere central when a message arrives from useWebSocket
// export const distributeMessage = (message: any) => {
//     if (message && message.type && messageListeners[message.type]) {
//         Object.values(messageListeners[message.type]).forEach(callback => {
//             try {
//                 callback(message);
//             } catch (error) {
//                 console.error(`Error in message listener for type ${message.type}:`, error);
//             }
//         });
//     }
// };

export { ReadyState };