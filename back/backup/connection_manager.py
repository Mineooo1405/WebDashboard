import time
from typing import Dict, List, Any, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("connection_manager")

class ConnectionManager:
    # Singleton instance
    _instance = None
    
    # Các dictionaries hiện tại
    _tcp_clients = {}  # Map robot_id -> (reader, writer)
    _websockets = {}   # Map robot_id -> list of websockets
    
    # Thêm mới để quản lý theo IP
    _ip_to_robot = {}  # Map IP:port -> robot_id
    _robot_to_ip = {}  # Map robot_id -> IP:port
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConnectionManager, cls).__new__(cls)
        return cls._instance
    
    @classmethod
    def normalize_robot_id(cls, robot_id: str) -> str:
        """Normalize robot ID across all components"""
        if "/" in robot_id:
            parts = robot_id.split("/", 1)
            return f"{parts[0]}_{parts[1]}"
        return robot_id
    
    @classmethod
    def add_websocket(cls, robot_id: str, websocket) -> None:
        """Add WebSocket connection for a robot"""
        robot_id = cls.normalize_robot_id(robot_id)
        
        # Initialize dict entry if needed
        if robot_id not in cls._websockets:
            cls._websockets[robot_id] = []
            
        if websocket not in cls._websockets[robot_id]:
            cls._websockets[robot_id].append(websocket)
            logger.info(f"Added WebSocket for {robot_id}, total: {len(cls._websockets[robot_id])}")
    
    @classmethod
    def remove_websocket(cls, robot_id: str, websocket) -> None:
        """Remove WebSocket connection for a robot"""
        robot_id = cls.normalize_robot_id(robot_id)
        
        if robot_id in cls._websockets and websocket in cls._websockets[robot_id]:
            cls._websockets[robot_id].remove(websocket)
            logger.info(f"Removed WebSocket for {robot_id}, remaining: {len(cls._websockets[robot_id])}")
    
    @classmethod
    def set_tcp_client(cls, robot_id, tcp_client, client_ip=None):
        """Register a TCP client with optional IP mapping"""
        cls._tcp_clients[robot_id] = tcp_client
        
        # Lưu mapping giữa IP và robot_id nếu được cung cấp
        if client_ip:
            cls._ip_to_robot[client_ip] = robot_id
            cls._robot_to_ip[robot_id] = client_ip
            
    @classmethod
    def remove_tcp_client(cls, robot_id: str) -> None:
        """Remove TCP client for a robot"""
        robot_id = cls.normalize_robot_id(robot_id)
        
        if robot_id in cls._tcp_clients:
            del cls._tcp_clients[robot_id]
            logger.info(f"Removed TCP client for {robot_id}")
        
        if robot_id in cls._robot_to_ip:
            client_ip = cls._robot_to_ip.pop(robot_id)
            cls._ip_to_robot.pop(client_ip, None)
    
    @classmethod
    def get_websockets(cls, robot_id: str) -> list:
        """Get all WebSocket connections for a robot"""
        robot_id = cls.normalize_robot_id(robot_id)
        
        if robot_id in cls._websockets:
            return cls._websockets[robot_id]
        return []
    
    @classmethod
    def get_tcp_client(cls, robot_id: str):
        """Get TCP client for a robot"""
        robot_id = cls.normalize_robot_id(robot_id)
        
        if robot_id in cls._tcp_clients:
            return cls._tcp_clients[robot_id]
        return None
    
    @classmethod
    def get_tcp_client_by_ip(cls, ip_address):
        """Get TCP client by IP address"""
        # Tìm robot_id tương ứng với IP
        robot_id = cls._ip_to_robot.get(ip_address)
        if robot_id:
            # Trả về tcp_client tương ứng nếu tìm thấy
            return cls._tcp_clients.get(robot_id)
        return None
        
    @classmethod
    def get_robot_id_by_ip(cls, ip_address):
        """Get robot_id associated with an IP address"""
        return cls._ip_to_robot.get(ip_address)
        
    @classmethod
    def get_ip_by_robot_id(cls, robot_id):
        """Get IP address associated with a robot_id"""
        return cls._robot_to_ip.get(robot_id)
        
    @classmethod
    def get_all_robots_with_ip(cls):
        """Get list of all robots with their IP addresses"""
        robots = []
        for robot_id, ip in cls._robot_to_ip.items():
            robots.append({
                "robot_id": robot_id,
                "ip": ip,
                "connected": robot_id in cls._tcp_clients
            })
        return robots
    
    @classmethod
    def get_connection_stats(cls) -> Dict[str, Dict[str, Any]]:
        """Get connection statistics for all robots"""
        stats = {}
        for robot_id, conn in cls._websockets.items():
            stats[robot_id] = {
                "websocket_count": len(conn),
                "has_tcp": robot_id in cls._tcp_clients
            }
        return stats