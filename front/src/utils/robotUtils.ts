/**
 * Validate and normalize robotId
 */
export function validateRobotId(robotId: string): string {
  const validIds = ['robot1', 'robot2', 'robot3', 'robot4'];
  if (!validIds.includes(robotId)) {
    console.warn(`Invalid robotId: ${robotId}. Falling back to robot1.`);
    return 'robot1';
  }
  return robotId;
}