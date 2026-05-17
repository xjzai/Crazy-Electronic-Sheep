import type { GameState } from '../domain/gameStateSchema';

/**
 * 运行时状态缓存只负责“当前这一轮已经启动好的游戏状态”。
 * 它不是持久化真值，只是主场景内跨模块共享的启动结果。
 */
let runtimeGameState: GameState | null = null;

/**
 * 写入当前运行态存档快照。
 */
export function setRuntimeGameState(gameState: GameState): void {
  runtimeGameState = gameState;
}

/**
 * 读取当前运行态存档快照。
 */
export function getRuntimeGameState(): GameState | null {
  return runtimeGameState;
}

/**
 * 清空运行态缓存，供后续热重启或调试入口复用。
 */
export function clearRuntimeGameState(): void {
  runtimeGameState = null;
}
