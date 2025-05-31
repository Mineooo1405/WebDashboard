import socket
import json
import time
import random
import threading
import select
import sys
import math

def send_message(sock, data):
    message = json.dumps(data) + "\n"  # Ensure newline character
    sock.sendall(message.encode())
    print(f"Sent: {data}")

def receive_messages(sock, robot_id, stop_event):
    """Thread function to receive and handle incoming messages"""
    sock.settimeout(1.0)  # Set timeout for recv calls
    
    while not stop_event.is_set():
        try:
            # Use select to check if there's data available (with timeout)
            readable, _, _ = select.select([sock], [], [], 1.0)
            
            if sock in readable:
                # Data is available, read it
                data = sock.recv(4096)
                
                if not data:  # Connection closed
                    print(f"{robot_id}: Connection closed by server")
                    stop_event.set()
                    break
                
                # Try to find complete JSON messages (could be multiple or partial)
                buffer = data.decode('utf-8')
                lines = buffer.split('\n')
                
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    
                    try:
                        message = json.loads(line)
                        print(f"\n{robot_id} RECEIVED: {json.dumps(message, indent=2)}")
                        
                        # Handle specific messages
                        if message.get('type') == 'pid_config':
                            print(f"\n==== PID CONFIG RECEIVED ====")
                            print(f"Motor ID: {message.get('motor_id')}")
                            print(f"Kp: {message.get('kp')}")
                            print(f"Ki: {message.get('ki')}")
                            print(f"Kd: {message.get('kd')}")
                            print("============================\n")
                            
                            # Send an acknowledgment response
                            response = {
                                "id": robot_id,  # Đổi từ robot_id thành id
                                "type": "pid_config_response",
                                "data": {
                                    "status": "success",
                                    "motor_id": message.get("motor_id"),
                                    "time": time.time()
                                }
                            }
                            print(f"Sending PID response: {response}")
                            send_message(sock, response)
                            
                            # Gửi thêm một pid_response như DirectBridge mong đợi
                            response2 = {
                                "id": robot_id,  # Đổi từ robot_id thành id
                                "type": "pid_response",
                                "data": {
                                    "status": "success",
                                    "message": f"PID config applied to motor {message.get('motor_id')}",
                                    "time": time.time()
                                }
                            }
                            print(f"Sending additional pid_response: {response2}")
                            send_message(sock, response2)
                            
                        elif message.get('type') == 'check_firmware_version':
                            print(f"\n==== FIRMWARE VERSION CHECK ====")
                            
                            # Send back current firmware version
                            response = {
                                "id": robot_id,  # Đổi từ robot_id thành id
                                "type": "firmware_version",
                                "data": {
                                    "version": "1.0.0",
                                    "build_date": "2025-04-01",
                                    "status": "stable",
                                    "time": time.time()
                                }
                            }
                            send_message(sock, response)
                            
                        elif message.get('type') == 'firmware_update_start':
                            print(f"\n==== FIRMWARE UPDATE STARTED ====")
                            print(f"Filename: {message.get('filename')}")
                            print(f"Size: {message.get('filesize')} bytes")
                            print(f"Version: {message.get('version')}")
                            
                            # Acknowledge start of firmware update
                            response = {
                                "id": robot_id,  # Đổi từ robot_id thành id
                                "type": "firmware_response",
                                "data": {
                                    "status": "start_ok",
                                    "message": "Ready to receive firmware",
                                    "time": time.time()
                                }
                            }
                            send_message(sock, response)
                            
                        elif message.get('type') == 'firmware_chunk':
                            chunk_index = message.get('chunk_index', 0)
                            total_chunks = message.get('total_chunks', 1)
                            progress = int((chunk_index + 1) / total_chunks * 100)
                            
                            print(f"\rReceiving firmware chunk: {chunk_index+1}/{total_chunks} ({progress}%)", end="")
                            
                            # Send progress periodically to avoid flooding
                            if chunk_index % 5 == 0 or chunk_index == total_chunks - 1:
                                response = {
                                    "id": robot_id,  # Đổi từ robot_id thành id
                                    "type": "firmware_progress",
                                    "data": {
                                        "progress": progress,
                                        "chunk": chunk_index,
                                        "total": total_chunks,
                                        "time": time.time()
                                    }
                                }
                                send_message(sock, response)
                                
                        elif message.get('type') == 'firmware_update_complete':
                            print(f"\n\n==== FIRMWARE UPDATE COMPLETED ====")
                            
                            # Send completion notification
                            response = {
                                "id": robot_id,  # Đổi từ robot_id thành id
                                "type": "firmware_response",
                                "data": {
                                    "status": "success",
                                    "message": "Firmware update successful",
                                    "version": "1.0.1",
                                    "time": time.time()
                                }
                            }
                            send_message(sock, response)
                            
                    except json.JSONDecodeError:
                        print(f"{robot_id}: Failed to parse JSON: {line}")
        except socket.timeout:
            # Normal timeout, just continue the loop
            pass
        except Exception as e:
            print(f"{robot_id}: Error receiving data: {str(e)}")
            stop_event.set()
            break

def firmware_server(robot_id, port=12345):
    """Thread function to listen for firmware updates on a specific port"""
    print(f"Starting firmware OTA server for {robot_id} on port {port}")
    try:
        # Tạo socket lắng nghe
        server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_sock.bind(('0.0.0.0', port))
        server_sock.listen(1)
        print(f"{robot_id}: OTA0 server listening on port {port}")
        
        while True:
            try:
                # Chấp nhận kết nối
                client_sock, addr = server_sock.accept()
                print(f"{robot_id}: Firmware update connection from {addr}")
                
                # Nhận và xử lý dữ liệu firmware
                total_bytes = 0
                chunks_received = 0
                
                while True:
                    chunk = client_sock.recv(1024)
                    if not chunk:
                        break
                    
                    # Mô phỏng xử lý chunk
                    chunks_received += 1
                    total_bytes += len(chunk)
                    
                    # In tiến trình
                    print(f"\r{robot_id}: Received {chunks_received} chunks, {total_bytes} bytes", end="")
                    
                    # Đánh dấu là đã nhận được firmware
                    firmware_request_detected = False
                
                print(f"\n{robot_id}: Firmware update complete, received {total_bytes} bytes")
                client_sock.close()
            except Exception as e:
                print(f"{robot_id}: Error in firmware connection: {e}")
                if 'client_sock' in locals():
                    client_sock.close()
                # Tiếp tục lắng nghe kết nối mới
    except Exception as e:
        print(f"{robot_id}: Fatal error in firmware server: {e}")
    finally:
        if 'server_sock' in locals():
            server_sock.close()
        print(f"{robot_id}: OTA0 server stopped")

def robot_client(robot_id, firmware_mode=False):
    try:
        # Kết nối OTA1 cho dữ liệu (encoder, IMU, etc.)
        data_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        data_sock.connect(('localhost', 12346))  # Kết nối tới port chính của DirectBridge
        print(f"{robot_id}: Connected to TCP server on port 9000")

        # Đăng ký cho data socket
        registration = {"type": "registration", "robot_id": robot_id}
        send_message(data_sock, registration)

        # Tạo thread xử lý nhận tin nhắn
        data_stop_event = threading.Event()
        data_thread = threading.Thread(
            target=receive_messages, 
            args=(data_sock, f"{robot_id}_data", data_stop_event),
            daemon=True
        )
        data_thread.start()

        # Nếu firmware_mode = True, kích hoạt ngay firmware socket
        firmware_sock = None
        firmware_stop_event = threading.Event()
        firmware_request_detected = firmware_mode  # Sử dụng trực tiếp tham số

        # Khởi tạo firmware socket ngay nếu firmware_mode = True
        if firmware_mode:
            try:
                print(f"{robot_id}: Starting firmware server for OTA0...")
                # Tạo thread riêng để lắng nghe kết nối firmware
                firmware_server_thread = threading.Thread(
                    target=firmware_server,
                    args=(robot_id, 12345),  # Port 12345 cho OTA0
                    daemon=True
                )
                firmware_server_thread.start()
                
                # Đăng ký dịch vụ firmware với DirectBridge
                firmware_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                firmware_sock.connect(('localhost', 9000))  # Kết nối tới DirectBridge
                print(f"{robot_id}: Connected firmware registration socket to DirectBridge")
                
                # Đăng ký firmware socket
                fw_registration = {"type": "registration", "robot_id": robot_id, "service": "firmware"}
                send_message(firmware_sock, fw_registration)
                
                # Thread xử lý tin nhắn firmware
                firmware_thread = threading.Thread(
                    target=receive_messages, 
                    args=(firmware_sock, f"{robot_id}_firmware", firmware_stop_event),
                    daemon=True
                )
                firmware_thread.start()
                print(f"{robot_id}: Firmware registration complete!")
            except Exception as e:
                print(f"Error setting up firmware service: {e}")
                firmware_sock = None
        
        # Main loop - send data periodically
        try:
            # Keep track of last send times to maintain stable frequency
            last_encoder_send = time.time()
            last_imu_send = time.time()
            last_log_send = time.time()
            # Target frequencies
            encoder_interval = 2 # 50Hz (every 20ms)
            imu_interval = 1     # 20Hz (every 50ms)
            log_interval = 10
            
            while not data_stop_event.is_set():
                current_time = time.time()

                # Send encoder data
                if current_time - last_encoder_send >= encoder_interval:
                    encoder_data = {
                        "type": "encoder", 
                        "id": robot_id, 
                        "timestamp": time.time(), 
                        "data": [random.uniform(10, 50) for _ in range(3)] # Simulate 3 motor RPMs
                    }
                    send_message(data_sock, encoder_data)
                    last_encoder_send = current_time

                # Send IMU data
                if current_time - last_imu_send >= imu_interval:
                    imu_data = {
                        "id": robot_id,  # Đổi từ robot_id thành id
                        "type": "bno055",  # Đổi từ imu thành bno055
                        "data": {
                            "time": current_time,
                            "euler": [
                                random.uniform(-0.5, 0.5),    # roll
                                random.uniform(-0.3, 0.3),    # pitch
                                random.uniform(-3.14, 3.14)   # yaw
                            ],
                            "quaternion": [
                                random.uniform(-3.14, 3.14),  # qw
                                random.uniform(-3.14, 3.14),  # qx
                                random.uniform(-3.14, 3.14),  # qy
                                random.uniform(-3.14, 3.14)   # qz
                            ]
                        }
                    }
                    send_message(data_sock, imu_data)
                    last_imu_send = current_time
                
                # Send log message (less frequently)
                if current_time - last_log_send >= log_interval:
                    log_message = {"type": "log", "id": robot_id, "timestamp": time.time(), "message": f"Simulated log from {robot_id}"}
                    send_message(data_sock, log_message)
                    last_log_send = current_time

                time.sleep(0.01) # Short sleep to prevent busy-waiting
                
        except KeyboardInterrupt:
            print(f"{robot_id}: Closing connection...")
        finally:
            # Signal the receive thread to stop
            data_stop_event.set()
            if firmware_sock:
                firmware_stop_event.set()
                firmware_sock.close()
            data_sock.close()
            data_thread.join(timeout=2.0)
            if firmware_sock:
                firmware_thread.join(timeout=2.0)
            
    except Exception as e:
        print(f"{robot_id}: Error - {str(e)}")

# Start a thread for each robot
if __name__ == "__main__":
    robots = ["robot1"]
    threads = []
    
    # Kiểm tra xem có flag firmware hay không
    firmware_mode = "--firmware" in sys.argv
   
    try:
        for robot_id in robots:
            # Truyền biến firmware_mode vào hàm robot_client
            thread = threading.Thread(target=robot_client, args=(robot_id, firmware_mode))
            thread.daemon = True
            threads.append(thread)
            thread.start()
            print(f"Started thread for {robot_id}" + 
                  (" (FIRMWARE MODE - OTA0 listening on port 12345)" if firmware_mode else ""))
            time.sleep(1)  # Stagger connections
        
        # Keep main thread running
        while True:
            time.sleep(0.1)  # Faster response to KeyboardInterrupt
    except KeyboardInterrupt:
        print("\nShutting down...")