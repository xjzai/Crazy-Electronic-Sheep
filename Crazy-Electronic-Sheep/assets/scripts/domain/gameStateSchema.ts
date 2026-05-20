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
 * 地图内位置使用独立坐标结构保存，避免领域层直接依赖 Cocos 的 `Vec3`。
 * 后续 UI、漫游和拖拽都应通过适配层把这里的纯数据坐标转成引擎对象。
 */
export interface SheepPosition {
  x: number;
  y: number;
}

/**
 * 当前本地存档版本号。
 * 未来结构变更时，需要通过这个字段决定是否迁移或重建存档。
 */
export const GAME_SAVE_VERSION = 2 as const;

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
  source: 'new_game_gift' | 'purchase';
  /**
   * 业务层保存的落点位置。
   * 可视漫游会以这个位置作为初始点，但不会把每一帧表现位置写回存档。
   */
  position: SheepPosition;
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
 * 当前购买切片只依赖最小价格字段。
 * 招聘机范围、科技修正和动态涨价由后续 issue 再扩展。
 */
export interface SheepPurchaseDefinition {
  purchaseIdleEnergyCost: number;
}

/**
 * 购买服务只读取地图边界、容量、出生点与当前切片允许购买的列表。
 * 这样可以避免领域服务反向依赖完整配置对象，减少循环引用风险。
 */
export interface PurchaseMapDefinition {
  startSheepId: SheepId;
  endSheepId: SheepId;
  maxSheepCapacity: number;
  spawnPoints: SheepPosition[];
  defaultPurchasableSheepIds: SheepId[];
}

export interface BuySheepConfig {
  maps: Record<MapId, PurchaseMapDefinition>;
  sheepDefinitions: Record<SheepId, SheepPurchaseDefinition>;
}

export interface BuyCurrentMapSheepCommand {
  sheepId: SheepId;
}

export type BuyCurrentMapSheepFailureReason =
  | 'map_locked'
  | 'sheep_not_purchasable'
  | 'insufficient_idle_energy'
  | 'map_capacity_full'
  | 'no_legal_spawn_position';

export type BuyCurrentMapSheepResult =
  | {
      kind: 'success';
      gameState: GameState;
      purchasedInstanceId: string;
      purchasedSheep: SheepInstanceState;
    }
  | {
      kind: 'failure';
      reason: BuyCurrentMapSheepFailureReason;
      gameState: GameState;
    };

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

function isSheepIdWithinMapBounds(
  sheepId: SheepId,
  mapDefinition: PurchaseMapDefinition,
): boolean {
  return sheepId >= mapDefinition.startSheepId && sheepId <= mapDefinition.endSheepId;
}

function createPositionKey(position: SheepPosition): string {
  return `${position.x}:${position.y}`;
}

function findNextAvailableSpawnPoint(
  gameState: GameState,
  mapId: MapId,
  mapDefinition: PurchaseMapDefinition,
): SheepPosition | null {
  const occupiedPositionKeys = new Set(
    getMapSheepInstances(gameState, mapId).map((sheepInstance) =>
      createPositionKey(sheepInstance.position),
    ),
  );

  for (const spawnPoint of mapDefinition.spawnPoints) {
    if (!occupiedPositionKeys.has(createPositionKey(spawnPoint))) {
      return spawnPoint;
    }
  }

  return null;
}

function createPurchasedInstanceId(
  gameState: GameState,
  mapId: MapId,
  sheepId: SheepId,
): string {
  let nextIndex = 1;

  while (true) {
    const candidateId = `purchase-${mapId}-${sheepId}-${String(nextIndex).padStart(2, '0')}`;
    if (!gameState.sheepInstances[candidateId]) {
      return candidateId;
    }

    nextIndex += 1;
  }
}

/**
 * 通过当前地图公共接口购买一只羊。
 * 这个切片只解决第一图默认购买、容量校验、合法出生点和失败无副作用，
 * 不提前接入招聘机公式、第二图购买或拖拽合成。
 */
export function buySheepOnCurrentMap(
  gameState: GameState,
  config: BuySheepConfig,
  command: BuyCurrentMapSheepCommand,
  now: number = Date.now(),
): BuyCurrentMapSheepResult {
  const currentMapId = gameState.currentMapId;
  const currentMapState = gameState.maps[currentMapId];
  const currentMapDefinition = config.maps[currentMapId];

  if (!currentMapState?.isUnlocked || !currentMapDefinition) {
    return {
      kind: 'failure',
      reason: 'map_locked',
      gameState,
    };
  }

  const requestedSheepId = command.sheepId;
  const sheepDefinition = config.sheepDefinitions[requestedSheepId];
  const isPurchasableInCurrentSlice =
    currentMapDefinition.defaultPurchasableSheepIds.includes(requestedSheepId) &&
    isSheepIdWithinMapBounds(requestedSheepId, currentMapDefinition) &&
    Boolean(sheepDefinition);

  if (!isPurchasableInCurrentSlice || !sheepDefinition) {
    return {
      kind: 'failure',
      reason: 'sheep_not_purchasable',
      gameState,
    };
  }

  if (gameState.currencies.idleEnergy < sheepDefinition.purchaseIdleEnergyCost) {
    return {
      kind: 'failure',
      reason: 'insufficient_idle_energy',
      gameState,
    };
  }

  if (currentMapState.sheepInstanceIds.length >= currentMapDefinition.maxSheepCapacity) {
    return {
      kind: 'failure',
      reason: 'map_capacity_full',
      gameState,
    };
  }

  const nextSpawnPoint = findNextAvailableSpawnPoint(
    gameState,
    currentMapId,
    currentMapDefinition,
  );
  if (!nextSpawnPoint) {
    return {
      kind: 'failure',
      reason: 'no_legal_spawn_position',
      gameState,
    };
  }

  const purchasedInstanceId = createPurchasedInstanceId(
    gameState,
    currentMapId,
    requestedSheepId,
  );
  const purchasedSheep: SheepInstanceState = {
    instanceId: purchasedInstanceId,
    sheepId: requestedSheepId,
    mapId: currentMapId,
    bornAt: now,
    source: 'purchase',
    position: nextSpawnPoint,
  };
  const nextUnlockedSheepIds = gameState.unlockedSheepIds.includes(requestedSheepId)
    ? gameState.unlockedSheepIds
    : [...gameState.unlockedSheepIds, requestedSheepId].sort();
  const nextHighestUnlockedSheepId =
    requestedSheepId > gameState.highestUnlockedSheepId
      ? requestedSheepId
      : gameState.highestUnlockedSheepId;
  const shouldUnlockCollectionEntry = !gameState.collection[requestedSheepId]?.isUnlocked;
  const nextCollection = shouldUnlockCollectionEntry
    ? {
        ...gameState.collection,
        [requestedSheepId]: {
          sheepId: requestedSheepId,
          isUnlocked: true,
          unlockedAt: now,
        },
      }
    : gameState.collection;

  return {
    kind: 'success',
    purchasedInstanceId,
    purchasedSheep,
    gameState: {
      ...gameState,
      updatedAt: now,
      highestUnlockedSheepId: nextHighestUnlockedSheepId,
      unlockedSheepIds: nextUnlockedSheepIds,
      currencies: {
        ...gameState.currencies,
        idleEnergy:
          gameState.currencies.idleEnergy - sheepDefinition.purchaseIdleEnergyCost,
      },
      collection: nextCollection,
      maps: {
        ...gameState.maps,
        [currentMapId]: {
          ...currentMapState,
          sheepInstanceIds: [...currentMapState.sheepInstanceIds, purchasedInstanceId],
        },
      },
      sheepInstances: {
        ...gameState.sheepInstances,
        [purchasedInstanceId]: purchasedSheep,
      },
    },
  };
}
