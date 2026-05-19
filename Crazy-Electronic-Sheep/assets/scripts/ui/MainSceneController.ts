import {
  _decorator,
  Camera,
  Color,
  Component,
  Label,
  Node,
  resources,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
  view,
} from 'cc';
import { bootGameState } from '../boot/bootCoordinator';
import { GAME_CONFIG } from '../config/gameConfig';
import {
  buySheepOnCurrentMap,
  createCoreHudSnapshot,
  settleIdleProduction,
  type BuyCurrentMapSheepFailureReason,
  type GameState,
} from '../domain/gameStateSchema';
import { setRuntimeGameState } from '../runtime/runtimeSession';
import {
  clearSerializedSave,
  readSerializedSave,
  writeSerializedSave,
} from '../storage/localSaveRepository';
import { MainSceneHudView } from './MainSceneHudView';
import { MainSceneMapSheepLayerView } from './MainSceneMapSheepLayerView';
import { MainSceneRecruitmentPanelView } from './MainSceneRecruitmentPanelView';
import {
  createEllipse as createUiEllipse,
  createLabel as createUiLabel,
  createLayerNode as createUiLayerNode,
  createRect as createUiRect,
  createRoundedRect as createUiRoundedRect,
  createSpriteNode as createUiSpriteNode,
} from './uiNodeFactory';

const { ccclass } = _decorator;

/**
 * 主场景继续使用固定设计尺寸，保证顶部 HUD 与地图素材在竖屏下稳定对位。
 */
const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;

/**
 * 旧布局最初基于 `720x1280` 搭骨架，当前继续以它为缩放基准。
 */
const LEGACY_LAYOUT_WIDTH = 720;
const MAP_01_BACKGROUND_SOURCE_WIDTH = 941;
const MAP_01_BACKGROUND_SOURCE_HEIGHT = 1672;

/**
 * `resources` 目录中的真实贴图路径，运行时统一按 `spriteFrame` 子资源加载。
 */
const MAP_01_BACKGROUND_RESOURCE = 'map_01/map_01_background/spriteFrame';

/**
 * 赠送羊与其阴影的显示尺寸。
 * 这里保持小体量，避免在第一图空场景里显得过分拥挤。
 */
const SHEEP_001_DISPLAY_WIDTH = 131;
const SHEEP_001_DISPLAY_HEIGHT = 120;

/**
 * 自动产出轮询频率高于 1 秒，但结算始终按整秒推进。
 * 这样既能及时检查状态，又能保证 HUD 数字按秒跳动。
 */
const IDLE_PRODUCTION_POLL_INTERVAL_SECONDS = 0.2;
const IDLE_PRODUCTION_SETTLE_INTERVAL_MS = 1_000;
const IDLE_PRODUCTION_LOOP_OWNER_KEY =
  '__crazyElectronicSheepIdleProductionLoopOwnerToken';

/**
 * 主场景渲染完成后需要持续刷新的关键节点引用。
 * UI 层只持有展示句柄，不持有业务真值。
 */
type SceneVisualNodes = {
  backgroundArtLayer: Node;
  sheepArtAnchor: Node;
  sheepStatusLabel: Label;
  hudView: MainSceneHudView;
};

/**
 * 当前可视区域与旧布局缩放系数。
 * 背景、相机与 HUD 都基于这里的结果自适应到实际设备尺寸。
 */
type ViewportMetrics = {
  width: number;
  height: number;
  layoutScale: number;
};

@ccclass('MainSceneController')
export class MainSceneController extends Component {
  /**
   * 当前运行中的业务真值。
   * 自动产出每次结算后都会替换成新快照，并写回运行时缓存与本地存档。
   */
  private runtimeGameState: GameState | null = null;

  /**
   * 场景内需要频繁刷新的 HUD 句柄。
   * 只更新文本，不重复重建整棵节点树。
   */
  private sceneVisualNodes: SceneVisualNodes | null = null;

  /**
   * 最近一次已经完成整秒结算的时间戳。
   * 轮询函数会基于它补齐遗漏秒数，避免预览卡顿时漏算资源。
   */
  private lastIdleProductionSettledAt = 0;

  /**
   * 预览热刷新时可能残留旧轮询实例，这个 token 用来判定当前谁才是有效 owner。
   * 只有拿到 owner 的控制器才允许继续推进资源与写回存档。
   */
  private idleProductionLoopOwnerToken = '';

  /**
   * 招聘弹窗显示状态独立于业务真值，
   * 这样关闭弹窗不会修改游戏状态，只影响当前可视层。
   */
  private isRecruitmentModalVisible = false;

  /**
   * 最近一次购买反馈文本会同时驱动场景提示条和弹窗提示区，
   * 方便玩家立即知道“成功 / 资源不足 / 满员 / 无出生点”等结果。
   */
  private latestRecruitmentFeedback = '';

  /**
   * 地图羊群与招聘弹窗属于当前主场景的附加视图层，
   * 先作为控制器内部字段维护，后续若 UI 继续增大再拆到独立模块。
   */
  private mapSheepLayerView: MainSceneMapSheepLayerView | null = null;
  private recruitmentPanelView: MainSceneRecruitmentPanelView | null = null;
  private currentLayoutScale = 1;

  /**
   * Cocos 生命周期入口。
   * 先启动业务状态，再渲染地图与 HUD 骨架。
   */
  protected start(): void {
    void this.bootstrapAndRender();
  }

  /**
   * 场景销毁时停止轮询并释放 owner，避免旧实例继续写状态。
   */
  protected onDestroy(): void {
    this.unschedule(this.pollIdleProduction);
    this.releaseIdleProductionLoopOwnership();
  }

  /**
   * 统一协调整个启动过程。
   * 包括读档、新档兜底、渲染骨架、刷新 HUD、挂载真实贴图。
   */
  private async bootstrapAndRender(): Promise<void> {
    try {
      const bootResult = bootGameState({
        readSerializedSave: () => readSerializedSave(GAME_CONFIG.storageKey),
        writeSerializedSave: (gameState) =>
          writeSerializedSave(GAME_CONFIG.storageKey, gameState),
      });

      this.runtimeGameState = bootResult.gameState;
      setRuntimeGameState(bootResult.gameState);

      const sceneVisualNodes = this.renderFoundation();
      this.sceneVisualNodes = sceneVisualNodes;
      this.refreshCoreHud(bootResult.gameState, sceneVisualNodes);
      this.startIdleProductionLoop();

      await this.hydrateSceneArt(bootResult.gameState, sceneVisualNodes);
      this.ensureRecruitmentOverlay(sceneVisualNodes);
      this.refreshRecruitmentOverlay(bootResult.gameState, sceneVisualNodes);
      await this.renderMapSheepSprites(bootResult.gameState, sceneVisualNodes);
    } catch (error) {
      this.runtimeGameState = null;
      this.sceneVisualNodes = null;
      this.unschedule(this.pollIdleProduction);
      this.releaseIdleProductionLoopOwnership();
      console.error('[MainSceneController] boot failed', error);
      this.renderFatalError();
    }
  }

  /**
   * 先渲染稳定的骨架层，确保真实贴图尚未加载时场景也可见。
   * 顶部 HUD 固定在屏幕顶部安全区内，因为当前地图可视范围就是整个屏幕。
   */
  private renderFoundation(): SceneVisualNodes {
    const viewportMetrics = this.getViewportMetrics();
    const scaleLayout = this.createLayoutScaler(viewportMetrics.layoutScale);
    this.currentLayoutScale = viewportMetrics.layoutScale;
    const backgroundDisplayHeight = this.calculateHeightByWidth(
      viewportMetrics.width,
      MAP_01_BACKGROUND_SOURCE_WIDTH,
      MAP_01_BACKGROUND_SOURCE_HEIGHT,
    );
    const mapVisibleHeight = Math.min(backgroundDisplayHeight, viewportMetrics.height);

    const canvasNode = this.node.parent;
    const canvasNodeTransform = canvasNode?.getComponent(UITransform);
    if (canvasNodeTransform) {
      canvasNodeTransform.setContentSize(viewportMetrics.width, viewportMetrics.height);
    }

    const sceneCamera = canvasNode?.getChildByName('Camera')?.getComponent(Camera);
    if (sceneCamera) {
      sceneCamera.orthoHeight = viewportMetrics.height / 2;
    }

    const canvasTransform = this.node.getComponent(UITransform);
    if (canvasTransform) {
      canvasTransform.setContentSize(viewportMetrics.width, viewportMetrics.height);
    }

    this.node.removeAllChildren();

    this.createRect(
      this.node,
      'FallbackBackground',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      viewportMetrics.height,
      new Color(24, 34, 44, 255),
      new Color(24, 34, 44, 255),
    );

    const backgroundArtLayer = this.createLayerNode(
      this.node,
      'BackgroundArtLayer',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      backgroundDisplayHeight,
    );

    /**
     * 顶部 HUD 已迁移到独立组件。
     * 主控制器只负责创建组件节点并传入布局输入，不再持有 HUD 子节点细节。
     */
    const hudRoot = this.createLayerNode(
      this.node,
      'CoreHudView',
      new Vec3(0, 0, 10),
      viewportMetrics.width,
      mapVisibleHeight,
    );
    const hudView = hudRoot.addComponent(MainSceneHudView);
    hudView.build({
      viewportWidth: viewportMetrics.width,
      mapVisibleHeight,
      layoutScale: viewportMetrics.layoutScale,
    });

    const sheepArtAnchor = this.createLayerNode(
      this.node,
      'SheepArtAnchor',
      new Vec3(0, scaleLayout(-275), 0),
      SHEEP_001_DISPLAY_WIDTH,
      SHEEP_001_DISPLAY_HEIGHT,
    );

    const sheepStatusBadge = this.createRoundedRect(
      this.node,
      'SheepStatusBadge',
      new Vec3(0, scaleLayout(-430), 0),
      scaleLayout(320),
      scaleLayout(44),
      scaleLayout(22),
      new Color(251, 252, 241, 230),
      new Color(101, 133, 61, 255),
      scaleLayout(3),
    );
    const sheepStatusLabel = this.createLabel(
      sheepStatusBadge,
      'SheepStatusLabel',
      '正在加载 001 羊素材…',
      scaleLayout(16),
      scaleLayout(284),
      scaleLayout(28),
      new Vec3(0, 0, 0),
      new Color(88, 69, 42, 255),
    );

    /**
     * 测试期保留一个极简清档按钮，方便快速回到新档开局。
     * 这里只触发正式清档接口与正式 boot 流程，不手改零散运行时字段。
     */
    const clearSaveButton = this.createRoundedRect(
      this.node,
      'ClearSaveButton',
      new Vec3(
        -Math.round(viewportMetrics.width / 2) + scaleLayout(84),
        -Math.round(viewportMetrics.height / 2) + scaleLayout(68),
        20,
      ),
      scaleLayout(128),
      scaleLayout(46),
      scaleLayout(18),
      new Color(255, 244, 236, 245),
      new Color(176, 88, 64, 255),
      scaleLayout(3),
    );
    this.createLabel(
      clearSaveButton,
      'ClearSaveButtonLabel',
      '清档重开',
      scaleLayout(16),
      scaleLayout(108),
      scaleLayout(28),
      new Vec3(0, 0, 0),
      new Color(122, 56, 40, 255),
      Label.HorizontalAlign.CENTER,
      true,
    );
    clearSaveButton.on(Node.EventType.TOUCH_END, this.handleClearSave, this);

    return {
      backgroundArtLayer,
      sheepArtAnchor,
      sheepStatusLabel,
      hudView,
    };
  }

  /**
   * 将真实贴图接入当前场景。
   * HUD 面板与地图背景独立加载，单个资源失败不会拖垮整屏。
   */
  private async hydrateSceneArt(
    _gameState: GameState,
    sceneVisualNodes: SceneVisualNodes,
  ): Promise<void> {
    await Promise.all([
      this.attachBackgroundSprite(sceneVisualNodes.backgroundArtLayer),
      sceneVisualNodes.hudView.attachPanelSprites(),
    ]);
  }

  /**
   * 把 `map_01` 的真实背景图挂进全屏背景层。
   */
  private async attachBackgroundSprite(backgroundArtLayer: Node): Promise<void> {
    const viewportMetrics = this.getViewportMetrics();
    const backgroundDisplayHeight = this.calculateHeightByWidth(
      viewportMetrics.width,
      MAP_01_BACKGROUND_SOURCE_WIDTH,
      MAP_01_BACKGROUND_SOURCE_HEIGHT,
    );

    try {
      const spriteFrame = await this.loadSpriteFrame(MAP_01_BACKGROUND_RESOURCE);
      this.createSpriteNode(
        backgroundArtLayer,
        'Map01BackgroundSprite',
        spriteFrame,
        new Vec3(0, 0, 0),
        viewportMetrics.width,
        backgroundDisplayHeight,
      );
    } catch (error) {
      console.error('[MainSceneController] map_01 background load failed', error);
    }
  }

  /**
   * 招聘入口与弹窗全部改为素材拼装，并保持在主界面安全区内。
   */
  /**
   * 创建或复用招聘弹窗组件。
   * 控制器只负责提供回调和当前运行态，具体 UI 节点由组件维护。
   */
  private ensureRecruitmentOverlay(sceneVisualNodes: SceneVisualNodes): void {
    if (this.recruitmentPanelView?.node.isValid) {
      return;
    }

    const viewportMetrics = this.getViewportMetrics();
    const recruitmentPanelRoot = this.createLayerNode(
      this.node,
      'RecruitmentPanelView',
      new Vec3(0, 0, 25),
      viewportMetrics.width,
      viewportMetrics.height,
    );
    const recruitmentPanelView = recruitmentPanelRoot.addComponent(
      MainSceneRecruitmentPanelView,
    );
    recruitmentPanelView.build({
      viewportWidth: viewportMetrics.width,
      viewportHeight: viewportMetrics.height,
      layoutScale: this.currentLayoutScale,
      onToggleModal: this.toggleRecruitmentModal,
      onPurchase: this.handleRecruitmentPurchase,
      onUnavailableAction: this.handleUnavailableRecruitmentAction,
    });

    this.recruitmentPanelView = recruitmentPanelView;
    sceneVisualNodes.sheepStatusLabel.string = '招聘入口已就绪';
  }

  /**
   * 刷新招聘弹窗视图并把组件返回的反馈文案同步到主场景状态条。
   */
  private refreshRecruitmentOverlay(
    gameState: GameState,
    sceneVisualNodes: SceneVisualNodes,
  ): void {
    if (!this.recruitmentPanelView?.node.isValid) {
      this.ensureRecruitmentOverlay(sceneVisualNodes);
    }

    if (!this.recruitmentPanelView?.node.isValid) {
      return;
    }

    const feedbackMessage = this.recruitmentPanelView.refresh({
      gameState,
      isModalVisible: this.isRecruitmentModalVisible,
      latestFeedback: this.latestRecruitmentFeedback,
      formatIdleEnergyValue: (value) => this.formatIdleEnergyValue(value),
    });
    sceneVisualNodes.sheepStatusLabel.string = feedbackMessage;
  }

  /**
   * 招聘弹窗中暂未开放的按钮统一回到这里更新反馈。
   */
  private readonly handleUnavailableRecruitmentAction = (message: string): void => {
    this.latestRecruitmentFeedback = message;
    if (this.runtimeGameState && this.sceneVisualNodes) {
      this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
    }
  };
  private async renderMapSheepSprites(
    gameState: GameState,
    sceneVisualNodes: SceneVisualNodes,
  ): Promise<void> {
    const mapSheepLayerView = this.ensureMapSheepLayerView(sceneVisualNodes);
    await mapSheepLayerView.render(gameState, {
      layoutScale: this.currentLayoutScale,
      sheepArtAnchor: sceneVisualNodes.sheepArtAnchor,
      sheepStatusLabel: sceneVisualNodes.sheepStatusLabel,
    });
  }

  /**
   * 创建或复用地图羊群表现组件。
   * 主控制器只负责挂载组件节点，具体羊节点和飘字由组件维护。
   */
  private ensureMapSheepLayerView(
    sceneVisualNodes: SceneVisualNodes,
  ): MainSceneMapSheepLayerView {
    if (this.mapSheepLayerView?.node.isValid) {
      return this.mapSheepLayerView;
    }

    const viewportMetrics = this.getViewportMetrics();
    const mapSheepLayer = this.createLayerNode(
      this.node,
      'MapSheepLayer',
      new Vec3(0, 0, 5),
      viewportMetrics.width,
      viewportMetrics.height,
    );
    mapSheepLayer.setSiblingIndex(sceneVisualNodes.sheepArtAnchor.getSiblingIndex());

    this.mapSheepLayerView = mapSheepLayer.addComponent(MainSceneMapSheepLayerView);
    this.mapSheepLayerView.preloadIdleEnergyFeedbackSpriteFrame();

    return this.mapSheepLayerView;
  }

  private formatRecruitmentFailureMessage(
    reason: BuyCurrentMapSheepFailureReason,
  ): string {
    switch (reason) {
      case 'insufficient_idle_energy':
        return '摸鱼能量不足，暂时无法招聘';
      case 'map_capacity_full':
        return '当前地图已满，先合成再招聘';
      case 'no_legal_spawn_position':
        return '当前地图没有空闲出生点，招聘失败';
      case 'sheep_not_purchasable':
        return '当前切片暂未开放这只羊的购买';
      case 'map_locked':
        return '当前地图尚未解锁，无法招聘';
      default:
        return '招聘失败，请稍后重试';
    }
  }

  private readonly toggleRecruitmentModal = (): void => {
    this.isRecruitmentModalVisible = !this.isRecruitmentModalVisible;
    if (this.runtimeGameState && this.sceneVisualNodes) {
      this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
    }
  };

  /**
   * 测试清档入口。
   * 先删除本地存档，再复用正式启动链路重建新档并刷新当前场景。
   */
  private readonly handleClearSave = (): void => {
    if (!this.sceneVisualNodes) {
      return;
    }

    const didClear = clearSerializedSave(GAME_CONFIG.storageKey);
    if (!didClear) {
      this.latestRecruitmentFeedback = '清档失败，请检查控制台日志';
      if (this.runtimeGameState) {
        this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
      } else {
        this.sceneVisualNodes.sheepStatusLabel.string = this.latestRecruitmentFeedback;
      }
      return;
    }

    const bootResult = bootGameState({
      readSerializedSave: () => readSerializedSave(GAME_CONFIG.storageKey),
      writeSerializedSave: (gameState) =>
        writeSerializedSave(GAME_CONFIG.storageKey, gameState),
    });

    this.runtimeGameState = bootResult.gameState;
    setRuntimeGameState(bootResult.gameState);
    this.lastIdleProductionSettledAt = bootResult.gameState.updatedAt;
    this.isRecruitmentModalVisible = false;
    this.latestRecruitmentFeedback = bootResult.didPersist
      ? '存档已清除，已重建新档'
      : '存档已清除，但新档写回失败';
    this.refreshCoreHud(bootResult.gameState, this.sceneVisualNodes);
    this.refreshRecruitmentOverlay(bootResult.gameState, this.sceneVisualNodes);
    void this.renderMapSheepSprites(bootResult.gameState, this.sceneVisualNodes);
  };

  private readonly handleRecruitmentPurchase = (): void => {
    if (!this.runtimeGameState || !this.sceneVisualNodes) {
      return;
    }

    const currentMapDefinition = GAME_CONFIG.maps[this.runtimeGameState.currentMapId];
    const requestedSheepId = currentMapDefinition.defaultPurchasableSheepIds[0];
    if (!requestedSheepId) {
      this.latestRecruitmentFeedback = '当前地图招聘入口尚未开放';
      this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
      return;
    }

    const purchaseResult = buySheepOnCurrentMap(
      this.runtimeGameState,
      {
        maps: GAME_CONFIG.maps,
        sheepDefinitions: GAME_CONFIG.sheepDefinitions,
      },
      {
        sheepId: requestedSheepId,
      },
    );

    if (purchaseResult.kind === 'failure') {
      this.latestRecruitmentFeedback = this.formatRecruitmentFailureMessage(
        purchaseResult.reason,
      );
      this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
      return;
    }

    this.runtimeGameState = purchaseResult.gameState;
    setRuntimeGameState(purchaseResult.gameState);
    this.refreshCoreHud(purchaseResult.gameState, this.sceneVisualNodes);
    this.latestRecruitmentFeedback =
      `${purchaseResult.purchasedSheep.sheepId} ${GAME_CONFIG.sheepDefinitions[requestedSheepId].displayName} 招聘成功`;
    this.refreshRecruitmentOverlay(purchaseResult.gameState, this.sceneVisualNodes);
    void this.renderMapSheepSprites(purchaseResult.gameState, this.sceneVisualNodes);

    const didPersist = writeSerializedSave(GAME_CONFIG.storageKey, purchaseResult.gameState);
    if (!didPersist) {
      console.warn('[MainSceneController] recruitment purchase was not persisted');
    }
  };

  /**
   * 启动自动产出轮询。
   * 每次启动前先取消旧轮询，并注册新的 owner token，防止热刷新叠加资源。
   */
  private startIdleProductionLoop(): void {
    this.unschedule(this.pollIdleProduction);
    this.idleProductionLoopOwnerToken = `${Date.now()}-${Math.random()}`;
    this.claimIdleProductionLoopOwnership();
    this.lastIdleProductionSettledAt = Date.now();
    this.schedule(this.pollIdleProduction, IDLE_PRODUCTION_POLL_INTERVAL_SECONDS);
  }

  /**
   * 补齐已经过去的整秒数，并把资源与 HUD 一起推进。
   */
  private readonly pollIdleProduction = (): void => {
    if (!this.runtimeGameState || !this.sceneVisualNodes || !this.isIdleProductionLoopOwner()) {
      return;
    }

    const now = Date.now();
    const elapsedMs = now - this.lastIdleProductionSettledAt;
    const settledSeconds = Math.floor(elapsedMs / IDLE_PRODUCTION_SETTLE_INTERVAL_MS);
    if (settledSeconds <= 0) {
      return;
    }

    const settledAt =
      this.lastIdleProductionSettledAt +
      settledSeconds * IDLE_PRODUCTION_SETTLE_INTERVAL_MS;
    const nextGameState = settleIdleProduction(
      this.runtimeGameState,
      GAME_CONFIG.sheepDefinitions,
      settledSeconds,
      settledAt,
    );

    this.lastIdleProductionSettledAt = settledAt;
    this.runtimeGameState = nextGameState;
    setRuntimeGameState(nextGameState);
    this.refreshCoreHud(nextGameState, this.sceneVisualNodes);
    this.playVisibleMapSheepIdleProductionFeedback(nextGameState, settledSeconds);

    const didPersist = writeSerializedSave(GAME_CONFIG.storageKey, nextGameState);
    if (!didPersist) {
      console.warn('[MainSceneController] idle production tick was not persisted');
    }
  };

  /**
   * 声明当前控制器为唯一允许推进自动产出的 owner。
   */
  private claimIdleProductionLoopOwnership(): void {
    const runtimeGlobal = globalThis as typeof globalThis & {
      [IDLE_PRODUCTION_LOOP_OWNER_KEY]?: string;
    };
    runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY] = this.idleProductionLoopOwnerToken;
  }

  /**
   * 判断当前控制器是否仍然持有资源推进权限。
   */
  private isIdleProductionLoopOwner(): boolean {
    const runtimeGlobal = globalThis as typeof globalThis & {
      [IDLE_PRODUCTION_LOOP_OWNER_KEY]?: string;
    };
    return runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY] === this.idleProductionLoopOwnerToken;
  }

  /**
   * 释放当前 owner，避免旧实例长期占用全局锁。
   */
  private releaseIdleProductionLoopOwnership(): void {
    const runtimeGlobal = globalThis as typeof globalThis & {
      [IDLE_PRODUCTION_LOOP_OWNER_KEY]?: string;
    };
    if (runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY] === this.idleProductionLoopOwnerToken) {
      delete runtimeGlobal[IDLE_PRODUCTION_LOOP_OWNER_KEY];
    }
  }

  /**
   * 将业务快照同步到顶部核心 HUD。
   * 左侧展示总资产与 `xx/s` 秒产，左上羊钻面板当前只展示羊钻数。
   */
  private refreshCoreHud(gameState: GameState, sceneVisualNodes: SceneVisualNodes): void {
    const hudSnapshot = createCoreHudSnapshot(gameState, GAME_CONFIG.sheepDefinitions);
    sceneVisualNodes.hudView.refresh({
      idleEnergyText: this.formatIdleEnergyValue(hudSnapshot.idleEnergy),
      globalIdleEnergyPerSecondText: `${this.formatIdleEnergyValue(
        hudSnapshot.globalIdleEnergyPerSecond,
      )}/s`,
      sheepDiamondText: '0',
    });
  }

  /**
   * 当前主场景里实际可见的是第一图羊层，因此秒产反馈要逐只挂到对应羊节点上。
   * 正常运行时这里会严格每秒弹一次；如果前台卡顿补帧过多，则压缩成每只羊一次汇总提示，避免爆屏。
   */
  private playVisibleMapSheepIdleProductionFeedback(
    gameState: GameState,
    settledSeconds: number,
  ): void {
    if (!this.mapSheepLayerView?.node.isValid) {
      return;
    }

    this.mapSheepLayerView.playIdleProductionFeedback(gameState, {
      settledSeconds,
      sheepDefinitions: GAME_CONFIG.sheepDefinitions,
      formatIdleEnergyValue: (value) => this.formatIdleEnergyValue(value),
    });
  }

  /**
   * 将资源值格式化成紧凑读法，避免后续高阶数值把 HUD 撑爆。
   */
  private formatIdleEnergyValue(value: number): string {
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    }

    if (absoluteValue >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }

    if (absoluteValue >= 1_000) {
      return `${(value / 1_000).toFixed(2)}K`;
    }

    if (Number.isInteger(value)) {
      return String(value);
    }

    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  /**
   * 将 `resources` 中的图片子资源统一转成 `SpriteFrame` Promise。
   */
  private loadSpriteFrame(resourcePath: string): Promise<SpriteFrame> {
    return new Promise<SpriteFrame>((resolve, reject) => {
      resources.load(resourcePath, SpriteFrame, (error, spriteFrame) => {
        if (error || !spriteFrame) {
          reject(error ?? new Error(`Missing spriteFrame: ${resourcePath}`));
          return;
        }

        resolve(spriteFrame);
      });
    });
  }

  /**
   * 启动失败时给出稳定可见的错误反馈，避免黑屏。
   */
  private renderFatalError(): void {
    const viewportMetrics = this.getViewportMetrics();

    const canvasNode = this.node.parent;
    const canvasNodeTransform = canvasNode?.getComponent(UITransform);
    if (canvasNodeTransform) {
      canvasNodeTransform.setContentSize(viewportMetrics.width, viewportMetrics.height);
    }

    const sceneCamera = canvasNode?.getChildByName('Camera')?.getComponent(Camera);
    if (sceneCamera) {
      sceneCamera.orthoHeight = viewportMetrics.height / 2;
    }

    const canvasTransform = this.node.getComponent(UITransform);
    if (canvasTransform) {
      canvasTransform.setContentSize(viewportMetrics.width, viewportMetrics.height);
    }

    this.node.removeAllChildren();
    this.createRect(
      this.node,
      'ErrorBackground',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      viewportMetrics.height,
      new Color(36, 18, 18, 255),
      new Color(36, 18, 18, 255),
    );
    this.createLabel(
      this.node,
      'ErrorText',
      '启动失败，请检查控制台日志。',
      32,
      520,
      50,
      new Vec3(0, 0, 0),
      new Color(255, 221, 221, 255),
    );
  }

  /**
   * 获取当前可视区域尺寸。
   * 背景、相机与 HUD 都必须跟随这里的尺寸结果。
   */
  private getViewportMetrics(): ViewportMetrics {
    const visibleSize = view.getVisibleSize();
    const width = Math.round(visibleSize.width || DESIGN_WIDTH);
    const height = Math.round(visibleSize.height || DESIGN_HEIGHT);

    return {
      width,
      height,
      layoutScale: width / LEGACY_LAYOUT_WIDTH,
    };
  }

  /**
   * 基于旧布局基准创建统一缩放函数。
   */
  private createLayoutScaler(layoutScale: number): (value: number) => number {
    return (value: number) => Math.round(value * layoutScale);
  }

  /**
   * 按目标显示宽度与原图比例计算高度，保证贴图不被拉伸变形。
   */
  private calculateHeightByWidth(
    displayWidth: number,
    sourceWidth: number,
    sourceHeight: number,
  ): number {
    return Math.round((displayWidth * sourceHeight) / sourceWidth);
  }

  /**
   * 创建纯内容挂点，供背景图、羊贴图和 HUD 贴图使用。
   */
  private createLayerNode(
    parent: Node,
    name: string,
    position: Vec3,
    width: number,
    height: number,
  ): Node {
    return createUiLayerNode(parent, name, position, width, height);
  }

  /**
   * 创建使用自定义尺寸的 `Sprite` 节点。
   * 所有真实贴图都通过这个入口挂入场景，避免尺寸处理分散。
   */
  private createSpriteNode(
    parent: Node,
    name: string,
    spriteFrame: SpriteFrame,
    position: Vec3,
    width: number,
    height: number,
  ): Sprite {
    return createUiSpriteNode(parent, name, spriteFrame, position, width, height);
  }

  /**
   * 创建基础矩形节点，用于兜底背景与异常场景。
   */
  private createRect(
    parent: Node,
    name: string,
    position: Vec3,
    width: number,
    height: number,
    fillColor: Color,
    strokeColor: Color,
  ): Node {
    return createUiRect(parent, name, position, width, height, fillColor, strokeColor);
  }

  /**
   * 统一创建文本节点。
   * 默认使用收缩模式，优先保证 HUD 在不同设备宽度下不溢出。
   */
  private createLabel(
    parent: Node,
    name: string,
    text: string,
    fontSize: number,
    width: number,
    height: number,
    position: Vec3,
    color: Color,
    horizontalAlign: number = Label.HorizontalAlign.CENTER,
    isBold: boolean = false,
  ): Label {
    return createUiLabel(
      parent,
      name,
      text,
      fontSize,
      width,
      height,
      position,
      color,
      horizontalAlign,
      isBold,
    );
  }

  /**
   * 创建圆角底板。
   * 当前主要用于羊阴影与状态条，保持辅助信息样式克制统一。
   */
  private createRoundedRect(
    parent: Node,
    name: string,
    position: Vec3,
    width: number,
    height: number,
    radius: number,
    fillColor: Color,
    strokeColor: Color,
    lineWidth: number,
  ): Node {
    return createUiRoundedRect(
      parent,
      name,
      position,
      width,
      height,
      radius,
      fillColor,
      strokeColor,
      lineWidth,
    );
  }

  /**
   * 创建椭圆节点。
   * 当前主要给羊影子使用，让底部受光关系更柔和。
   */
  private createEllipse(
    parent: Node,
    name: string,
    position: Vec3,
    width: number,
    height: number,
    fillColor: Color,
    strokeColor: Color,
    lineWidth: number,
  ): Node {
    return createUiEllipse(
      parent,
      name,
      position,
      width,
      height,
      fillColor,
      strokeColor,
      lineWidth,
    );
  }
}
