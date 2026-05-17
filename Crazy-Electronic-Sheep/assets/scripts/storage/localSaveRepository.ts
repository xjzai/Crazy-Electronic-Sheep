import { sys } from 'cc';
import type { GameState } from '../domain/gameStateSchema';

/**
 * 读取本地存档原始文本。
 * 这里故意只返回字符串，不在存储层做业务解析，保持职责单一。
 */
export function readSerializedSave(storageKey: string): string | null {
  try {
    return sys.localStorage.getItem(storageKey);
  } catch (error) {
    console.warn('[LocalSaveRepository] read failed', error);
    return null;
  }
}

/**
 * 将当前业务真值完整写回本地存档。
 */
export function writeSerializedSave(storageKey: string, gameState: GameState): boolean {
  try {
    sys.localStorage.setItem(storageKey, JSON.stringify(gameState));
    return true;
  } catch (error) {
    console.warn('[LocalSaveRepository] write failed', error);
    return false;
  }
}
