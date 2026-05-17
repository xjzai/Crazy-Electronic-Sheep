import { GAME_CONFIG, type GameConfig } from '../config/gameConfig';
import type { GameState } from '../domain/gameStateSchema';
import {
  loadGameStateFromSerializedSave,
  type LoadGameStateSource,
} from '../domain/loadGameState';

/**
 * 启动协调器不直接依赖 Cocos 节点。
 * 它只负责编排“读档 -> 校验/新档 -> 必要时写回”的启动流程。
 */
export interface BootCoordinatorDependencies {
  readSerializedSave: () => string | null;
  writeSerializedSave: (gameState: GameState) => boolean;
  config?: GameConfig;
  now?: () => number;
}

export interface BootResult {
  gameState: GameState;
  source: LoadGameStateSource;
  didPersist: boolean;
}

/**
 * 执行启动阶段的最小业务闭环。
 * 这次 issue 的目标是保证进入主场景前，运行态里已经拿到可用的双地图最小状态。
 */
export function bootGameState(dependencies: BootCoordinatorDependencies): BootResult {
  const config = dependencies.config ?? GAME_CONFIG;
  const now = dependencies.now ?? Date.now;
  const loadResult = loadGameStateFromSerializedSave(
    dependencies.readSerializedSave(),
    config,
    now(),
  );

  let didPersist = false;
  if (loadResult.shouldPersist) {
    didPersist = dependencies.writeSerializedSave(loadResult.state);
  }

  return {
    gameState: loadResult.state,
    source: loadResult.source,
    didPersist,
  };
}
