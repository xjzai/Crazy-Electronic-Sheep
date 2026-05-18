/**
 * 当前 MVP 只冻结两张地图。
 * 后续如果扩展更多地图，必须先同步更新 architecture 与存档结构文档。
 */
export type MapId = 'map_01' | 'map_02';

/**
 * 羊的稳定编号采用三位字符串，例如 `001`。
 * 这里保持为字符串，避免后续图鉴、配置和显示层反复做补零转换。
 */
export type SheepId = string;

/**
 * 当前本地存档版本号。
 * 未来结构变更时，需要通过这个字段决定是否迁移或重建存档。
 */
export const GAME_SAVE_VERSION = 1 as const;

/**
 * 图鉴项是“是否见过这只羊”的持久化真值。
 */
export interface CollectionEntryState {
  sheepId: SheepId;
  isUnlocked: boolean;
  unlockedAt: number | null;
}

/**
 * 羊实例是地图内真实存在的业务对象。
 * 当前阶段只记录最小信息，后续漫游、点击、拖拽和合成再扩展运行态字段。
 */
export interface SheepInstanceState {
  instanceId: string;
  sheepId: SheepId;
  mapId: MapId;
  bornAt: number;
  source: 'new_game_gift';
}

/**
 * 每张地图维护自己的解锁状态与实例列表。
 * UI 只能读取这里，不允许自己持有地图内羊数量的业务真值。
 */
export interface MapState {
  mapId: MapId;
  isUnlocked: boolean;
  sheepInstanceIds: string[];
}

/**
 * 全局存档真值。
 * 这次 issue 只实现“能进入主场景并正确开局”的最小闭环。
 */
export interface GameState {
  saveVersion: typeof GAME_SAVE_VERSION;
  createdAt: number;
  updatedAt: number;
  currentMapId: MapId;
  highestUnlockedMapId: MapId;
  highestUnlockedSheepId: SheepId;
  unlockedSheepIds: SheepId[];
  currencies: {
    idleEnergy: number;
  };
  collection: Record<SheepId, CollectionEntryState>;
  maps: Record<MapId, MapState>;
  sheepInstances: Record<string, SheepInstanceState>;
}

/**
 * 核心 HUD 当前只关心资源、全局总秒产和最高解锁羊。
 * 先把它收敛成纯快照，避免 UI 层自己拼业务真值。
 */
export interface CoreHudSnapshot {
  idleEnergy: number;
  globalIdleEnergyPerSecond: number;
  highestUnlockedSheepId: SheepId;
}

/**
 * 秒产查询只依赖最小字段，避免把完整配置类型硬耦合到领域层。
 */
export interface SheepIdleProductionDefinition {
  idleEnergyPerSecond: number;
}

/**
 * 按地图顺序返回当前地图里的羊实例。
 * 地图展示层通过这个函数拿到稳定顺序，避免自己重复拼装数据。
 */
export function getMapSheepInstances(
  gameState: GameState,
  mapId: MapId,
): SheepInstanceState[] {
  return gameState.maps[mapId].sheepInstanceIds
    .map((instanceId) => gameState.sheepInstances[instanceId])
    .filter((instance): instance is SheepInstanceState => Boolean(instance));
}

/**
 * 统计当前图鉴已解锁数量，供 HUD 和调试展示复用。
 */
export function countUnlockedCollectionEntries(gameState: GameState): number {
  return Object.values(gameState.collection).filter((entry) => entry.isUnlocked).length;
}

/**
 * 汇总当前所有羊实例的基础秒产。
 * 后续科技或临时 Buff 进入时，再在更高层服务叠加修正值。
 */
export function getGlobalIdleEnergyPerSecond(
  gameState: GameState,
  sheepDefinitions: Record<SheepId, SheepIdleProductionDefinition>,
): number {
  return Object.values(gameState.sheepInstances).reduce((total, sheepInstance) => {
    const sheepDefinition = sheepDefinitions[sheepInstance.sheepId];
    if (!sheepDefinition) {
      throw new Error(`Missing sheep definition for ${sheepInstance.sheepId}`);
    }

    return total + sheepDefinition.idleEnergyPerSecond;
  }, 0);
}

/**
 * 为主场景生成“只读 HUD 视图模型”。
 * 场景刷新时只消费这个纯快照，不直接散读深层状态字段。
 */
export function createCoreHudSnapshot(
  gameState: GameState,
  sheepDefinitions: Record<SheepId, SheepIdleProductionDefinition>,
): CoreHudSnapshot {
  return {
    idleEnergy: gameState.currencies.idleEnergy,
    globalIdleEnergyPerSecond: getGlobalIdleEnergyPerSecond(gameState, sheepDefinitions),
    highestUnlockedSheepId: gameState.highestUnlockedSheepId,
  };
}

/**
 * 按“整秒批量结算”的方式推进自动产出。
 * 当前只更新摸鱼能量与 `updatedAt`，其余系统等对应 issue 再继续接入。
 */
export function settleIdleProduction(
  gameState: GameState,
  sheepDefinitions: Record<SheepId, SheepIdleProductionDefinition>,
  elapsedSeconds: number,
  settledAt: number,
): GameState {
  const settledWholeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  if (settledWholeSeconds === 0) {
    return gameState;
  }

  const globalIdleEnergyPerSecond = getGlobalIdleEnergyPerSecond(gameState, sheepDefinitions);
  const producedIdleEnergy = globalIdleEnergyPerSecond * settledWholeSeconds;

  return {
    ...gameState,
    updatedAt: settledAt,
    currencies: {
      ...gameState.currencies,
      idleEnergy: gameState.currencies.idleEnergy + producedIdleEnergy,
    },
  };
}
