import { GAME_CONFIG, type GameConfig } from '../config/gameConfig';
import {
  GAME_SAVE_VERSION,
  type CollectionEntryState,
  type GameState,
  type MapId,
  type MapState,
  type SheepId,
  type SheepInstanceState,
} from './gameStateSchema';

/**
 * 为每个图鉴编号生成初始图鉴状态。
 * 只有新档赠送羊在开局时就处于已解锁状态。
 */
function createInitialCollection(
  config: GameConfig,
  unlockedSheepIds: Set<SheepId>,
  now: number,
): Record<SheepId, CollectionEntryState> {
  const collection = {} as Record<SheepId, CollectionEntryState>;

  for (const sheepId of config.catalogSheepIds) {
    const isUnlocked = unlockedSheepIds.has(sheepId);
    collection[sheepId] = {
      sheepId,
      isUnlocked,
      unlockedAt: isUnlocked ? now : null,
    };
  }

  return collection;
}

/**
 * 构造双地图最小状态骨架。
 * 当前只保留解锁状态和地图内实例 ID 列表，后续玩法继续在此扩展。
 */
function createInitialMaps(config: GameConfig): Record<MapId, MapState> {
  const maps = {} as Record<MapId, MapState>;

  for (const mapId of config.mapOrder) {
    maps[mapId] = {
      mapId,
      isUnlocked: config.maps[mapId].unlockedByDefault,
      sheepInstanceIds: [],
    };
  }

  return maps;
}

/**
 * 新档赠送羊实例的 ID 使用稳定格式，方便调试和测试直接定位。
 */
function createGiftInstanceId(mapId: MapId, sheepId: SheepId, index: number): string {
  return `gift-${mapId}-${sheepId}-${String(index).padStart(2, '0')}`;
}

/**
 * 新档赠送羊也必须占用正式出生点，
 * 否则后续购买逻辑无法基于统一的“已占用出生位”规则判断剩余空间。
 */
function getGiftSpawnPoint(config: GameConfig, mapId: MapId, index: number) {
  const spawnPoint = config.maps[mapId].spawnPoints[index - 1];
  if (!spawnPoint) {
    throw new Error(`Missing spawn point ${index} for ${mapId}`);
  }

  return spawnPoint;
}

/**
 * 按冻结规则创建新档。
 * 这是 issue #2 的核心领域入口，所有“开局赠送与同步解锁状态”都从这里产出。
 */
export function createNewGameState(
  config: GameConfig = GAME_CONFIG,
  now: number = Date.now(),
): GameState {
  const highestUnlockedSheepId = config.newGameGift.sheepId;
  const unlockedSheepIds: SheepId[] = [highestUnlockedSheepId];
  const unlockedSheepIdSet = new Set(unlockedSheepIds);
  const maps = createInitialMaps(config);
  const sheepInstances = {} as Record<string, SheepInstanceState>;

  for (let index = 1; index <= config.newGameGift.count; index += 1) {
    const instanceId = createGiftInstanceId(
      config.initialCurrentMapId,
      config.newGameGift.sheepId,
      index,
    );

    sheepInstances[instanceId] = {
      instanceId,
      sheepId: config.newGameGift.sheepId,
      mapId: config.initialCurrentMapId,
      bornAt: now,
      source: 'new_game_gift',
      position: getGiftSpawnPoint(config, config.initialCurrentMapId, index),
    };
    maps[config.initialCurrentMapId].sheepInstanceIds.push(instanceId);
  }

  return {
    saveVersion: GAME_SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    currentMapId: config.initialCurrentMapId,
    highestUnlockedMapId: config.initialHighestUnlockedMapId,
    highestUnlockedSheepId,
    unlockedSheepIds,
    currencies: {
      idleEnergy: config.initialIdleEnergy,
    },
    collection: createInitialCollection(config, unlockedSheepIdSet, now),
    maps,
    sheepInstances,
  };
}
