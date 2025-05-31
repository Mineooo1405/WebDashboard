// Chuyển các hàm adapter vào file riêng để tránh circular dependency
export interface EncoderData {
  id?: number;
  robot_id?: number;
  data: number[];
  source_file?: string;
  created_at?: string;
  timestamp?: string;
}

export interface IMUData {
  id?: number;
  robot_id?: number;
  orientation: {
    roll: number;
    pitch: number;
    yaw: number;
  };
  quaternion?: number[];
  sensor_time?: number;
  timestamp?: string;
  created_at?: string;
  acceleration?: {
    x: number;
    y: number;
    z: number;
  };
  angular_velocity?: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * Chuyển đổi dữ liệu BNO055 từ database sang định dạng IMU cho frontend
 */
export function convertBNO055ToIMU(data: any): IMUData {
  // Nếu đã có định dạng IMU, trả về nguyên vẹn
  if (data?.orientation) {
    return data;
  }
  
  // Xử lý trường hợp nhận trực tiếp từ database
  if (data?.euler_roll !== undefined || data?.data?.euler) {
    const euler = data.data?.euler || [
      data.euler_roll || 0,
      data.euler_pitch || 0,
      data.euler_yaw || 0
    ];
    
    const quaternion = data.data?.quaternion || [
      data.quaternion_w || 0,
      data.quaternion_x || 0,
      data.quaternion_y || 0,
      data.quaternion_z || 0
    ];
    
    // Tạo dữ liệu acceleration và angular_velocity mới vì DB không có
    const defaultAcceleration = {
      x: 0,
      y: 0,
      z: 9.8 // Giá trị trọng lực mặc định
    };
    
    const defaultAngularVelocity = {
      x: 0,
      y: 0,
      z: 0
    };
    
    return {
      id: data.id,
      robot_id: data.robot_id,
      orientation: {
        roll: euler[0] || 0,
        pitch: euler[1] || 0,
        yaw: euler[2] || 0
      },
      quaternion: quaternion,
      sensor_time: data.sensor_time || data.data?.time,
      timestamp: data.created_at || data.timestamp || new Date().toISOString(),
      acceleration: defaultAcceleration,
      angular_velocity: defaultAngularVelocity
    };
  }
  
  // Fallback cho dữ liệu không đúng định dạng
  return {
    orientation: {
      roll: 0,
      pitch: 0,
      yaw: 0
    },
    acceleration: {
      x: 0,
      y: 0,
      z: 9.8
    },
    angular_velocity: {
      x: 0,
      y: 0,
      z: 0
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Chuyển đổi dữ liệu encoder từ database sang định dạng frontend
 */
export function convertEncoderValues(data: any): EncoderData {
  // Nếu dữ liệu đã có trường data
  if (Array.isArray(data.data)) {
    return data;
  }
  
  // Chuyển đổi từ format database mới (data_value1, data_value2, data_value3)
  return {
    id: data.id,
    robot_id: data.robot_id,
    data: [
      data.data_value1 !== undefined ? data.data_value1 : 0,
      data.data_value2 !== undefined ? data.data_value2 : 0,
      data.data_value3 !== undefined ? data.data_value3 : 0
    ],
    source_file: data.source_file || "",
    created_at: data.created_at || new Date().toISOString()
  };
}