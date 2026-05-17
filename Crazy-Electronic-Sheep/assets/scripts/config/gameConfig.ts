import type { MapId, SheepId } from '../domain/gameStateSchema';

/**
 * 地图静态配置只保留可从配置恢复的信息。
 * 这些字段不进入存档，避免把静态定义错误地当成运行时真值。
 */
export interface MapDefinition {
  id: MapId;
  displayName: string;
  startSheepId: SheepId;
  endSheepId: SheepId;
  unlockedByDefault: boolean;
  placeholderSummary: string;
}

/**
 * 新档赠送规则冻结在配置中，方便后续调整测试值而不改领域逻辑。
 */
export interface NewGameGiftDefinition {
  sheepId: SheepId;
  count: number;
}

/**
 * issue #2 所需的最小全局配置。
 */
export interface GameConfig {
  storageKey: string;
  catalogSheepIds: SheepId[];
  mapOrder: MapId[];
  maps: Record<MapId, MapDefinition>;
  initialCurrentMapId: MapId;
  initialHighestUnlockedMapId: MapId;
  initialIdleEnergy: number;
  newGameGift: NewGameGiftDefinition;
}

/**
 * 生成 `001 -> 025` 这样的稳定图鉴编号。
 */
function createSequentialSheepIds(count: number): SheepId[] {
  return Array.from({ length: count }, (_, index) => String(index + 1).padStart(3, '0'));
}

/**
 * 双地图顺序是当前 UI 和状态初始化的统一基准。
 */
export const MAP_ORDER: MapId[] = ['map_01', 'map_02'];

/**
 * 当前基础图鉴固定展示 `001-025`。
 */
export const CATALOG_SHEEP_IDS: SheepId[] = createSequentialSheepIds(25);

/**
 * 当前 issue 只实现主场景骨架与新档开局，因此配置保持极小。
 */
export const GAME_CONFIG: GameConfig = {
  storageKey: 'crazy-electronic-sheep.save',
  catalogSheepIds: CATALOG_SHEEP_IDS,
  mapOrder: MAP_ORDER,
  maps: {
    map_01: {
      id: 'map_01',
      displayName: '主场景',
      startSheepId: '001',
      endSheepId: '020',
      unlockedByDefault: true,
      placeholderSummary: '当前场景会先进入 map_01，并把新档赠送羊实例放到这里。',
    },
    map_02: {
      id: 'map_02',
      displayName: '第二图骨架',
      startSheepId: '021',
      endSheepId: '025',
      unlockedByDefault: false,
      placeholderSummary: '本 issue 只预留 map_02 的状态与占位骨架，不实现解锁和切图。',
    },
  },
  initialCurrentMapId: 'map_01',
  initialHighestUnlockedMapId: 'map_01',
  initialIdleEnergy: 0,
  newGameGift: {
    sheepId: '001',
    count: 1,
  },
};
