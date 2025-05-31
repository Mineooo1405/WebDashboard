/**
 * Quản lý và xử lý lỗi kết nối tập trung
 */
export class ConnectionErrorHandler {
  // Các loại lỗi kết nối phổ biến
  static ERROR_TYPES = {
    TIMEOUT: 'timeout',
    SERVER_UNAVAILABLE: 'server_unavailable',
    AUTH_FAILED: 'auth_failed',
    UNKNOWN: 'unknown'
  };
  
  // Ghi lại lỗi và cung cấp hướng dẫn khắc phục
  static handleError(error: any, context: string = 'unknown'): {
    type: string;
    message: string;
    recovery: string;
  } {
    console.error(`Connection error [${context}]:`, error);
    
    // Phân tích lỗi để đưa ra hướng giải quyết phù hợp
    if (error.message?.includes('timeout') || error.code === 4000) {
      return {
        type: this.ERROR_TYPES.TIMEOUT,
        message: 'Kết nối bị ngắt do timeout',
        recovery: 'Hệ thống đang tự động kết nối lại. Nếu lỗi vẫn tiếp diễn, hãy làm mới trang và thử lại.'
      };
    }
    
    if (error.code === 1006 || error instanceof TypeError) {
      return {
        type: this.ERROR_TYPES.SERVER_UNAVAILABLE,
        message: 'Không thể kết nối đến server',
        recovery: 'Vui lòng kiểm tra xem server có đang chạy không và kết nối mạng của bạn.'
      };
    }
    
    return {
      type: this.ERROR_TYPES.UNKNOWN,
      message: `Lỗi không xác định: ${error.message || 'Không có thông tin'}`,
      recovery: 'Vui lòng thử làm mới trang và kết nối lại.'
    };
  }
  
  // Hiển thị thông báo lỗi cho người dùng
  static displayError(error: any, context: string = 'unknown'): void {
    const errorInfo = this.handleError(error, context);
    
    // Log lỗi
    console.error(`[${errorInfo.type}] ${errorInfo.message}. ${errorInfo.recovery}`);
    
    // Kiểm tra nếu window.showToast tồn tại
    if (typeof window !== 'undefined' && 'showToast' in window) {
      try {
        (window as any).showToast({
          type: 'error',
          title: `Lỗi kết nối: ${errorInfo.type}`,
          message: `${errorInfo.message}. ${errorInfo.recovery}`
        });
      } catch (e) {
        console.error('Error showing toast:', e);
      }
    }
  }
}