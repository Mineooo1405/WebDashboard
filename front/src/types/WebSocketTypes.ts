// Định nghĩa các kiểu dữ liệu cho WebSocket messages
export interface BaseWSMessage {
  type: string;
  robot_id?: string;
  timestamp?: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  theta?: number;
}

export interface Position {
  x: number;
  y: number;
  theta: number;
}

export interface TrajectoryDataMessage extends BaseWSMessage {
  type: 'trajectory_data';
  current_position?: Position;
  current_x?: number;
  current_y?: number;
  current_theta?: number;
  points?: {
    x: number[];
    y: number[];
    theta: number[];
  };
}

export interface TrajectoryRecord {
  id: number;
  robot_id: string;
  timestamp: string;
  created_at?: string;
  current_position?: Position;
  current_x?: number;
  current_y?: number;
  current_theta?: number;
  points?: {
    x: number[];
    y: number[];
    theta: number[];
  };
}

export interface TrajectoryHistoryMessage extends BaseWSMessage {
  type: 'trajectory_history';
  trajectories: TrajectoryRecord[];
}

export interface ErrorMessage extends BaseWSMessage {
  type: 'error';
  message: string;
}

// Union type cho các message liên quan đến quỹ đạo
export type TrajectoryWSMessage = 
  | TrajectoryDataMessage
  | TrajectoryHistoryMessage
  | ErrorMessage;

// Union type cho tất cả WebSocket messages
export type WSMessage = 
  | TrajectoryWSMessage
  | BaseWSMessage;