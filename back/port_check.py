import socket

print("Starting port check...")

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    try:
        s.bind(('0.0.0.0', 3001))
        print("Port 3001 (React) is FREE")
    except socket.error:
        print("Port 3001 (React) is IN USE")

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    try:
        s.bind(('0.0.0.0', 9003))
        print("Port 9003 (WebSocket) is FREE")
    except socket.error:
        print("Port 9003 (WebSocket) is IN USE")

print("Port check complete.")
