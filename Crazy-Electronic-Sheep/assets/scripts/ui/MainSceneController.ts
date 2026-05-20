import {
  _decorator,
  Component,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import { bootGameState } from '../boot/bootCoordinator';
import { GAME_CONFIG } from '../config/gameConfig';
import {
  buySheepOnCurrentMap,
  createCoreHudSnapshot,
  type BuyCurrentMapSheepFailureReason,
  type GameState,
} from '../domain/gameStateSchema';
import { setRuntimeGameState } from '../runtime/runtimeSession';
import {
  clearMainGameStateSave,
  readMainGameSerializedSave,
  writeMainGameStateSave,
} from '../storage/gameStateSaveService';
import {
  MainSceneFoundationView,
  type MainSceneViewportMetrics,
  type MainSceneVisualNodes,
} from './MainSceneFoundationView';
import {
  MainSceneIdleProductionLoop,
  type MainSceneIdleProductionSettleResult,
} from './MainSceneIdleProductionLoop';
import { MainSceneMapSheepLayerView } from './MainSceneMapSheepLayerView';
import { MainSceneRecruitmentPanelView } from './MainSceneRecruitmentPanelView';
import { createLayerNode } from './uiNodeFactory';

const { ccclass, property } = _decorator;

/**
 * 地图羊群表现层在场景层级里的固定节点名。
 * 新场景会直接挂载该节点；旧场景缺失时控制器按此名称兜底创建。
 */
const MAP_SHEEP_LAYER_NODE_NAME = 'MapSheepLayerRoot';

/**
 * 招聘入口与弹窗表现层在场景层级里的固定节点名。
 * 该节点负责承载 `MainSceneRecruitmentPanelView` 生成的入口按钮和弹窗内容。
 */
const RECRUITMENT_PANEL_NODE_NAME = 'RecruitmentPanelRoot';

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
  private sceneVisualNodes: MainSceneVisualNodes | null = null;

  /**
   * 招聘弹窗显示状态独立于业务真值，
   * 这样关闭弹窗不会修改游戏状态，只影响当前可视层。
   */
  private isRecruitmentModalVisible = false;

  /**
   * 最近一次购买反馈文本只保留在控制器内，供后续事件链路复用。
   * 当前招聘结果已经统一走顶部提示组件，不再在招聘弹窗底部保留独立反馈区。
   */
  private latestRecruitmentFeedback = '';

  /**
   * 由 Cocos Inspector 挂载的地图羊群表现组件。
   * 组件负责当前第一图羊实例节点、阴影、贴图和自动产出飘字。
   */
  @property(MainSceneMapSheepLayerView)
  private mapSheepLayerView: MainSceneMapSheepLayerView | null = null;

  /**
   * 由 Cocos Inspector 挂载的招聘入口与弹窗组件。
   * 控制器只提供状态和回调，具体按钮、弹窗和卡片节点由组件维护。
   */
  @property(MainSceneRecruitmentPanelView)
  private recruitmentPanelView: MainSceneRecruitmentPanelView | null = null;

  /**
   * 由 Cocos Inspector 挂载的自动产出组件。
   * 保留运行时兜底创建，是为了避免旧场景资产或手动解绑时启动失败。
   */
  @property(MainSceneIdleProductionLoop)
  private idleProductionLoop: MainSceneIdleProductionLoop | null = null;

  /**
   * 由 Cocos Inspector 挂载的主场景基础视图组件。
   * 当前仍负责动态生成 UI 骨架，后续会继续把稳定节点拆成场景引用。
   */
  @property(MainSceneFoundationView)
  private foundationView: MainSceneFoundationView | null = null;

  private currentViewportMetrics: MainSceneViewportMetrics | null = null;
  private currentLayoutScale = 1;

  /**
   * 地图羊群层是否已经完成本轮节点尺寸同步和资源预加载。
   * 避免每次重绘羊群时重复预加载摸鱼能量飘字图标。
   */
  private isMapSheepLayerPrepared = false;

  /**
   * 招聘弹窗组件是否已经完成节点树构建。
   * 业务刷新只更新文本和显隐，不重复重建整套弹窗节点。
   */
  private isRecruitmentPanelBuilt = false;

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
    this.idleProductionLoop?.stopLoop();
    this.idleProductionLoop = null;
    this.isMapSheepLayerPrepared = false;
    this.isRecruitmentPanelBuilt = false;
  }

  /**
   * 统一协调整个启动过程。
   * 包括读档、新档兜底、渲染骨架、刷新 HUD、挂载真实贴图。
   */
  private async bootstrapAndRender(): Promise<void> {
    try {
      const bootResult = bootGameState({
        readSerializedSave: readMainGameSerializedSave,
        writeSerializedSave: writeMainGameStateSave,
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
      this.idleProductionLoop?.stopLoop();
      console.error('[MainSceneController] boot failed', error);
      this.renderFatalError();
    }
  }

  /**
   * 先渲染稳定的骨架层，确保真实贴图尚未加载时场景也可见。
   * 顶部 HUD 固定在屏幕顶部安全区内，因为当前地图可视范围就是整个屏幕。
   */
  private renderFoundation(): MainSceneVisualNodes {
    const buildResult = this.ensureFoundationView().build({
      onClearSave: this.handleClearSave,
    });
    this.currentViewportMetrics = buildResult.viewportMetrics;
    this.currentLayoutScale = buildResult.viewportMetrics.layoutScale;

    return buildResult.sceneVisualNodes;
  }

  /**
   * 将真实贴图接入当前场景。
   * HUD 面板与地图背景独立加载，单个资源失败不会拖垮整屏。
   */
  private async hydrateSceneArt(
    _gameState: GameState,
    sceneVisualNodes: MainSceneVisualNodes,
  ): Promise<void> {
    await this.ensureFoundationView().attachSceneArt(sceneVisualNodes);
  }

  /**
   * 创建或复用招聘弹窗组件。
   * 控制器只负责提供回调和当前运行态，具体 UI 节点由组件维护。
   */
  private ensureRecruitmentOverlay(sceneVisualNodes: MainSceneVisualNodes): void {
    if (this.isRecruitmentPanelBuilt && this.recruitmentPanelView?.node.isValid) {
      return;
    }

    const viewportMetrics = this.getCurrentViewportMetrics();
    const recruitmentPanelView = this.ensureRecruitmentPanelView(viewportMetrics);
    this.configureSceneLayerNode(
      recruitmentPanelView.node,
      new Vec3(0, 0, 25),
      viewportMetrics.width,
      viewportMetrics.height,
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
    this.isRecruitmentPanelBuilt = true;
    sceneVisualNodes.statusView.showMessage('招聘入口已就绪');
  }

  /**
   * 刷新招聘弹窗视图。
   * 弹窗内部反馈文案由组件自己显示，顶部飘字提示只在明确事件发生时单独触发。
   */
  private refreshRecruitmentOverlay(
    gameState: GameState,
    sceneVisualNodes: MainSceneVisualNodes,
  ): void {
    if (!this.recruitmentPanelView?.node.isValid) {
      this.ensureRecruitmentOverlay(sceneVisualNodes);
    }

    if (!this.recruitmentPanelView?.node.isValid) {
      return;
    }

    this.recruitmentPanelView.refresh({
      gameState,
      isModalVisible: this.isRecruitmentModalVisible,
      formatIdleEnergyValue: (value) => this.formatIdleEnergyValue(value),
    });
  }

  /**
   * 招聘弹窗中暂未开放的按钮统一回到这里更新反馈。
   */
  private readonly handleUnavailableRecruitmentAction = (message: string): void => {
    this.latestRecruitmentFeedback = message;
    if (this.runtimeGameState && this.sceneVisualNodes) {
      this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
    }
    this.sceneVisualNodes?.statusView.showMessage(message);
  };
  private async renderMapSheepSprites(
    gameState: GameState,
    sceneVisualNodes: MainSceneVisualNodes,
  ): Promise<void> {
    const mapSheepLayerView = this.ensureMapSheepLayerView(sceneVisualNodes);
    await mapSheepLayerView.render(gameState, {
      layoutScale: this.currentLayoutScale,
      roamingConfig: GAME_CONFIG.roaming,
      sheepArtAnchor: sceneVisualNodes.sheepArtAnchor,
      showStatusMessage: (message) => sceneVisualNodes.statusView.showMessage(message),
    });
  }

  /**
   * 创建或复用地图羊群表现组件。
   * 主控制器只负责挂载组件节点，具体羊节点和飘字由组件维护。
   */
  private ensureMapSheepLayerView(
    sceneVisualNodes: MainSceneVisualNodes,
  ): MainSceneMapSheepLayerView {
    if (this.mapSheepLayerView?.node.isValid) {
      if (!this.isMapSheepLayerPrepared) {
        const viewportMetrics = this.getCurrentViewportMetrics();
        this.configureSceneLayerNode(
          this.mapSheepLayerView.node,
          new Vec3(0, 0, 5),
          viewportMetrics.width,
          viewportMetrics.height,
        );
        this.syncLayerSiblingIndex(
          this.mapSheepLayerView.node,
          sceneVisualNodes.sheepArtAnchor,
        );
        this.mapSheepLayerView.preloadIdleEnergyFeedbackSpriteFrame();
        this.isMapSheepLayerPrepared = true;
      }
      return this.mapSheepLayerView;
    }

    const viewportMetrics = this.getCurrentViewportMetrics();
    const mapSheepLayer =
      this.findDescendantByName(this.node, MAP_SHEEP_LAYER_NODE_NAME) ??
      this.findDescendantByName(this.node, 'MapSheepLayer') ??
      createLayerNode(
        this.node,
        MAP_SHEEP_LAYER_NODE_NAME,
        new Vec3(0, 0, 5),
        viewportMetrics.width,
        viewportMetrics.height,
      );
    this.configureSceneLayerNode(
      mapSheepLayer,
      new Vec3(0, 0, 5),
      viewportMetrics.width,
      viewportMetrics.height,
    );
    this.syncLayerSiblingIndex(mapSheepLayer, sceneVisualNodes.sheepArtAnchor);

    this.mapSheepLayerView =
      mapSheepLayer.getComponent(MainSceneMapSheepLayerView) ??
      mapSheepLayer.addComponent(MainSceneMapSheepLayerView);
    this.mapSheepLayerView.preloadIdleEnergyFeedbackSpriteFrame();
    this.isMapSheepLayerPrepared = true;

    return this.mapSheepLayerView;
  }

  /**
   * 创建或复用招聘表现组件。
   * 优先使用 `MainScene.scene` 中已经挂载的组件，其次按固定节点名查找，最后才创建兜底节点。
   */
  private ensureRecruitmentPanelView(
    viewportMetrics: MainSceneViewportMetrics,
  ): MainSceneRecruitmentPanelView {
    if (this.recruitmentPanelView?.node.isValid) {
      return this.recruitmentPanelView;
    }

    const recruitmentPanelRoot =
      this.findDescendantByName(this.node, RECRUITMENT_PANEL_NODE_NAME) ??
      this.findDescendantByName(this.node, 'RecruitmentPanelView') ??
      createLayerNode(
        this.node,
        RECRUITMENT_PANEL_NODE_NAME,
        new Vec3(0, 0, 25),
        viewportMetrics.width,
        viewportMetrics.height,
      );
    const recruitmentPanelView =
      recruitmentPanelRoot.getComponent(MainSceneRecruitmentPanelView) ??
      recruitmentPanelRoot.addComponent(MainSceneRecruitmentPanelView);
    this.recruitmentPanelView = recruitmentPanelView;

    return recruitmentPanelView;
  }

  /**
   * 同步场景挂载层的父节点、位置和 UI 尺寸。
   * 运行时只做适配，不改变组件归属，方便继续在 Inspector 里查看和调试。
   */
  private configureSceneLayerNode(
    layerNode: Node,
    position: Vec3,
    width: number,
    height: number,
  ): void {
    if (!layerNode.parent) {
      layerNode.parent = this.node;
    }

    layerNode.setPosition(position);
    const transform =
      layerNode.getComponent(UITransform) ?? layerNode.addComponent(UITransform);
    transform.setContentSize(width, height);
  }

  /**
   * 在当前场景树中按名称递归查找节点。
   * 分层后目标组件可能挂在 `WorldRoot` 或 `ScreenUiRoot` 下，不能再只查直接子节点。
   */
  private findDescendantByName(rootNode: Node, nodeName: string): Node | null {
    if (rootNode.name === nodeName) {
      return rootNode;
    }

    for (const childNode of rootNode.children) {
      const matchedNode = this.findDescendantByName(childNode, nodeName);
      if (matchedNode) {
        return matchedNode;
      }
    }

    return null;
  }

  /**
   * 仅当两个节点同父级时同步层级顺序。
   * 旧场景兜底节点可能仍直接挂在 `ContentRoot` 下，跨父级强设顺序没有意义。
   */
  private syncLayerSiblingIndex(layerNode: Node, anchorNode: Node): void {
    if (layerNode.parent !== anchorNode.parent) {
      return;
    }

    layerNode.setSiblingIndex(anchorNode.getSiblingIndex());
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

    const didClear = clearMainGameStateSave();
    if (!didClear) {
      this.latestRecruitmentFeedback = '清档失败，请检查控制台日志';
      if (this.runtimeGameState) {
        this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
      }
      this.sceneVisualNodes.statusView.showMessage(this.latestRecruitmentFeedback);
      return;
    }

    const bootResult = bootGameState({
      readSerializedSave: readMainGameSerializedSave,
      writeSerializedSave: writeMainGameStateSave,
    });

    this.runtimeGameState = bootResult.gameState;
    setRuntimeGameState(bootResult.gameState);
    this.ensureIdleProductionLoop().resetSettledAt(bootResult.gameState.updatedAt);
    this.isRecruitmentModalVisible = false;
    this.latestRecruitmentFeedback = bootResult.didPersist
      ? '存档已清除，已重建新档'
      : '存档已清除，但新档写回失败';
    this.refreshCoreHud(bootResult.gameState, this.sceneVisualNodes);
    this.refreshRecruitmentOverlay(bootResult.gameState, this.sceneVisualNodes);
    this.sceneVisualNodes.statusView.showMessage(this.latestRecruitmentFeedback);
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
      this.sceneVisualNodes.statusView.showMessage(this.latestRecruitmentFeedback);
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
      this.sceneVisualNodes.statusView.showMessage(this.latestRecruitmentFeedback);
      return;
    }

    this.runtimeGameState = purchaseResult.gameState;
    setRuntimeGameState(purchaseResult.gameState);
    this.refreshCoreHud(purchaseResult.gameState, this.sceneVisualNodes);
    this.latestRecruitmentFeedback =
      `${purchaseResult.purchasedSheep.sheepId} ${GAME_CONFIG.sheepDefinitions[requestedSheepId].displayName} 招聘成功`;
    this.refreshRecruitmentOverlay(purchaseResult.gameState, this.sceneVisualNodes);
    this.sceneVisualNodes.statusView.showMessage(this.latestRecruitmentFeedback);
    void this.renderMapSheepSprites(purchaseResult.gameState, this.sceneVisualNodes);

    this.persistGameState(purchaseResult.gameState, 'recruitment purchase');
  };

  /**
   * 创建或复用自动产出组件。
   * 主控制器只提供状态读写与刷新回调，具体 `schedule/unschedule` 由组件维护。
   */
  private ensureIdleProductionLoop(): MainSceneIdleProductionLoop {
    const existingLoop = this.node.getComponent(MainSceneIdleProductionLoop);
    const idleProductionLoop =
      this.idleProductionLoop?.isValid && this.idleProductionLoop.node.isValid
        ? this.idleProductionLoop
        : existingLoop ?? this.node.addComponent(MainSceneIdleProductionLoop);

    // Inspector 预挂载的组件也必须注入运行时依赖，否则 `startLoop` 会因未配置而跳过。
    idleProductionLoop.configure({
      getGameState: () => this.runtimeGameState,
      sheepDefinitions: GAME_CONFIG.sheepDefinitions,
      persistGameState: writeMainGameStateSave,
      onSettled: this.handleIdleProductionSettled,
      onPersistFailed: this.handleIdleProductionPersistFailed,
    });

    this.idleProductionLoop = idleProductionLoop;
    return idleProductionLoop;
  }

  /**
   * 启动自动产出组件。
   * 控制器不再直接持有定时器细节，只保留主流程里的启动语义。
   */
  private startIdleProductionLoop(): void {
    this.ensureIdleProductionLoop().startLoop();
  }

  /**
   * 自动产出组件完成结算后回到这里同步运行时状态与当前可见表现。
   */
  private readonly handleIdleProductionSettled = (
    result: MainSceneIdleProductionSettleResult,
  ): void => {
    this.runtimeGameState = result.gameState;
    setRuntimeGameState(result.gameState);

    if (!this.sceneVisualNodes) {
      return;
    }

    this.refreshCoreHud(result.gameState, this.sceneVisualNodes);
    this.playVisibleMapSheepIdleProductionFeedback(
      result.gameState,
      result.settledSeconds,
    );
  };

  /**
   * 自动产出存档失败时保持游戏继续运行，只在控制台保留可排查信号。
   */
  private readonly handleIdleProductionPersistFailed = (): void => {
    console.warn('[MainSceneController] idle production tick was not persisted');
  };

  /**
   * 统一写回当前主游戏状态。
   * `context` 只用于日志定位，不参与业务逻辑。
   */
  private persistGameState(gameState: GameState, context: string): void {
    const didPersist = writeMainGameStateSave(gameState);
    if (!didPersist) {
      console.warn(`[MainSceneController] ${context} was not persisted`);
    }
  }

  /**
   * 将业务快照同步到顶部核心 HUD。
   * 左侧展示总资产与 `xx/s` 秒产，左上羊钻面板当前只展示羊钻数。
   */
  private refreshCoreHud(
    gameState: GameState,
    sceneVisualNodes: MainSceneVisualNodes,
  ): void {
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
   * 启动失败时给出稳定可见的错误反馈，避免黑屏。
   */
  private renderFatalError(): void {
    this.ensureFoundationView().renderFatalError();
  }

  /**
   * 创建或复用主场景基础视图组件。
   * 基础视图负责屏幕尺寸、背景、HUD 骨架和启动失败画面。
   */
  private ensureFoundationView(): MainSceneFoundationView {
    if (this.foundationView?.isValid && this.foundationView.node.isValid) {
      return this.foundationView;
    }

    const existingView = this.node.getComponent(MainSceneFoundationView);
    const foundationView = existingView ?? this.node.addComponent(MainSceneFoundationView);
    this.foundationView = foundationView;
    return foundationView;
  }

  /**
   * 获取当前主场景布局尺寸。
   * 其他组件挂载层需要读取这个结果，但尺寸计算本身由基础视图统一维护。
   */
  private getCurrentViewportMetrics(): MainSceneViewportMetrics {
    const viewportMetrics =
      this.currentViewportMetrics ?? this.ensureFoundationView().getViewportMetrics();
    this.currentViewportMetrics = viewportMetrics;
    this.currentLayoutScale = viewportMetrics.layoutScale;
    return viewportMetrics;
  }
}
