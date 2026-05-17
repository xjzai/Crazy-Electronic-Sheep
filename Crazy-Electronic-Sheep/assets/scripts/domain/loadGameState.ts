import { GAME_CONFIG, type GameConfig } from '../config/gameConfig';
import { createNewGameState } from './createNewGameState';
import { GAME_SAVE_VERSION, type GameState, type MapId, type SheepInstanceState } from './gameStateSchema';

export type LoadGameStateSource =
  | 'existing-save'
  | 'new-save-missing'
  | 'new-save-recreated';

/**
 * 启动阶段需要知道这次状态来自旧档还是新档重建，
 * 这样主场景可以准确展示当前开局来源。
 */
export interface LoadGameStateResult {
  state: GameState;
  source: LoadGameStateSource;
  shouldPersist: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMapId(value: unknown): value is MapId {
  return value === 'map_01' || value === 'map_02';
}

/**
 * 只做当前 issue 所需的最小坏档校验。
 * 一旦关键结构损坏，就直接重建新档，避免主场景拿到半坏状态继续运行。
 */
export function isGameState(value: unknown, config: GameConfig = GAME_CONFIG): value is GameState {
  if (!isPlainRecord(value)) {
    return false;
  }

  if (value.saveVersion !== GAME_SAVE_VERSION) {
    return false;
  }

  if (!isMapId(value.currentMapId) || !isMapId(value.highestUnlockedMapId)) {
    return false;
  }

  if (typeof value.createdAt !== 'number' || typeof value.updatedAt !== 'number') {
    return false;
  }

  const catalogSet = new Set(config.catalogSheepIds);

  if (typeof value.highestUnlockedSheepId !== 'string' || !catalogSet.has(value.highestUnlockedSheepId)) {
    return false;
  }

  if (!Array.isArray(value.unlockedSheepIds) || value.unlockedSheepIds.length === 0) {
    return false;
  }

  for (const sheepId of value.unlockedSheepIds) {
    if (typeof sheepId !== 'string' || !catalogSet.has(sheepId)) {
      return false;
    }
  }

  if (!value.unlockedSheepIds.includes(value.highestUnlockedSheepId)) {
    return false;
  }

  if (!isPlainRecord(value.currencies) || typeof value.currencies.idleEnergy !== 'number') {
    return false;
  }

  if (!isPlainRecord(value.collection)) {
    return false;
  }

  const collection = value.collection as Record<string, Record<string, unknown>>;

  for (const sheepId of config.catalogSheepIds) {
    const entry = collection[sheepId];
    if (!isPlainRecord(entry)) {
      return false;
    }

    if (entry.sheepId !== sheepId || typeof entry.isUnlocked !== 'boolean') {
      return false;
    }

    if (!(entry.unlockedAt === null || typeof entry.unlockedAt === 'number')) {
      return false;
    }
  }

  if (!collection[value.highestUnlockedSheepId].isUnlocked) {
    return false;
  }

  if (!isPlainRecord(value.sheepInstances)) {
    return false;
  }

  const sheepInstances = value.sheepInstances as Record<string, SheepInstanceState>;

  for (const [instanceId, rawInstance] of Object.entries(sheepInstances)) {
    if (!isPlainRecord(rawInstance)) {
      return false;
    }

    if (typeof rawInstance.instanceId !== 'string' || rawInstance.instanceId !== instanceId) {
      return false;
    }

    if (typeof rawInstance.sheepId !== 'string' || !catalogSet.has(rawInstance.sheepId)) {
      return false;
    }

    if (!isMapId(rawInstance.mapId) || typeof rawInstance.bornAt !== 'number') {
      return false;
    }

    if (rawInstance.source !== 'new_game_gift') {
      return false;
    }
  }

  if (!isPlainRecord(value.maps)) {
    return false;
  }

  const maps = value.maps as Record<string, Record<string, unknown>>;

  for (const mapId of config.mapOrder) {
    const rawMap = maps[mapId];
    if (!isPlainRecord(rawMap)) {
      return false;
    }

    if (rawMap.mapId !== mapId || typeof rawMap.isUnlocked !== 'boolean') {
      return false;
    }

    if (!Array.isArray(rawMap.sheepInstanceIds)) {
      return false;
    }

    for (const instanceId of rawMap.sheepInstanceIds) {
      if (typeof instanceId !== 'string' || !isPlainRecord(sheepInstances[instanceId])) {
        return false;
      }

      if (sheepInstances[instanceId].mapId !== mapId) {
        return false;
      }
    }
  }

  return maps.map_01.isUnlocked === true;
}

/**
 * 从本地读档文本恢复业务状态。
 * 若为空档或坏档，则按冻结规则重建新档。
 */
export function loadGameStateFromSerializedSave(
  serializedSave: string | null,
  config: GameConfig = GAME_CONFIG,
  now: number = Date.now(),
): LoadGameStateResult {
  if (!serializedSave) {
    return {
      state: createNewGameState(config, now),
      source: 'new-save-missing',
      shouldPersist: true,
    };
  }

  try {
    const parsed = JSON.parse(serializedSave) as unknown;
    if (isGameState(parsed, config)) {
      return {
        state: parsed,
        source: 'existing-save',
        shouldPersist: false,
      };
    }
  } catch {
    // 坏档直接落到统一重建分支。
  }

  return {
    state: createNewGameState(config, now),
    source: 'new-save-recreated',
    shouldPersist: true,
  };
}
