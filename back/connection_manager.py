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
    
    # Tách riêng IP và port
    _addr_to_robot = {}  # Map (ip, port) -> robot_id
    _robot_to_addr = {}  # Map robot_id -> (ip, port)
    
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
    def set_tcp_client(cls, robot_id, tcp_client, client_addr=None):
        """Register a TCP client with optional IP address mapping"""
        cls._tcp_clients[robot_id] = tcp_client
        
        # Lưu ánh xạ giữa địa chỉ và robot_id
        if client_addr:
            ip, port = client_addr  # Nhận tuple (ip, port)
            cls._addr_to_robot[(ip, port)] = robot_id
            cls._robot_to_addr[robot_id] = (ip, port)
            logger.info(f"✅ Ánh xạ IP thành công: {ip}:{port} -> {robot_id}")
            
    @classmethod
    def remove_tcp_client(cls, robot_id):
        """Remove a TCP client and its address mappings"""
        if robot_id in cls._tcp_clients:
            # Xóa mapping địa chỉ trước
            if robot_id in cls._robot_to_addr:
                addr = cls._robot_to_addr[robot_id]
                ip, port = addr
                logger.info(f"🔄 Xóa ánh xạ địa chỉ: {ip}:{port} -> {robot_id}")
                
                if addr in cls._addr_to_robot:
                    del cls._addr_to_robot[addr]
                del cls._robot_to_addr[robot_id]
                
            # Xóa client khỏi map
            del cls._tcp_clients[robot_id]
            logger.info(f"❌ Đã xóa kết nối robot: {robot_id}")
    
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
    def get_tcp_client_by_addr(cls, ip, port=None):
        """Get TCP client by IP address and optional port"""
        if port is not None:
            # Tìm chính xác theo cả IP và port
            robot_id = cls._addr_to_robot.get((ip, port))
        else:
            # Tìm theo chỉ IP (lấy kết quả đầu tiên khớp)
            for (addr_ip, addr_port), rid in cls._addr_to_robot.items():
                if addr_ip == ip:
                    robot_id = rid
                    break
            else:
                robot_id = None
        
        if robot_id:
            return cls._tcp_clients.get(robot_id)
        return None
    
    @classmethod
    def get_robot_id_by_ip(cls, ip, port=None):
        """Get robot_id associated with an IP address"""
        if port is not None:
            return cls._addr_to_robot.get((ip, port))
        
        # Tìm robot_id đầu tiên khớp với IP
        for (addr_ip, addr_port), rid in cls._addr_to_robot.items():
            if addr_ip == ip:
                return rid
        return None
        
    @classmethod
    def get_ip_by_robot_id(cls, robot_id):
        """Get IP address associated with a robot_id"""
        addr = cls._robot_to_addr.get(robot_id)
        if addr:
            return addr[0]  # Trả về IP
        return None
    
    @classmethod
    def get_all_robots_with_ip(cls):
        """Get list of all robots with their IP addresses"""
        robots = []
        for robot_id, addr in cls._robot_to_addr.items():
            ip, port = addr
            robots.append({
                "robot_id": robot_id,
                "ip": ip,
                "port": port,
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

    @classmethod
    def get_addr_by_robot_id(cls, robot_id):
        """
        Get the address (IP, port) for a robot by its ID
        
        Args:
            robot_id: The ID of the robot
            
        Returns:
            tuple: (IP, port) tuple or None if not found
        """
        # Normalize robot ID trước khi tìm kiếm
        robot_id = cls.normalize_robot_id(robot_id)
        
        # Lấy địa chỉ từ _robot_to_addr dict
        addr = cls._robot_to_addr.get(robot_id)
        
        if addr and isinstance(addr, tuple) and len(addr) == 2:
            return addr
        
        return None