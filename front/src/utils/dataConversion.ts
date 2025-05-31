// Hàm chuyển đổi định dạng dữ liệu

// Hàm xử lý encoder data
export function processEncoderData(data: any) {
  // Kiểm tra định dạng dữ liệu
  if (Array.isArray(data.data)) {
    // Định dạng cũ đã có trường data là mảng
    return {
      values: data.data,
      rpm: data.rpm || data.data.map((v: number) => v / 10) // Mô phỏng RPM nếu không có
    };
  } else if (data.data_value1 !== undefined) {
    // Định dạng mới từ EncoderData
    const values = [
      data.data_value1 || 0,
      data.data_value2 || 0,
      data.data_value3 || 0
    ];
    return {
      values: values,
      rpm: values.map(v => v / 10) // Mô phỏng RPM
    };
  } else {
    // Định dạng khác hoặc không có dữ liệu
    return {
      values: [0, 0, 0],
      rpm: [0, 0, 0]
    };
  }
}

// Hàm xử lý IMU data
export function processIMUData(data: any) {
  // Format mới từ BNO055Data
  if (data.euler_roll !== undefined || data.euler_pitch !== undefined || data.euler_yaw !== undefined) {
    return {
      orientation: {
        roll: data.euler_roll || 0,
        pitch: data.euler_pitch || 0,
        yaw: data.euler_yaw || 0
      },
      quaternion: [
        data.quaternion_w || 0,
        data.quaternion_x || 0,
        data.quaternion_y || 0,
        data.quaternion_z || 0
      ],
      timestamp: data.created_at || new Date().toISOString()
    };
  }
  // Format cũ hoặc đã chuyển đổi
  else if (data.data && (data.data.euler || data.data.quaternion)) {
    const euler = data.data.euler || [0, 0, 0];
    const quaternion = data.data.quaternion || [0, 0, 0, 0];
    
    return {
      orientation: {
        roll: euler[0] || 0,
        pitch: euler[1] || 0,
        yaw: euler[2] || 0
      },
      quaternion: quaternion,
      timestamp: data.timestamp || new Date().toISOString()
    };
  } 
  // Format khác
  else {
    return {
      orientation: { roll: 0, pitch: 0, yaw: 0 },
      quaternion: [0, 0, 0, 0],
      timestamp: new Date().toISOString()
    };
  }
}

// Hàm xử lý Trajectory data
export function processTrajectoryData(data: any) {
  // Format mới từ TrajectoryData
  if (data.current_x !== undefined || data.current_y !== undefined || data.current_theta !== undefined) {
    return {
      current_position: {
        x: data.current_x || 0,
        y: data.current_y || 0,
        theta: data.current_theta || 0
      },
      points: data.points || { x: [], y: [], theta: [] },
      timestamp: data.timestamp || new Date().toISOString()
    };
  }
  // Format cũ hoặc đã chuyển đổi
  else if (data.current_position) {
    return {
      current_position: data.current_position,
      points: data.points || { x: [], y: [], theta: [] },
      timestamp: data.timestamp || new Date().toISOString()
    };
  }
  // Format khác
  else {
    return {
      current_position: { x: 0, y: 0, theta: 0 },
      points: { x: [], y: [], theta: [] },
      timestamp: new Date().toISOString()
    };
  }
}