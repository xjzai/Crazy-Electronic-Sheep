import type { MapId, SheepId, SheepPosition } from '../domain/gameStateSchema';

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
  maxSheepCapacity: number;
  spawnPoints: SheepPosition[];
  defaultPurchasableSheepIds: SheepId[];
  placeholderSummary: string;
}

/**
 * 羊静态配置当前先落最小秒产定义。
 * 购买价、点击倍率等字段等对应 issue 再继续补齐。
 */
export interface SheepDefinition {
  id: SheepId;
  displayName: string;
  idleEnergyPerSecond: number;
  purchaseIdleEnergyCost: number;
}

/**
 * 新档赠送规则冻结在配置中，方便后续调整测试值而不改领域逻辑。
 */
export interface NewGameGiftDefinition {
  sheepId: SheepId;
  count: number;
}

/**
 * 当前已覆盖 issue #2 的新档开局与 issue #3 的第一图自动产出所需最小全局配置。
 */
export interface GameConfig {
  storageKey: string;
  catalogSheepIds: SheepId[];
  sheepDefinitions: Record<SheepId, SheepDefinition>;
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
 * `001-025` 的基础秒产来自《长期运营数值周期方案》中的正式建议值。
 * 当前 issue 先消费秒产字段，后续购买价、点击倍率等配置再接进来。
 */
const SHEEP_DEFINITION_ENTRIES: Array<[SheepId, string, number, number]> = [
  ['001', '实习羊', 1, 10],
  ['002', '困困羊', 2, 20],
  ['003', '咖啡羊', 4, 40],
  ['004', '摸鱼羊', 8, 80],
  ['005', '加班羊', 16, 160],
  ['006', 'KPI羊', 34.4, 344],
  ['007', '内卷羊', 73.96, 740],
  ['008', '电子羊', 159.014, 1591],
  ['009', '404羊', 341.8801, 3419],
  ['010', '监控羊', 735.042215, 7350],
  ['011', '病毒羊', 1690.597, 16906],
  ['012', '焦虑羊', 3888.373, 38884],
  ['013', '暴躁羊', 8943.259, 89433],
  ['014', '崩溃羊', 20569.49, 205695],
  ['015', '发疯羊', 47309.84, 473098],
  ['016', '尖叫羊', 118274.6, 1182746],
  ['017', '超频羊', 295686.5, 2956865],
  ['018', '乱码羊', 739216.2, 7392162],
  ['019', '虚无羊', 1848041, 18480410],
  ['020', '觉醒羊', 4620101, 46201010],
  ['021', '打盹羊', 13860300, 138603000],
  ['022', '梦游羊', 27720610, 277206100],
  ['023', '飘魂羊', 55441220, 554412200],
  ['024', '低语羊', 110882400, 1108824000],
  ['025', '分裂羊', 221764900, 2217649000],
];

function createSheepDefinitions(
  sheepEntries: Array<[SheepId, string, number, number]>,
): Record<SheepId, SheepDefinition> {
  return sheepEntries.reduce(
    (definitions, [sheepId, displayName, idleEnergyPerSecond, purchaseIdleEnergyCost]) => {
      definitions[sheepId] = {
        id: sheepId,
        displayName,
        idleEnergyPerSecond,
        purchaseIdleEnergyCost,
      };
      return definitions;
    },
    {} as Record<SheepId, SheepDefinition>,
  );
}

function createSpawnPoints(points: Array<[number, number]>): SheepPosition[] {
  return points.map(([x, y]) => ({ x, y }));
}

const MAP_01_SPAWN_POINTS = createSpawnPoints([
  // 第一图出生点刻意收在围栏内圈，避免 1080x1920 下贴边或直接落到屏幕外。
  [-250, -380],
  [-125, -340],
  [0, -380],
  [125, -340],
  [250, -380],
  [-250, -120],
  [-125, -80],
  [0, -120],
  [125, -80],
  [250, -120],
  [-250, 140],
  [-125, 180],
  [0, 140],
  [125, 180],
  [250, 140],
  [-250, 360],
  [-125, 400],
  [0, 360],
  [125, 400],
  [250, 360],
]);

const MAP_02_SPAWN_POINTS = createSpawnPoints([
  // 第二图沿用同样的内圈策略，避免后续解锁后再次出现越界出生点。
  [-240, -360],
  [-120, -320],
  [0, -360],
  [120, -320],
  [240, -360],
  [-240, -100],
  [-120, -60],
  [0, -100],
  [120, -60],
  [240, -100],
  [-240, 160],
  [-120, 200],
  [0, 160],
  [120, 200],
  [240, 160],
  [-240, 380],
  [-120, 420],
  [0, 380],
  [120, 420],
  [240, 380],
]);

/**
 * 当前 issue 先实现第一图自动产出与核心 HUD，因此配置从极小骨架扩展到“可计算秒产”的最小闭环。
 */
export const GAME_CONFIG: GameConfig = {
  storageKey: 'crazy-electronic-sheep.save',
  catalogSheepIds: CATALOG_SHEEP_IDS,
  sheepDefinitions: createSheepDefinitions(SHEEP_DEFINITION_ENTRIES),
  mapOrder: MAP_ORDER,
  maps: {
    map_01: {
      id: 'map_01',
      displayName: '主场景',
      startSheepId: '001',
      endSheepId: '020',
      unlockedByDefault: true,
      maxSheepCapacity: 20,
      spawnPoints: MAP_01_SPAWN_POINTS,
      defaultPurchasableSheepIds: ['001'],
      placeholderSummary: '当前场景会先进入 map_01，并把新档赠送羊实例放到这里。',
    },
    map_02: {
      id: 'map_02',
      displayName: '第二图骨架',
      startSheepId: '021',
      endSheepId: '025',
      unlockedByDefault: false,
      maxSheepCapacity: 20,
      spawnPoints: MAP_02_SPAWN_POINTS,
      defaultPurchasableSheepIds: [],
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
