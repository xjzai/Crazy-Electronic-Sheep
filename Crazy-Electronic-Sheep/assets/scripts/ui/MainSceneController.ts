import {
  _decorator,
  Camera,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  resources,
  Sprite,
  SpriteFrame,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
  view,
} from 'cc';
import { bootGameState } from '../boot/bootCoordinator';
import { GAME_CONFIG } from '../config/gameConfig';
import {
  createCoreHudSnapshot,
  getMapSheepInstances,
  settleIdleProduction,
  type GameState,
} from '../domain/gameStateSchema';
import { setRuntimeGameState } from '../runtime/runtimeSession';
import { readSerializedSave, writeSerializedSave } from '../storage/localSaveRepository';

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
const IDLE_ENERGY_HUD_SOURCE_WIDTH = 1774;
const IDLE_ENERGY_HUD_SOURCE_HEIGHT = 500;
const SHEEP_DIAMOND_HUD_SOURCE_WIDTH = 1900;
// const SHEEP_DIAMOND_HUD_SOURCE_WIDTH = 2048;
const SHEEP_DIAMOND_HUD_SOURCE_HEIGHT = 682;

/**
 * `resources` 目录中的真实贴图路径，运行时统一按 `spriteFrame` 子资源加载。
 */
const MAP_01_BACKGROUND_RESOURCE = 'map_01/map_01_background/spriteFrame';
const SHEEP_001_RESOURCE = 'sheep/sheep_001/spriteFrame';
const IDLE_ENERGY_HUD_RESOURCE = 'ui/idle_energy_hud_panel/spriteFrame';
const SHEEP_DIAMOND_HUD_RESOURCE = 'ui/sheep_diamond_hud_panel/spriteFrame';
const IDLE_ENERGY_ICON_RESOURCE = 'ui/idle_energy_icon/spriteFrame';

/**
 * 赠送羊与其阴影的显示尺寸。
 * 这里保持小体量，避免在第一图空场景里显得过分拥挤。
 */
const SHEEP_001_DISPLAY_WIDTH = 131;
const SHEEP_001_DISPLAY_HEIGHT = 120;
const SHEEP_001_SHADOW_WIDTH = 95;
const SHEEP_001_SHADOW_HEIGHT = 42;
const SHEEP_001_SHADOW_POSITION_Y = -305;

/**
 * 羊头顶资源飘字使用统一的轻量动效参数。
 * 这里只服务当前已落地的第一图赠送羊，不提前抽象到多羊系统。
 */
const SHEEP_IDLE_ENERGY_FEEDBACK_WIDTH = 210;
const SHEEP_IDLE_ENERGY_FEEDBACK_HEIGHT = 58;
const SHEEP_IDLE_ENERGY_FEEDBACK_START_Y = 114;
const SHEEP_IDLE_ENERGY_FEEDBACK_RISE_DISTANCE = 78;
const SHEEP_IDLE_ENERGY_FEEDBACK_DURATION_SECONDS = 0.9;
const SHEEP_IDLE_ENERGY_FEEDBACK_STAGGER_SECONDS = 0.12;
const SHEEP_IDLE_ENERGY_FEEDBACK_ICON_SIZE = 50;
const SHEEP_IDLE_ENERGY_FEEDBACK_FONT_SIZE = 100;

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
  idleEnergyHudSpriteAnchor: Node;
  highestUnlockedHudSpriteAnchor: Node;
  idleEnergyValueLabel: Label;
  globalIdleEnergyPerSecondValueLabel: Label;
  sheepDiamondValueLabel: Label;
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

/**
 * HUD 面板由贴图层和文字层组成。
 * 文字层必须独立于贴图层，否则后续异步挂图会把文字盖掉。
 */
type HudPanelLayers = {
  root: Node;
  spriteAnchor: Node;
  labelLayer: Node;
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
   * 摸鱼能量小图标会被每秒飘字频繁复用，因此在控制器内缓存加载 Promise。
   * 这样既避免重复读资源，也能在首次失败后允许后续重新尝试。
   */
  private idleEnergyFeedbackSpriteFramePromise: Promise<SpriteFrame> | null = null;

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
      this.preloadIdleEnergyFeedbackSpriteFrame();
      this.startIdleProductionLoop();

      await this.hydrateSceneArt(bootResult.gameState, sceneVisualNodes);
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
    const backgroundDisplayHeight = this.calculateHeightByWidth(
      viewportMetrics.width,
      MAP_01_BACKGROUND_SOURCE_WIDTH,
      MAP_01_BACKGROUND_SOURCE_HEIGHT,
    );
    const mapVisibleHeight = Math.min(backgroundDisplayHeight, viewportMetrics.height);

    /**
     * 两张 HUD 面板必须同时待在屏幕内。
     * 先按期望宽度布局，再基于可用宽度做统一收缩，避免任一侧越界。
     */
    const sidePadding = scaleLayout(16);
    const topPadding = scaleLayout(16);
    const panelGap = scaleLayout(10);
    const targetIdleEnergyHudWidth = scaleLayout(300);
    const targetDiamondHudWidth = scaleLayout(180);
    const availableHudWidth = Math.max(
      1,
      viewportMetrics.width - sidePadding * 2 - panelGap,
    );
    const totalTargetHudWidth = targetIdleEnergyHudWidth + targetDiamondHudWidth;
    const hudFitScale = Math.min(1, availableHudWidth / totalTargetHudWidth);
    const idleEnergyHudWidth = Math.round(targetIdleEnergyHudWidth * hudFitScale);
    const diamondHudWidth = Math.round(targetDiamondHudWidth * hudFitScale);
    const idleEnergyHudHeight = this.calculateHeightByWidth(
      idleEnergyHudWidth,
      IDLE_ENERGY_HUD_SOURCE_WIDTH,
      IDLE_ENERGY_HUD_SOURCE_HEIGHT,
    );
    const diamondHudHeight = this.calculateHeightByWidth(
      diamondHudWidth,
      SHEEP_DIAMOND_HUD_SOURCE_WIDTH,
      SHEEP_DIAMOND_HUD_SOURCE_HEIGHT,
    );
    const scaledHudGap = Math.round(panelGap * hudFitScale);
    const diamondHudX =
      -Math.round(viewportMetrics.width / 2) + sidePadding + Math.round(diamondHudWidth / 2);
    const diamondHudY =
      Math.round(mapVisibleHeight / 2) - topPadding - Math.round(diamondHudHeight / 2);
    const idleEnergyHudX =
      diamondHudX +
      Math.round(diamondHudWidth / 2) +
      scaledHudGap +
      Math.round(idleEnergyHudWidth / 2);
    const idleEnergyHudY = diamondHudY;
    const hudTextScale = Math.max(0.72, hudFitScale);

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
     * 左侧面板使用新透明底 UI。
     * 黄色区域展示总资产，绿色区域展示 `xx/s` 秒产。
     */
    const idleEnergyHud = this.createHudPanelLayers(
      this.node,
      'IdleEnergyHud',
      new Vec3(idleEnergyHudX, idleEnergyHudY, 0),
      idleEnergyHudWidth,
      idleEnergyHudHeight,
    );
    const idleEnergyValueLabel = this.createLabel(
      idleEnergyHud.labelLayer,
      'IdleEnergyValueLabel',
      '0',
      Math.max(26, Math.round(scaleLayout(40) * hudTextScale)),
      Math.round(idleEnergyHudWidth * 0.46),
      Math.round(idleEnergyHudHeight * 0.46),
      new Vec3(
        Math.round(idleEnergyHudWidth * 0.10),
        Math.round(idleEnergyHudHeight * 0.14),
        0,
      ),
      new Color(83, 57, 35, 255),
      Label.HorizontalAlign.CENTER,
      true,
    );
    const globalIdleEnergyPerSecondValueLabel = this.createLabel(
      idleEnergyHud.labelLayer,
      'GlobalIdleEnergyPerSecondValueLabel',
      '0/s',
      Math.max(16, Math.round(scaleLayout(22) * hudTextScale)),
      Math.round(idleEnergyHudWidth * 0.38),
      Math.round(idleEnergyHudHeight * 0.30),
      new Vec3(
        Math.round(idleEnergyHudWidth * 0.10),
        Math.round(idleEnergyHudHeight * -0.23),
        0,
      ),
      new Color(247, 251, 239, 255),
      Label.HorizontalAlign.CENTER,
      true,
    );

    /**
     * 左上角面板当前只显示羊钻数。
     * 真实羊钻系统尚未接入，所以这里先稳定显示 `0`。
     */
    const highestUnlockedHud = this.createHudPanelLayers(
      this.node,
      'HighestUnlockedHud',
      new Vec3(diamondHudX, diamondHudY, 0),
      diamondHudWidth,
      diamondHudHeight,
    );
    const sheepDiamondValueLabel = this.createLabel(
      highestUnlockedHud.labelLayer,
      'SheepDiamondValueLabel',
      '0',
      Math.max(24, Math.round(scaleLayout(36) * hudTextScale)),
      Math.round(diamondHudWidth * 0.38),
      Math.round(diamondHudHeight * 0.53),
      new Vec3(
        Math.round(diamondHudWidth * 0.18),
        Math.round(diamondHudHeight * 0.00),
        0,
      ),
      new Color(95, 70, 110, 255),
      Label.HorizontalAlign.CENTER,
      true,
    );

    /**
     * 羊影子改为真正椭圆，避免在浅色草地上看起来像一条硬条带。
     */
    this.createEllipse(
      this.node,
      'SheepShadow',
      new Vec3(0, scaleLayout(SHEEP_001_SHADOW_POSITION_Y), 0),
      scaleLayout(SHEEP_001_SHADOW_WIDTH),
      scaleLayout(SHEEP_001_SHADOW_HEIGHT),
      new Color(0, 0, 0, 82),
      new Color(0, 0, 0, 0),
      0,
    );

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

    return {
      backgroundArtLayer,
      sheepArtAnchor,
      sheepStatusLabel,
      idleEnergyHudSpriteAnchor: idleEnergyHud.spriteAnchor,
      highestUnlockedHudSpriteAnchor: highestUnlockedHud.spriteAnchor,
      idleEnergyValueLabel,
      globalIdleEnergyPerSecondValueLabel,
      sheepDiamondValueLabel,
    };
  }

  /**
   * 将真实贴图接入当前场景。
   * HUD 面板、地图背景、赠送羊贴图彼此独立，单个资源失败不会拖垮整屏。
   */
  private async hydrateSceneArt(
    gameState: GameState,
    sceneVisualNodes: SceneVisualNodes,
  ): Promise<void> {
    await this.attachBackgroundSprite(sceneVisualNodes.backgroundArtLayer);
    await Promise.all([
      this.attachHudPanelSprite(
        sceneVisualNodes.idleEnergyHudSpriteAnchor,
        IDLE_ENERGY_HUD_RESOURCE,
        'IdleEnergyHudSprite',
      ),
      this.attachHudPanelSprite(
        sceneVisualNodes.highestUnlockedHudSpriteAnchor,
        SHEEP_DIAMOND_HUD_RESOURCE,
        'HighestUnlockedHudSprite',
      ),
    ]);

    const giftedSheepInstance = getMapSheepInstances(gameState, 'map_01').find(
      (sheepInstance) => sheepInstance.sheepId === '001',
    );

    if (!giftedSheepInstance) {
      sceneVisualNodes.sheepStatusLabel.string =
        'map_01 当前没有 001 羊实例，无法展示真实羊素材。';
      return;
    }

    await this.attachGiftedSheepSprite(
      sceneVisualNodes.sheepArtAnchor,
      sceneVisualNodes.sheepStatusLabel,
    );
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
   * 将赠送的 `001` 羊贴图挂到地图中，并同步更新状态条文案。
   */
  private async attachGiftedSheepSprite(
    sheepArtAnchor: Node,
    sheepStatusLabel: Label,
  ): Promise<void> {
    try {
      const spriteFrame = await this.loadSpriteFrame(SHEEP_001_RESOURCE);
      this.createSpriteNode(
        sheepArtAnchor,
        'GiftedSheepSprite',
        spriteFrame,
        new Vec3(0, 0, 0),
        SHEEP_001_DISPLAY_WIDTH,
        SHEEP_001_DISPLAY_HEIGHT,
      );
      sheepStatusLabel.string = `001 实习羊 · 自动产出 +${this.formatIdleEnergyValue(
        GAME_CONFIG.sheepDefinitions['001'].idleEnergyPerSecond,
      )}/秒`;
    } catch (error) {
      console.error('[MainSceneController] sheep_001 load failed', error);
      sheepStatusLabel.string = '001 羊素材加载失败，请检查 resources 路径。';
    }
  }

  /**
   * 将透明底 HUD 面板挂进对应锚点。
   * 贴图加载失败时保留文字层，至少保证资源数字仍然可读。
   */
  private async attachHudPanelSprite(
    spriteAnchor: Node,
    resourcePath: string,
    spriteNodeName: string,
  ): Promise<void> {
    try {
      const spriteFrame = await this.loadSpriteFrame(resourcePath);
      const spriteTransform = spriteAnchor.getComponent(UITransform);
      const spriteWidth = spriteTransform?.contentSize.width ?? 0;
      const spriteHeight = spriteTransform?.contentSize.height ?? 0;
      this.createSpriteNode(
        spriteAnchor,
        spriteNodeName,
        spriteFrame,
        new Vec3(0, 0, 0),
        spriteWidth,
        spriteHeight,
      );
    } catch (error) {
      console.error(`[MainSceneController] hud panel load failed: ${resourcePath}`, error);
    }
  }

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
    this.playGiftedSheepIdleProductionFeedback(nextGameState, settledSeconds);

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
    sceneVisualNodes.idleEnergyValueLabel.string = this.formatIdleEnergyValue(
      hudSnapshot.idleEnergy,
    );
    sceneVisualNodes.globalIdleEnergyPerSecondValueLabel.string = `${this.formatIdleEnergyValue(
      hudSnapshot.globalIdleEnergyPerSecond,
    )}/s`;
    sceneVisualNodes.sheepDiamondValueLabel.string = '0';
  }

  /**
   * 提前加载摸鱼能量图标，避免首次自动产出时再阻塞飘字创建。
   * 资源加载失败时只打日志，不影响核心秒产与 HUD 刷新。
   */
  private preloadIdleEnergyFeedbackSpriteFrame(): void {
    void this.loadIdleEnergyFeedbackSpriteFrame().catch((error) => {
      console.error('[MainSceneController] idle energy feedback icon load failed', error);
    });
  }

  /**
   * 当前场景只落地了赠送羊的真实表现，因此秒产飘字先只挂在这只羊头上。
   * 正常运行时这里会严格每秒弹一次；如果前台卡顿补帧过多，则压缩成一次汇总提示，避免爆屏。
   */
  private playGiftedSheepIdleProductionFeedback(
    gameState: GameState,
    settledSeconds: number,
  ): void {
    if (!this.sceneVisualNodes || settledSeconds <= 0 || gameState.currentMapId !== 'map_01') {
      return;
    }

    const displayedSheepInstance = getMapSheepInstances(gameState, 'map_01')[0];
    if (!displayedSheepInstance) {
      return;
    }

    const sheepDefinition = GAME_CONFIG.sheepDefinitions[displayedSheepInstance.sheepId];
    if (!sheepDefinition || sheepDefinition.idleEnergyPerSecond <= 0) {
      return;
    }

    const showCompressedFeedback = settledSeconds > 5;
    if (showCompressedFeedback) {
      void this.spawnIdleEnergyFeedback(
        this.sceneVisualNodes.sheepArtAnchor,
        sheepDefinition.idleEnergyPerSecond * settledSeconds,
      );
      return;
    }

    for (let secondIndex = 0; secondIndex < settledSeconds; secondIndex += 1) {
      this.scheduleOnce(() => {
        if (!this.sceneVisualNodes) {
          return;
        }

        void this.spawnIdleEnergyFeedback(
          this.sceneVisualNodes.sheepArtAnchor,
          sheepDefinition.idleEnergyPerSecond,
        );
      }, secondIndex * SHEEP_IDLE_ENERGY_FEEDBACK_STAGGER_SECONDS);
    }
  }

  /**
   * 创建一次“图标 + +x 数字”的轻量飘字。
   * 动画只做上浮和淡出，避免盖过主 HUD 的阅读优先级。
   */
  private async spawnIdleEnergyFeedback(
    sheepArtAnchor: Node,
    producedIdleEnergy: number,
  ): Promise<void> {
    if (!sheepArtAnchor?.isValid || producedIdleEnergy <= 0) {
      return;
    }

    try {
      const spriteFrame = await this.loadIdleEnergyFeedbackSpriteFrame();
      if (!sheepArtAnchor.isValid) {
        return;
      }

      const startPosition = new Vec3(0, SHEEP_IDLE_ENERGY_FEEDBACK_START_Y, 0);
      const endPosition = new Vec3(
        0,
        SHEEP_IDLE_ENERGY_FEEDBACK_START_Y + SHEEP_IDLE_ENERGY_FEEDBACK_RISE_DISTANCE,
        0,
      );
      const feedbackRoot = this.createLayerNode(
        sheepArtAnchor,
        `IdleEnergyFeedback-${Date.now()}`,
        startPosition,
        SHEEP_IDLE_ENERGY_FEEDBACK_WIDTH,
        SHEEP_IDLE_ENERGY_FEEDBACK_HEIGHT,
      );
      feedbackRoot.setSiblingIndex(99);

      const opacity = feedbackRoot.addComponent(UIOpacity);
      opacity.opacity = 255;

      this.createSpriteNode(
        feedbackRoot,
        'IdleEnergyFeedbackIcon',
        spriteFrame,
        new Vec3(-56, 0, 0),
        SHEEP_IDLE_ENERGY_FEEDBACK_ICON_SIZE,
        SHEEP_IDLE_ENERGY_FEEDBACK_ICON_SIZE,
      );
      this.createLabel(
        feedbackRoot,
        'IdleEnergyFeedbackValue',
        `+${this.formatIdleEnergyValue(producedIdleEnergy)}`,
        SHEEP_IDLE_ENERGY_FEEDBACK_FONT_SIZE,
        138,
        SHEEP_IDLE_ENERGY_FEEDBACK_HEIGHT,
        new Vec3(50, 0, 0),
        new Color(255, 243, 142, 255),
        Label.HorizontalAlign.LEFT,
        true,
      );

      tween(feedbackRoot)
        .to(
          SHEEP_IDLE_ENERGY_FEEDBACK_DURATION_SECONDS,
          { position: endPosition },
          { easing: 'sineOut' },
        )
        .call(() => {
          if (feedbackRoot.isValid) {
            feedbackRoot.destroy();
          }
        })
        .start();

      tween(opacity)
        .delay(0.08)
        .to(
          SHEEP_IDLE_ENERGY_FEEDBACK_DURATION_SECONDS - 0.08,
          { opacity: 0 },
          { easing: 'quadOut' },
        )
        .start();
    } catch (error) {
      console.error('[MainSceneController] idle energy feedback spawn failed', error);
    }
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
   * 摸鱼能量图标属于高频复用资源，单独做 Promise 缓存。
   * 失败时会清空缓存，便于后续 tick 再次尝试加载。
   */
  private loadIdleEnergyFeedbackSpriteFrame(): Promise<SpriteFrame> {
    if (!this.idleEnergyFeedbackSpriteFramePromise) {
      this.idleEnergyFeedbackSpriteFramePromise = this.loadSpriteFrame(
        IDLE_ENERGY_ICON_RESOURCE,
      ).catch((error) => {
        this.idleEnergyFeedbackSpriteFramePromise = null;
        throw error;
      });
    }

    return this.idleEnergyFeedbackSpriteFramePromise;
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
    const node = new Node(name);
    node.parent = parent;
    node.setPosition(position);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    return node;
  }

  /**
   * 创建 HUD 面板的根节点、贴图层和文字层。
   * 贴图层永远放在底部，文字层永远放在上面。
   */
  private createHudPanelLayers(
    parent: Node,
    name: string,
    position: Vec3,
    width: number,
    height: number,
  ): HudPanelLayers {
    const root = this.createLayerNode(parent, name, position, width, height);
    const spriteAnchor = this.createLayerNode(
      root,
      `${name}SpriteAnchor`,
      new Vec3(0, 0, 0),
      width,
      height,
    );
    const labelLayer = this.createLayerNode(
      root,
      `${name}LabelLayer`,
      new Vec3(0, 0, 0),
      width,
      height,
    );
    labelLayer.setSiblingIndex(1);

    return {
      root,
      spriteAnchor,
      labelLayer,
    };
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
    const node = new Node(name);
    node.parent = parent;
    node.setPosition(position);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = spriteFrame;

    return sprite;
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
    const node = new Node(name);
    node.parent = parent;
    node.setPosition(position);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fillColor;
    graphics.strokeColor = strokeColor;
    graphics.lineWidth = 4;
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.stroke();

    return node;
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
    const node = new Node(name);
    node.parent = parent;
    node.setPosition(position);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 10;
    label.color = color;
    label.enableWrapText = true;
    label.overflow = Label.Overflow.SHRINK;
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.isBold = isBold;

    return label;
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
    const node = new Node(name);
    node.parent = parent;
    node.setPosition(position);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fillColor;
    graphics.strokeColor = strokeColor;
    graphics.lineWidth = lineWidth;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (lineWidth > 0) {
      graphics.stroke();
    }

    return node;
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
    const node = new Node(name);
    node.parent = parent;
    node.setPosition(position);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fillColor;
    graphics.strokeColor = strokeColor;
    graphics.lineWidth = lineWidth;
    graphics.ellipse(0, 0, width / 2, height / 2);
    graphics.fill();
    if (lineWidth > 0) {
      graphics.stroke();
    }

    return node;
  }
}
