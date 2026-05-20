import type { MapId, SheepId, SheepInstanceState, SheepPosition } from './gameStateSchema';

/**
 * 可视漫游的朝向只关心左右翻转。
 * 表现层用它决定单张羊贴图是否水平镜像。
 */
export type SheepFacingDirection = 'left' | 'right';

/**
 * 可视漫游的最小状态机阶段。
 * `idle` 表示原地停顿，`walking` 表示正沿直线移动到目标点。
 */
export type SheepRoamingPhase = 'idle' | 'walking';

/**
 * 地图漫游边界使用连续坐标区间。
 * 这里刻意不引入格子或格点，确保第一图表现仍是自由漫游地图。
 */
export interface RoamingMapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * 漫游配置只描述表现节奏和安全边界。
 * 这些值来自静态配置，不写入存档，避免临时表现态污染长期进度真值。
 */
export interface RoamingConfig {
  mapBounds: Record<MapId, RoamingMapBounds>;
  minIdleSeconds: number;
  maxIdleSeconds: number;
  minMoveDistance: number;
  maxMoveDistance: number;
  speedUnitsPerSecond: number;
  arrivalDistance: number;
}

/**
 * 单只羊在表现层的漫游运行态。
 * 该状态只存在于当前场景视图内，不属于本地存档真值。
 */
export interface SheepRoamingState {
  phase: SheepRoamingPhase;
  position: SheepPosition;
  targetPosition: SheepPosition | null;
  facing: SheepFacingDirection;
  remainingSeconds: number;
  speedUnitsPerSecond: number;
}

/**
 * 羊贴图颜色以轻量 RGB 数据表达，避免领域层直接依赖 Cocos 的 `Color` 类型。
 */
export interface SheepVisualTint {
  r: number;
  g: number;
  b: number;
}

/**
 * 等级视觉样式是稳定规则的产物。
 * 视图层用体型和色调区分不同等级，而不要求每个等级都有独立贴图。
 */
export interface SheepVisualStyle {
  displayScale: number;
  tint: SheepVisualTint;
  tierIndex: number;
}

type RandomSource = () => number;

const SHEEP_VISUAL_TINTS: SheepVisualTint[] = [
  { r: 255, g: 255, b: 255 },
  { r: 190, g: 231, b: 255 },
  { r: 222, g: 205, b: 255 },
  { r: 255, g: 224, b: 166 },
  { r: 255, g: 180, b: 180 },
];

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createPositionCopy(position: SheepPosition): SheepPosition {
  return {
    x: position.x,
    y: position.y,
  };
}

/**
 * 把任意表现坐标夹回当前地图允许的连续漫游边界。
 * 这不仅约束新目标，也用于兼容旧存档中仍保留旧出生点坐标的羊实例。
 */
function clampPositionToRoamingBounds(
  position: SheepPosition,
  mapBounds: RoamingMapBounds,
): SheepPosition {
  return {
    x: clampNumber(position.x, mapBounds.minX, mapBounds.maxX),
    y: clampNumber(position.y, mapBounds.minY, mapBounds.maxY),
  };
}

/**
 * 在当前地图完整可移动边界内创建本轮进入场景时的随机起点。
 * 业务出生点仍负责购买和容量分配，表现层初始点则覆盖整片可漫游区域。
 */
function createRandomInitialPositionInRoamingBounds(
  mapBounds: RoamingMapBounds,
  random: RandomSource,
): SheepPosition {
  return {
    x: Math.round(getRandomBetween(mapBounds.minX, mapBounds.maxX, random)),
    y: Math.round(getRandomBetween(mapBounds.minY, mapBounds.maxY, random)),
  };
}

function getRandomBetween(min: number, max: number, random: RandomSource): number {
  if (max <= min) {
    return min;
  }

  return min + random() * (max - min);
}

function parseSheepLevel(sheepId: SheepId): number {
  const parsedLevel = Number.parseInt(sheepId, 10);
  if (!Number.isFinite(parsedLevel) || parsedLevel <= 0) {
    return 1;
  }

  return parsedLevel;
}

function getFacingFromMovement(
  deltaX: number,
  previousFacing: SheepFacingDirection,
): SheepFacingDirection {
  if (deltaX < 0) {
    return 'left';
  }

  if (deltaX > 0) {
    return 'right';
  }

  return previousFacing;
}

function createIdleDuration(config: RoamingConfig, random: RandomSource): number {
  return getRandomBetween(config.minIdleSeconds, config.maxIdleSeconds, random);
}

function createNextRoamingTarget(
  currentPosition: SheepPosition,
  mapBounds: RoamingMapBounds,
  config: RoamingConfig,
  random: RandomSource,
): SheepPosition {
  const boundedCurrentPosition = clampPositionToRoamingBounds(currentPosition, mapBounds);
  const rawDeltaX = (random() * 2 - 1) * config.maxMoveDistance;
  const rawDeltaY = (random() * 2 - 1) * config.maxMoveDistance;
  const targetPosition = {
    x: clampNumber(boundedCurrentPosition.x + rawDeltaX, mapBounds.minX, mapBounds.maxX),
    y: clampNumber(boundedCurrentPosition.y + rawDeltaY, mapBounds.minY, mapBounds.maxY),
  };
  const distanceFromCurrent = Math.hypot(
    targetPosition.x - boundedCurrentPosition.x,
    targetPosition.y - boundedCurrentPosition.y,
  );

  if (distanceFromCurrent >= config.minMoveDistance) {
    return targetPosition;
  }

  const fallbackDirection = rawDeltaX < 0 ? -1 : 1;
  const fallbackTargetX = clampNumber(
    boundedCurrentPosition.x + fallbackDirection * config.minMoveDistance,
    mapBounds.minX,
    mapBounds.maxX,
  );
  if (fallbackTargetX !== boundedCurrentPosition.x) {
    return {
      x: fallbackTargetX,
      y: targetPosition.y,
    };
  }

  return {
    x: boundedCurrentPosition.x,
    y: clampNumber(
      boundedCurrentPosition.y + config.minMoveDistance,
      mapBounds.minY,
      mapBounds.maxY,
    ),
  };
}

/**
 * 将业务朝向映射为当前基础羊贴图需要的水平缩放。
 * `sheep_001` 原始素材面向左侧，因此向右移动时需要镜像，向左移动时保持原始方向。
 */
export function getSheepSpriteScaleX(facing: SheepFacingDirection): number {
  return facing === 'right' ? -1 : 1;
}

/**
 * 从业务羊实例创建表现层漫游状态。
 * 初始状态总是先停顿一小段时间，避免新羊生成后所有个体立即同步移动。
 */
export function createInitialSheepRoamingState(
  sheepInstance: SheepInstanceState,
  config: RoamingConfig,
  random: RandomSource = Math.random,
): SheepRoamingState {
  const mapBounds = config.mapBounds[sheepInstance.mapId];

  return {
    phase: 'idle',
    position: mapBounds
      ? createRandomInitialPositionInRoamingBounds(mapBounds, random)
      : createPositionCopy(sheepInstance.position),
    targetPosition: null,
    facing: 'right',
    remainingSeconds: createIdleDuration(config, random),
    speedUnitsPerSecond: config.speedUnitsPerSecond,
  };
}

/**
 * 推进单只羊的可视漫游状态。
 * 输入和输出都是纯数据，方便测试；Cocos 节点移动由表现层消费这个结果完成。
 */
export function stepSheepRoamingState(
  roamingState: SheepRoamingState,
  mapBounds: RoamingMapBounds,
  config: RoamingConfig,
  deltaSeconds: number,
  random: RandomSource = Math.random,
): SheepRoamingState {
  const safeDeltaSeconds = Math.max(0, deltaSeconds);
  const boundedRoamingState = {
    ...roamingState,
    position: clampPositionToRoamingBounds(roamingState.position, mapBounds),
    targetPosition: roamingState.targetPosition
      ? clampPositionToRoamingBounds(roamingState.targetPosition, mapBounds)
      : null,
  };

  if (safeDeltaSeconds === 0) {
    return boundedRoamingState;
  }

  if (boundedRoamingState.phase === 'idle') {
    const remainingSeconds = boundedRoamingState.remainingSeconds - safeDeltaSeconds;
    if (remainingSeconds > 0) {
      return {
        ...boundedRoamingState,
        remainingSeconds,
      };
    }

    const targetPosition = createNextRoamingTarget(
      boundedRoamingState.position,
      mapBounds,
      config,
      random,
    );

    return {
      ...boundedRoamingState,
      phase: 'walking',
      targetPosition,
      facing: getFacingFromMovement(
        targetPosition.x - boundedRoamingState.position.x,
        boundedRoamingState.facing,
      ),
      remainingSeconds: 0,
    };
  }

  if (!boundedRoamingState.targetPosition) {
    return {
      ...boundedRoamingState,
      phase: 'idle',
      remainingSeconds: createIdleDuration(config, random),
    };
  }

  const deltaX = boundedRoamingState.targetPosition.x - boundedRoamingState.position.x;
  const deltaY = boundedRoamingState.targetPosition.y - boundedRoamingState.position.y;
  const distanceToTarget = Math.hypot(deltaX, deltaY);
  const walkDistance = boundedRoamingState.speedUnitsPerSecond * safeDeltaSeconds;

  if (distanceToTarget <= config.arrivalDistance || walkDistance >= distanceToTarget) {
    return {
      ...boundedRoamingState,
      phase: 'idle',
      position: createPositionCopy(boundedRoamingState.targetPosition),
      targetPosition: null,
      facing: getFacingFromMovement(deltaX, boundedRoamingState.facing),
      remainingSeconds: createIdleDuration(config, random),
    };
  }

  const walkRatio = walkDistance / distanceToTarget;
  const nextPosition = {
    x: boundedRoamingState.position.x + deltaX * walkRatio,
    y: boundedRoamingState.position.y + deltaY * walkRatio,
  };

  return {
    ...boundedRoamingState,
    position: nextPosition,
    facing: getFacingFromMovement(deltaX, boundedRoamingState.facing),
  };
}

/**
 * 为不同等级生成稳定的可视区分样式。
 * 目前使用“渐进体型 + 分段色调”覆盖 `001-025`，避免在羊头顶额外显示编号徽标。
 */
export function createSheepVisualStyle(sheepId: SheepId): SheepVisualStyle {
  const sheepLevel = parseSheepLevel(sheepId);
  const tierIndex = Math.min(
    SHEEP_VISUAL_TINTS.length - 1,
    Math.floor((sheepLevel - 1) / 5),
  );
  const displayScale = Math.round((1 + Math.min(sheepLevel - 1, 24) * 0.014) * 1000) / 1000;
  const tint = SHEEP_VISUAL_TINTS[tierIndex];

  return {
    displayScale,
    tint: {
      r: tint.r,
      g: tint.g,
      b: tint.b,
    },
    tierIndex,
  };
}
