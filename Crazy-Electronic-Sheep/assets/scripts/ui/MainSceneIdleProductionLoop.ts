import { _decorator, Component } from 'cc';
import {
  settleIdleProduction,
  type GameState,
  type SheepId,
  type SheepIdleProductionDefinition,
} from '../domain/gameStateSchema';

const { ccclass } = _decorator;

/**
 * 自动产出轮询频率高于 1 秒，但结算始终按整秒推进。
 * 这样既能及时检查状态，又能保证 HUD 数字按秒跳动。
 */
const IDLE_PRODUCTION_POLL_INTERVAL_SECONDS = 0.2;
const IDLE_PRODUCTION_SETTLE_INTERVAL_MS = 1_000;
const IDLE_PRODUCTION_LOOP_OWNER_KEY =
  '__crazyElectronicSheepIdleProductionLoopOwnerToken';

/**
 * 自动产出完成一次整秒结算后的结果。
 * 控制器通过它刷新运行时状态、HUD 与当前地图飘字，不需要关心定时器内部细节。
 */
export interface MainSceneIdleProductionSettleResult {
  gameState: GameState;
  settledSeconds: number;
  settledAt: number;
}

/**
 * 自动产出组件依赖的外部协作接口。
 * 组件只负责“什么时候结算”和“如何得到下一份状态”，具体 UI 刷新交回主场景协调者。
 */
export interface MainSceneIdleProductionLoopOptions {
  getGameState: () => GameState | null;
  sheepDefinitions: Record<SheepId, SheepIdleProductionDefinition>;
  persistGameState: (gameState: GameState) => boolean;
  onSettled: (result: MainSceneIdleProductionSettleResult) => void;
  onPersistFailed?: (gameState: GameState) => void;
}

@ccclass('MainSceneIdleProductionLoop')
export class MainSceneIdleProductionLoop extends Component {
  /**
   * 读取当前业务真值的入口。
   * 使用函数而不是缓存状态，避免组件持有过期的 GameState 快照。
   */
  private getGameState: (() => GameState | null) | null = null;

  /**
   * 自动产出只需要羊的秒产定义。
   * 这里不依赖完整 `GAME_CONFIG`，保持组件与配置对象解耦。
   */
  private sheepDefinitions: Record<SheepId, SheepIdleProductionDefinition> | null =
    null;

  /**
   * 状态变更后的持久化入口。
   * 具体存到哪个 key、使用什么介质由存储服务决定。
   */
  private persistGameState: ((gameState: GameState) => boolean) | null = null;

  /**
   * 整秒结算成功后通知主场景协调者。
   * 主要副作用由外部完成：替换运行时状态、刷新 HUD、播放飘字。
   */
  private onSettled:
    | ((result: MainSceneIdleProductionSettleResult) => void)
    | null = null;

  /**
   * 本地存档写回失败时的可选回调。
   * 自动产出本身不会因为一次写回失败而停掉，避免玩家前台资源增长中断。
   */
  private onPersistFailed: ((gameState: GameState) => void) | null = null;

  /**
   * 最近一次已经完成整秒结算的时间戳。
   * 轮询函数会基于它补齐遗漏秒数，避免预览卡顿时漏算资源。
   */
  private lastSettledAt = 0;

  /**
   * 预览热刷新时可能残留旧轮询实例，这个 token 用来判定当前谁才是有效 owner。
   * 只有拿到 owner 的组件才允许继续推进资源与写回存档。
   */
  private ownerToken = '';

  /**
   * 注入自动产出运行时依赖。
   * 这个方法本身不启动定时器，调用方需要在主场景 boot 完成后显式调用 `startLoop`。
   */
  public configure(options: MainSceneIdleProductionLoopOptions): void {
    this.getGameState = options.getGameState;
    this.sheepDefinitions = options.sheepDefinitions;
    this.persistGameState = options.persistGameState;
    this.onSettled = options.onSettled;
    this.onPersistFailed = options.onPersistFailed ?? null;
  }

  /**
   * 启动自动产出轮询。
   * 每次启动前先取消旧轮询，并注册新的 owner token，防止热刷新叠加资源。
   */
  public startLoop(initialSettledAt: number = Date.now()): void {
    if (
      !this.getGameState ||
      !this.sheepDefinitions ||
      !this.persistGameState ||
      !this.onSettled
    ) {
      console.warn('[MainSceneIdleProductionLoop] start skipped before configure');
      return;
    }

    this.stopLoop();
    this.ownerToken = `${Date.now()}-${Math.random()}`;
    this.claimLoopOwnership();
    this.lastSettledAt = initialSettledAt;
    this.schedule(this.pollIdleProduction, IDLE_PRODUCTION_POLL_INTERVAL_SECONDS);
  }

  /**
   * 停止自动产出轮询并释放 owner。
   * 主场景销毁、启动失败或后续切场景时都应通过这里关闭定时器。
   */
  public stopLoop(): void {
    this.unschedule(this.pollIdleProduction);
    this.releaseLoopOwnership();
    this.ownerToken = '';
  }

  /**
   * 重置下一次整秒结算的基准时间。
   * 清档重开后需要把旧存档的补秒基准丢弃，避免立即结算旧状态遗留时间。
   */
  public resetSettledAt(nextSettledAt: number = Date.now()): void {
    this.lastSettledAt = nextSettledAt;
  }

  /**
   * Cocos 组件销毁时兜底释放定时器。
   */
  protected onDestroy(): void {
    this.stopLoop();
    this.getGameState = null;
    this.sheepDefinitions = null;
    this.persistGameState = null;
    this.onSettled = null;
    this.onPersistFailed = null;
  }

  /**
   * 补齐已经过去的整秒数，并把新状态交给主场景协调者。
   */
  private readonly pollIdleProduction = (): void => {
    if (
      !this.getGameState ||
      !this.sheepDefinitions ||
      !this.persistGameState ||
      !this.onSettled ||
      !this.isLoopOwner()
    ) {
      return;
    }

    const currentGameState = this.getGameState();
    if (!currentGameState) {
      return;
    }

    const now = Date.now();
    const elapsedMs = now - this.lastSettledAt;
    const settledSeconds = Math.floor(elapsedMs / IDLE_PRODUCTION_SETTLE_INTERVAL_MS);
    if (settledSeconds <= 0) {
      return;
    }

    const settledAt =
      this.lastSettledAt + settledSeconds * IDLE_PRODUCTION_SETTLE_INTERVAL_MS;
    const nextGameState = settleIdleProduction(
      currentGameState,
      this.sheepDefinitions,
      settledSeconds,
      settledAt,
    );

    this.lastSettledAt = settledAt;
    this.onSettled({
      gameState: nextGameState,
      settledSeconds,
      settledAt,
    });

    const didPersist = this.persistGameState(nextGameState);
    if (!didPersist) {
      this.onPersistFailed?.(nextGameState);
    }
  };

  /**
   * 声明当前组件为唯一允许推进自动产出的 owner。
   */
  private claimLoopOwnership(): void {
    const runtimeGlobal = globalThis as typeof globalThis & {
      [IDLE_PRODUCTION_LOOP_OWNER_KEY]?: string;
    };
    runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY] = this.ownerToken;
  }

  /**
   * 判断当前组件是否仍然持有资源推进权限。
   */
  private isLoopOwner(): boolean {
    const runtimeGlobal = globalThis as typeof globalThis & {
      [IDLE_PRODUCTION_LOOP_OWNER_KEY]?: string;
    };
    return runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY] === this.ownerToken;
  }

  /**
   * 释放当前 owner，避免旧实例长期占用全局锁。
   */
  private releaseLoopOwnership(): void {
    const runtimeGlobal = globalThis as typeof globalThis & {
      [IDLE_PRODUCTION_LOOP_OWNER_KEY]?: string;
    };
    if (runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY] === this.ownerToken) {
      delete runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY];
    }
  }
}
