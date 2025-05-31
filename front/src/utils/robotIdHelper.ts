/**
 * Helper để chuyển đổi robotId giữa định dạng của UI và database
 */
export const robotIdHelper = {
  /**
   * Chuyển đổi từ ID hiển thị (robot1) thành ID database (1)
   */
  toDbId(displayId: string): number {
    if (displayId.startsWith('robot')) {
      const numericPart = displayId.replace('robot', '');
      return parseInt(numericPart, 10);
    }
    // Fallback: nếu không có định dạng robot{n}, trả về số nếu có thể
    return parseInt(displayId, 10) || 1;
  },

  /**
   * Chuyển đổi từ ID database (1) thành ID hiển thị (robot1)
   */
  toDisplayId(dbId: number | string): string {
    const id = typeof dbId === 'string' ? parseInt(dbId, 10) : dbId;
    return `robot${id}`;
  },

  /**
   * Đảm bảo robotId đúng định dạng khi gửi cho database
   */
  formatForDb(robotId: string | number): number {
    if (typeof robotId === 'string') {
      return this.toDbId(robotId);
    }
    return robotId;
  }
};