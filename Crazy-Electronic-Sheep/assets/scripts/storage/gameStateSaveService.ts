import { GAME_CONFIG } from '../config/gameConfig';
import type { GameState } from '../domain/gameStateSchema';
import {
  clearSerializedSave,
  readSerializedSave,
  writeSerializedSave,
} from './localSaveRepository';

/**
 * 读取当前主游戏存档的原始文本。
 * 这里集中持有 storage key，避免场景控制器和业务协调代码到处拼接持久化细节。
 */
export function readMainGameSerializedSave(): string | null {
  return readSerializedSave(GAME_CONFIG.storageKey);
}

/**
 * 将当前主游戏状态写回本地存档。
 * 返回值只表达写入是否成功，调用方负责决定是否提示、重试或继续运行。
 */
export function writeMainGameStateSave(gameState: GameState): boolean {
  return writeSerializedSave(GAME_CONFIG.storageKey, gameState);
}

/**
 * 清除当前主游戏存档。
 * 测试清档入口和后续重开流程都应走这里，避免 UI 层直接接触底层存储 key。
 */
export function clearMainGameStateSave(): boolean {
  return clearSerializedSave(GAME_CONFIG.storageKey);
}
