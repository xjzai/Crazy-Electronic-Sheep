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
  buySheepOnCurrentMap,
  createCoreHudSnapshot,
  getMapSheepInstances,
  settleIdleProduction,
  type BuyCurrentMapSheepFailureReason,
  type GameState,
  type SheepPosition,
} from '../domain/gameStateSchema';
import { setRuntimeGameState } from '../runtime/runtimeSession';
import {
  clearSerializedSave,
  readSerializedSave,
  writeSerializedSave,
} from '../storage/localSaveRepository';

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
const RECRUITMENT_MAIN_BUTTON_RESOURCE = 'ui/recruitment/recruitment_main_button/spriteFrame';
const RECRUITMENT_MODAL_FRAME_RESOURCE = 'ui/recruitment/recruitment_modal_frame/spriteFrame';
const RECRUITMENT_MODAL_TITLE_RESOURCE = 'ui/recruitment/recruitment_modal_title/spriteFrame';
const RECRUITMENT_CLOSE_BUTTON_RESOURCE = 'ui/recruitment/recruitment_close_button/spriteFrame';
const RECRUITMENT_LIST_ITEM_RESOURCE = 'ui/recruitment/recruitment_list_item/spriteFrame';
const RECRUITMENT_PURCHASE_BUTTON_RESOURCE =
  'ui/recruitment/recruitment_purchase_button/spriteFrame';
const RECRUITMENT_PAGE_INDICATOR_RESOURCE =
  'ui/recruitment/recruitment_page_indicator/spriteFrame';
const RECRUITMENT_PAGE_PREV_RESOURCE = 'ui/recruitment/recruitment_page_prev/spriteFrame';
const RECRUITMENT_PAGE_NEXT_RESOURCE = 'ui/recruitment/recruitment_page_next/spriteFrame';
const RECRUITMENT_SHEEP_001_CARD_RESOURCE = 'sheep/recruitment/sheep_001_card/spriteFrame';
const RECRUITMENT_SHEEP_003_CARD_RESOURCE = 'sheep/recruitment/sheep_003_card/spriteFrame';
const RECRUITMENT_SHEEP_007_CARD_RESOURCE = 'sheep/recruitment/sheep_007_card/spriteFrame';

/**
 * 赠送羊与其阴影的显示尺寸。
 * 这里保持小体量，避免在第一图空场景里显得过分拥挤。
 */
const SHEEP_001_DISPLAY_WIDTH = 131;
const SHEEP_001_DISPLAY_HEIGHT = 120;
const SHEEP_001_SHADOW_WIDTH = 120;
const SHEEP_001_SHADOW_HEIGHT = 42;
const SHEEP_001_SHADOW_POSITION_Y = -320;
const SHEEP_001_SHADOW_OFFSET_Y = -50;
const RECRUITMENT_MAIN_BUTTON_SOURCE_WIDTH = 806;
const RECRUITMENT_MAIN_BUTTON_SOURCE_HEIGHT = 850;
const RECRUITMENT_MODAL_FRAME_SOURCE_WIDTH = 1086;
const RECRUITMENT_MODAL_FRAME_SOURCE_HEIGHT = 1448;
const RECRUITMENT_LIST_ITEM_SOURCE_WIDTH = 1329;
const RECRUITMENT_LIST_ITEM_SOURCE_HEIGHT = 617;
const RECRUITMENT_PURCHASE_BUTTON_SOURCE_WIDTH = 1339;
const RECRUITMENT_PURCHASE_BUTTON_SOURCE_HEIGHT = 467;
const RECRUITMENT_CLOSE_BUTTON_SOURCE_WIDTH = 705;
const RECRUITMENT_CLOSE_BUTTON_SOURCE_HEIGHT = 726;
const RECRUITMENT_PAGE_PREV_SOURCE_WIDTH = 523;
const RECRUITMENT_PAGE_PREV_SOURCE_HEIGHT = 847;
const RECRUITMENT_PAGE_NEXT_SOURCE_WIDTH = 453;
const RECRUITMENT_PAGE_NEXT_SOURCE_HEIGHT = 833;
const RECRUITMENT_PAGE_INDICATOR_SOURCE_WIDTH = 2048;
const RECRUITMENT_PAGE_INDICATOR_SOURCE_HEIGHT = 512;
const RECRUITMENT_SHEEP_001_CARD_SOURCE_WIDTH = 949;
const RECRUITMENT_SHEEP_001_CARD_SOURCE_HEIGHT = 869;
const RECRUITMENT_SHEEP_003_CARD_SOURCE_WIDTH = 1122;
const RECRUITMENT_SHEEP_003_CARD_SOURCE_HEIGHT = 1402;
const RECRUITMENT_SHEEP_007_CARD_SOURCE_WIDTH = 941;
const RECRUITMENT_SHEEP_007_CARD_SOURCE_HEIGHT = 1672;
const SECONDARY_RECRUITMENT_PREVIEW_SHEEP_ID = '007';

/**
 * 羊头顶资源飘字使用统一的轻量动效参数。
 * 当前会复用到第一图里所有已经渲染出来的羊节点上。
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
   * 当前地图羊贴图也会在购买成功后反复复用，缓存起来避免每次重绘都重复加载。
   */
  private sheep001SpriteFramePromise: Promise<SpriteFrame> | null = null;

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
  private mapSheepLayer: Node | null = null;
  private recruitmentModalRoot: Node | null = null;
  private recruitmentSheepNameLabel: Label | null = null;
  private recruitmentIdleProductionLabel: Label | null = null;
  private recruitmentPriceLabel: Label | null = null;
  private recruitmentCapacityLabel: Label | null = null;
  private recruitmentFeedbackLabel: Label | null = null;
  private recruitmentPurchaseButtonLabel: Label | null = null;
  private recruitmentPrimaryCardArtAnchor: Node | null = null;
  private recruitmentSecondarySheepNameLabel: Label | null = null;
  private recruitmentSecondaryIdleProductionLabel: Label | null = null;
  private recruitmentSecondaryPriceLabel: Label | null = null;
  private recruitmentSecondaryPurchaseButtonLabel: Label | null = null;
  private recruitmentSecondaryCardArtAnchor: Node | null = null;
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
      this.preloadIdleEnergyFeedbackSpriteFrame();
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
     * 羊影子改为真正椭圆，避免在浅色草地上看起来像一条硬条带。已经没用
     */
    // this.createEllipse(
    //   this.node,
    //   'SheepShadow',
    //   new Vec3(0, scaleLayout(SHEEP_001_SHADOW_POSITION_Y), 0),
    //   scaleLayout(SHEEP_001_SHADOW_WIDTH),
    //   scaleLayout(SHEEP_001_SHADOW_HEIGHT),
    //   new Color(0, 0, 0, 82),
    //   new Color(0, 0, 0, 0),
    //   0,
    // );

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
      idleEnergyHudSpriteAnchor: idleEnergyHud.spriteAnchor,
      highestUnlockedHudSpriteAnchor: highestUnlockedHud.spriteAnchor,
      idleEnergyValueLabel,
      globalIdleEnergyPerSecondValueLabel,
      sheepDiamondValueLabel,
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
  private ensureRecruitmentOverlay(sceneVisualNodes: SceneVisualNodes): void {
    if (this.recruitmentModalRoot?.isValid) {
      return;
    }

    const viewportMetrics = this.getViewportMetrics();
    const scaleLayout = this.createLayoutScaler(this.currentLayoutScale);
    const recruitButtonWidth = Math.min(
      scaleLayout(170),
      Math.round(viewportMetrics.width * 0.24),
    );
    const recruitButtonHeight = this.calculateHeightByWidth(
      recruitButtonWidth,
      RECRUITMENT_MAIN_BUTTON_SOURCE_WIDTH,
      RECRUITMENT_MAIN_BUTTON_SOURCE_HEIGHT,
    );
    const recruitButtonX =
      Math.round(viewportMetrics.width / 2) - scaleLayout(18) - Math.round(recruitButtonWidth / 2);
    const recruitButtonY = Math.max(
      -Math.round(viewportMetrics.height / 2) +
        Math.round(recruitButtonHeight / 2) +
        scaleLayout(36),
      -Math.round(viewportMetrics.height * 0.24),
    );
    const recruitButtonRoot = this.createLayerNode(
      this.node,
      'RecruitButton',
      new Vec3(recruitButtonX, recruitButtonY, 20),
      recruitButtonWidth,
      recruitButtonHeight,
    );
    this.attachSpriteByResource(
      recruitButtonRoot,
      'RecruitButtonSprite',
      RECRUITMENT_MAIN_BUTTON_RESOURCE,
      new Vec3(0, 0, 0),
      recruitButtonWidth,
      recruitButtonHeight,
    );
    recruitButtonRoot.on(Node.EventType.TOUCH_END, this.toggleRecruitmentModal, this);

    const modalScale = Math.min(
      (viewportMetrics.width - scaleLayout(56)) / RECRUITMENT_MODAL_FRAME_SOURCE_WIDTH,
      (viewportMetrics.height - scaleLayout(150)) / RECRUITMENT_MODAL_FRAME_SOURCE_HEIGHT,
    );
    const modalWidth = Math.round(RECRUITMENT_MODAL_FRAME_SOURCE_WIDTH * modalScale);
    const modalHeight = Math.round(RECRUITMENT_MODAL_FRAME_SOURCE_HEIGHT * modalScale);
    const modalRoot = this.createLayerNode(
      this.node,
      'RecruitmentModalRoot',
      new Vec3(0, 0, 30),
      viewportMetrics.width,
      viewportMetrics.height,
    );
    modalRoot.active = false;
    modalRoot.on(Node.EventType.TOUCH_END, (event) => {
      event.propagationStopped = true;
    });

    const modalMask = this.createRect(
      modalRoot,
      'RecruitmentModalMask',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      viewportMetrics.height,
      new Color(12, 18, 18, 190),
      new Color(12, 18, 18, 0),
    );
    modalMask.on(Node.EventType.TOUCH_END, this.toggleRecruitmentModal, this);

    const recruitmentPanel = this.createLayerNode(
      modalRoot,
      'RecruitmentPanel',
      new Vec3(0, scaleLayout(-18), 1),
      modalWidth,
      modalHeight,
    );
    recruitmentPanel.on(Node.EventType.TOUCH_END, (event) => {
      event.propagationStopped = true;
    });
    this.attachSpriteByResource(
      recruitmentPanel,
      'RecruitmentPanelFrame',
      RECRUITMENT_MODAL_FRAME_RESOURCE,
      new Vec3(0, 0, 0),
      modalWidth,
      modalHeight,
    );

    const titleWidth = Math.round(modalWidth * 0.65);
    const titleHeight = this.calculateHeightByWidth(titleWidth, 2048, 640);
    this.attachSpriteByResource(
      recruitmentPanel,
      'RecruitmentTitleSprite',
      RECRUITMENT_MODAL_TITLE_RESOURCE,
      new Vec3(-10, Math.round(modalHeight / 2) - Math.round(modalHeight * 0.061), 2),
      titleWidth,
      titleHeight,
      1,
    );

    const closeButtonWidth = Math.round(modalWidth * 0.15);
    const closeButtonHeight = this.calculateHeightByWidth(
      closeButtonWidth,
      RECRUITMENT_CLOSE_BUTTON_SOURCE_WIDTH,
      RECRUITMENT_CLOSE_BUTTON_SOURCE_HEIGHT,
    );
    const closeButtonRoot = this.createLayerNode(
      recruitmentPanel,
      'RecruitmentCloseButton',
      new Vec3(
        Math.round(modalWidth / 2) - Math.round(closeButtonWidth * 0.53),
        Math.round(modalHeight / 2) - Math.round(modalHeight * 0.07),
        2,
      ),
      closeButtonWidth,
      closeButtonHeight,
    );
    this.attachSpriteByResource(
      closeButtonRoot,
      'RecruitmentCloseButtonSprite',
      RECRUITMENT_CLOSE_BUTTON_RESOURCE,
      new Vec3(0, 0, 0),
      closeButtonWidth,
      closeButtonHeight,
    );
    closeButtonRoot.on(Node.EventType.TOUCH_END, this.toggleRecruitmentModal, this);

    const cardWidth = Math.round(modalWidth * 0.82);
    const cardHeight = this.calculateHeightByWidth(
      cardWidth,
      RECRUITMENT_LIST_ITEM_SOURCE_WIDTH,
      RECRUITMENT_LIST_ITEM_SOURCE_HEIGHT,
    );
    const primaryCardY = Math.round(modalHeight * 0.17);
    const secondaryCardY = -Math.round(modalHeight * 0.20);
    const artAnchorWidth = Math.round(cardWidth * 0.26);
    const artAnchorHeight = Math.round(cardHeight * 0.74);
    const purchaseButtonWidth = Math.round(cardWidth * 0.50);
    const purchaseButtonHeight = this.calculateHeightByWidth(
      purchaseButtonWidth,
      RECRUITMENT_PURCHASE_BUTTON_SOURCE_WIDTH,
      RECRUITMENT_PURCHASE_BUTTON_SOURCE_HEIGHT,
    );
    const purchaseButtonIconSize = Math.round(purchaseButtonHeight * 0.8);

    /**
     * 两张招聘卡必须共用同一套结构和排版比例，
     * 这样第一张调完后，第二张会自然跟上，不再出现“上面改了、下面没改”的分叉。
     */
    const createRecruitmentCard = (
      cardNodeName: string,
      cardY: number,
      artNodeName: string,
      previewSheepId: string,
      buttonOpacity: number,
      onTouchEnd: () => void,
    ): {
      artAnchor: Node;
      sheepNameLabel: Label;
      idleProductionLabel: Label;
      priceLabel: Label;
      purchaseButtonLabel: Label;
    } => {
      const cardRoot = this.createLayerNode(
        recruitmentPanel,
        cardNodeName,
        new Vec3(0, cardY, 2),
        cardWidth,
        cardHeight,
      );
      this.attachSpriteByResource(
        cardRoot,
        `${cardNodeName}Sprite`,
        RECRUITMENT_LIST_ITEM_RESOURCE,
        new Vec3(0, 0, 0),
        cardWidth,
        cardHeight,
      );

      const artAnchor = this.createLayerNode(
        cardRoot,
        `${cardNodeName}ArtAnchor`,
        new Vec3(-Math.round(cardWidth * 0.24), 0, 1),
        artAnchorWidth,
        artAnchorHeight,
      );
      const artDefinition = this.getRecruitmentCardArtResource(previewSheepId);
      this.attachRecruitmentCardArt(
        artAnchor,
        artNodeName,
        artDefinition.resourcePath,
        artDefinition.sourceWidth,
        artDefinition.sourceHeight,
        artAnchorWidth,
        artAnchorHeight,
      );

      const sheepNameLabel = this.createLabel(
        cardRoot,
        `${cardNodeName}SheepNameLabel`,
        `${previewSheepId} 预览羊`,
        Math.max(18, Math.round(cardHeight * 1)),
        Math.round(cardWidth * 0.5),
        Math.round(cardHeight * 0.15),
        new Vec3(Math.round(cardWidth * 0.25), Math.round(cardHeight * 0.3), 1),
        new Color(72, 102, 33, 255),
        Label.HorizontalAlign.LEFT,
        true,
      );
      this.attachSpriteByResource(
        cardRoot,
        `${cardNodeName}IdleIcon`,
        IDLE_ENERGY_ICON_RESOURCE,
        new Vec3(Math.round(cardWidth * 0.10), Math.round(cardHeight * 0.1), 1),
        Math.round(cardHeight * 0.15),
        Math.round(cardHeight * 0.15),
        1,
      );
      const idleProductionLabel = this.createLabel(
        cardRoot,
        `${cardNodeName}IdleProductionLabel`,
        '+1/秒',
        Math.max(16, Math.round(cardHeight * 1)),
        Math.round(cardWidth * 0.24),
        Math.round(cardHeight * 0.10),
        new Vec3(Math.round(cardWidth * 0.27), Math.round(cardHeight * 0.1), 1),
        new Color(132, 112, 42, 255),
        Label.HorizontalAlign.LEFT,
        true,
      );
      const priceLabel = this.createLabel(
        cardRoot,
        `${cardNodeName}PriceLabel`,
        '消耗 10',
        Math.max(14, Math.round(cardHeight * 0.08)),
        Math.round(cardWidth * 0.36),
        Math.round(cardHeight * 0.10),
        new Vec3(Math.round(cardWidth * 0.16), -Math.round(cardHeight * 0.20), 1),
        new Color(112, 93, 44, 255),
        Label.HorizontalAlign.LEFT,
        true,
      );

      const purchaseButtonRoot = this.createLayerNode(
        cardRoot,
        `${cardNodeName}PurchaseButton`,
        new Vec3(
          Math.round(cardWidth * 0.20),
          -Math.round(cardHeight * 0.22),
          1,
        ),
        purchaseButtonWidth,
        purchaseButtonHeight,
      );
      this.attachSpriteByResource(
        purchaseButtonRoot,
        `${cardNodeName}PurchaseButtonSprite`,
        RECRUITMENT_PURCHASE_BUTTON_RESOURCE,
        new Vec3(0, 0, 0),
        purchaseButtonWidth,
        purchaseButtonHeight,
      );
      if (buttonOpacity < 255) {
        purchaseButtonRoot.addComponent(UIOpacity).opacity = buttonOpacity;
      }
      this.attachSpriteByResource(
        purchaseButtonRoot,
        `${cardNodeName}PurchaseButtonIcon`,
        IDLE_ENERGY_ICON_RESOURCE,
        new Vec3(-Math.round(purchaseButtonWidth * 0.33), 6, 1),
        purchaseButtonIconSize,
        purchaseButtonIconSize,
        1,
      );
      const purchaseButtonLabel = this.createLabel(
        purchaseButtonRoot,
        `${cardNodeName}PurchaseButtonLabel`,
        '购买 10',
        Math.max(16, Math.round(purchaseButtonHeight * 0.35)),
        Math.round(purchaseButtonWidth * 0.68),
        Math.round(purchaseButtonHeight * 0.52),
        new Vec3(Math.round(purchaseButtonWidth * 0.2), 3, 1),
        new Color(255, 251, 232, 255),
        Label.HorizontalAlign.LEFT,
        true,
      );
      purchaseButtonRoot.on(Node.EventType.TOUCH_END, onTouchEnd);

      return {
        artAnchor,
        sheepNameLabel,
        idleProductionLabel,
        priceLabel,
        purchaseButtonLabel,
      };
    };

    const primaryCardControls = createRecruitmentCard(
      'RecruitmentPrimaryCard',
      primaryCardY,
      'RecruitmentPrimaryCardArt',
      '001',
      255,
      this.handleRecruitmentPurchase,
    );
    this.recruitmentPrimaryCardArtAnchor = primaryCardControls.artAnchor;
    this.recruitmentSheepNameLabel = primaryCardControls.sheepNameLabel;
    this.recruitmentIdleProductionLabel = primaryCardControls.idleProductionLabel;
    this.recruitmentPriceLabel = primaryCardControls.priceLabel;
    this.recruitmentPurchaseButtonLabel = primaryCardControls.purchaseButtonLabel;

    const secondaryCardControls = createRecruitmentCard(
      'RecruitmentSecondaryCard',
      secondaryCardY,
      'RecruitmentSecondaryCardArt',
      SECONDARY_RECRUITMENT_PREVIEW_SHEEP_ID,
      190,
      () => {
        this.latestRecruitmentFeedback = '当前版本仅开放第一档招聘';
        if (this.runtimeGameState && this.sceneVisualNodes) {
          this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
        }
      },
    );
    this.recruitmentSecondaryCardArtAnchor = secondaryCardControls.artAnchor;
    this.recruitmentSecondarySheepNameLabel = secondaryCardControls.sheepNameLabel;
    this.recruitmentSecondaryIdleProductionLabel =
      secondaryCardControls.idleProductionLabel;
    this.recruitmentSecondaryPriceLabel = secondaryCardControls.priceLabel;
    this.recruitmentSecondaryPurchaseButtonLabel =
      secondaryCardControls.purchaseButtonLabel;

    const pageButtonY = Math.round((primaryCardY + secondaryCardY) / 2);
    const pageButtonWidth = Math.round(modalWidth * 0.08);
    const prevButtonHeight = this.calculateHeightByWidth(
      pageButtonWidth,
      RECRUITMENT_PAGE_PREV_SOURCE_WIDTH,
      RECRUITMENT_PAGE_PREV_SOURCE_HEIGHT,
    );
    const nextButtonHeight = this.calculateHeightByWidth(
      pageButtonWidth,
      RECRUITMENT_PAGE_NEXT_SOURCE_WIDTH,
      RECRUITMENT_PAGE_NEXT_SOURCE_HEIGHT,
    );
    const prevButtonRoot = this.createLayerNode(
      recruitmentPanel,
      'RecruitmentPrevPageButton',
      new Vec3(-Math.round(modalWidth * 0.48), pageButtonY, 2),
      pageButtonWidth,
      prevButtonHeight,
    );
    this.attachSpriteByResource(
      prevButtonRoot,
      'RecruitmentPrevPageButtonSprite',
      RECRUITMENT_PAGE_PREV_RESOURCE,
      new Vec3(0, 0, 0),
      pageButtonWidth,
      prevButtonHeight,
    );
    const nextButtonRoot = this.createLayerNode(
      recruitmentPanel,
      'RecruitmentNextPageButton',
      new Vec3(Math.round(modalWidth * 0.46), pageButtonY, 2),
      pageButtonWidth,
      nextButtonHeight,
    );
    this.attachSpriteByResource(
      nextButtonRoot,
      'RecruitmentNextPageButtonSprite',
      RECRUITMENT_PAGE_NEXT_RESOURCE,
      new Vec3(0, 0, 0),
      pageButtonWidth,
      nextButtonHeight,
    );
    prevButtonRoot.on(Node.EventType.TOUCH_END, () => {
      this.latestRecruitmentFeedback = '当前页只开放第一档招聘';
      if (this.runtimeGameState && this.sceneVisualNodes) {
        this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
      }
    });
    nextButtonRoot.on(Node.EventType.TOUCH_END, () => {
      this.latestRecruitmentFeedback = '当前页只开放第一档招聘';
      if (this.runtimeGameState && this.sceneVisualNodes) {
        this.refreshRecruitmentOverlay(this.runtimeGameState, this.sceneVisualNodes);
      }
    });

    const indicatorWidth = Math.round(modalWidth * 0.18);
    const indicatorHeight = this.calculateHeightByWidth(
      indicatorWidth,
      RECRUITMENT_PAGE_INDICATOR_SOURCE_WIDTH,
      RECRUITMENT_PAGE_INDICATOR_SOURCE_HEIGHT,
    );
    this.attachSpriteByResource(
      recruitmentPanel,
      'RecruitmentPageIndicator',
      RECRUITMENT_PAGE_INDICATOR_RESOURCE,
      new Vec3(0, -Math.round(modalHeight / 2) + Math.round(modalHeight * 0.10), 2),
      indicatorWidth,
      indicatorHeight,
      1,
    );

    this.recruitmentCapacityLabel = this.createLabel(
      recruitmentPanel,
      'RecruitmentCapacityLabel',
      '当前羊数 1/20',
      Math.max(13, scaleLayout(14)),
      Math.round(modalWidth * 0.72),
      Math.round(modalHeight * 0.05),
      new Vec3(0, -Math.round(modalHeight / 2) + Math.round(modalHeight * 0.17), 2),
      new Color(112, 93, 44, 255),
      Label.HorizontalAlign.CENTER,
      true,
    );
    this.recruitmentFeedbackLabel = this.createLabel(
      recruitmentPanel,
      'RecruitmentFeedbackLabel',
      '当前地图第一档招聘已接入',
      Math.max(13, scaleLayout(14)),
      Math.round(modalWidth * 0.78),
      Math.round(modalHeight * 0.08),
      new Vec3(0, -Math.round(modalHeight / 2) + Math.round(modalHeight * 0.05), 2),
      new Color(88, 69, 42, 255),
      Label.HorizontalAlign.CENTER,
      true,
    );

    this.recruitmentModalRoot = modalRoot;
    sceneVisualNodes.sheepStatusLabel.string = '招聘入口已就绪';
  }

  private refreshRecruitmentOverlay(
    gameState: GameState,
    sceneVisualNodes: SceneVisualNodes,
  ): void {
    const currentMapDefinition = GAME_CONFIG.maps[gameState.currentMapId];
    const currentMapSheepCount = getMapSheepInstances(gameState, gameState.currentMapId).length;
    const requestedSheepId = currentMapDefinition.defaultPurchasableSheepIds[0];
    const fallbackMessage = requestedSheepId
      ? `当前羊数 ${currentMapSheepCount}/${currentMapDefinition.maxSheepCapacity}`
      : '当前地图招聘入口尚未开放';
    const feedbackMessage = this.latestRecruitmentFeedback || fallbackMessage;

    if (this.recruitmentModalRoot?.isValid) {
      this.recruitmentModalRoot.active = this.isRecruitmentModalVisible;
    }
    this.refreshRecruitmentCardContent(
      requestedSheepId,
      {
        artAnchor: this.recruitmentPrimaryCardArtAnchor,
        artNodeName: 'RecruitmentPrimaryCardArt',
        sheepNameLabel: this.recruitmentSheepNameLabel,
        idleProductionLabel: this.recruitmentIdleProductionLabel,
        priceLabel: this.recruitmentPriceLabel,
        purchaseButtonLabel: this.recruitmentPurchaseButtonLabel,
      },
      {
        unavailableName: '当前地图未开放招聘',
        unavailableIdleProduction: '--',
        unavailablePrice: '当前地图暂未开放招聘',
        unavailableButton: '暂未开放',
        availablePricePrefix: '当前开放 · 消耗',
        availableButtonPrefix: '购买',
      },
    );
    this.refreshRecruitmentCardContent(
      SECONDARY_RECRUITMENT_PREVIEW_SHEEP_ID,
      {
        artAnchor: this.recruitmentSecondaryCardArtAnchor,
        artNodeName: 'RecruitmentSecondaryCardArt',
        sheepNameLabel: this.recruitmentSecondarySheepNameLabel,
        idleProductionLabel: this.recruitmentSecondaryIdleProductionLabel,
        priceLabel: this.recruitmentSecondaryPriceLabel,
        purchaseButtonLabel: this.recruitmentSecondaryPurchaseButtonLabel,
      },
      {
        unavailableName: '后续档位',
        unavailableIdleProduction: '--',
        unavailablePrice: '当前版本仅开放第一档招聘',
        unavailableButton: '敬请期待',
        availablePricePrefix: '后续开放 · 消耗',
        availableButtonPrefix: '购买',
      },
    );
    if (this.recruitmentCapacityLabel) {
      this.recruitmentCapacityLabel.string =
        `当前羊数 ${currentMapSheepCount}/${currentMapDefinition.maxSheepCapacity}`;
    }
    if (this.recruitmentFeedbackLabel) {
      this.recruitmentFeedbackLabel.string = feedbackMessage;
    }

    sceneVisualNodes.sheepStatusLabel.string = feedbackMessage;
  }

  /**
   * 招聘卡的文案、数值和羊图统一走这里刷新。
   * 两张卡共用同一套规则，避免布局一致但展示逻辑继续分叉。
   */
  private refreshRecruitmentCardContent(
    sheepId: string | undefined,
    controls: {
      artAnchor: Node | null;
      artNodeName: string;
      sheepNameLabel: Label | null;
      idleProductionLabel: Label | null;
      priceLabel: Label | null;
      purchaseButtonLabel: Label | null;
    },
    copy: {
      unavailableName: string;
      unavailableIdleProduction: string;
      unavailablePrice: string;
      unavailableButton: string;
      availablePricePrefix: string;
      availableButtonPrefix: string;
    },
  ): void {
    this.refreshRecruitmentCardArt(controls.artAnchor, controls.artNodeName, sheepId);

    const sheepDefinition = sheepId ? GAME_CONFIG.sheepDefinitions[sheepId] : undefined;
    if (!sheepId || !sheepDefinition) {
      if (controls.sheepNameLabel) {
        controls.sheepNameLabel.string = copy.unavailableName;
      }
      if (controls.idleProductionLabel) {
        controls.idleProductionLabel.string = copy.unavailableIdleProduction;
      }
      if (controls.priceLabel) {
        controls.priceLabel.string = copy.unavailablePrice;
      }
      if (controls.purchaseButtonLabel) {
        controls.purchaseButtonLabel.string = copy.unavailableButton;
      }
      return;
    }

    if (controls.sheepNameLabel) {
      controls.sheepNameLabel.string = `${sheepId} ${sheepDefinition.displayName}`;
    }
    if (controls.idleProductionLabel) {
      controls.idleProductionLabel.string = `+${this.formatIdleEnergyValue(
        sheepDefinition.idleEnergyPerSecond,
      )}/秒`;
    }
    if (controls.priceLabel) {
      controls.priceLabel.string = `${copy.availablePricePrefix} ${this.formatIdleEnergyValue(
        sheepDefinition.purchaseIdleEnergyCost,
      )}`;
    }
    if (controls.purchaseButtonLabel) {
      controls.purchaseButtonLabel.string = `${copy.availableButtonPrefix} ${this.formatIdleEnergyValue(
        sheepDefinition.purchaseIdleEnergyCost,
      )}`;
    }
  }

  private refreshRecruitmentCardArt(
    artAnchor: Node | null,
    artNodeName: string,
    requestedSheepId: string | undefined,
  ): void {
    if (!artAnchor?.isValid) {
      return;
    }

    const artDefinition = this.getRecruitmentCardArtResource(requestedSheepId);
    const artTransform = artAnchor.getComponent(UITransform);
    this.attachRecruitmentCardArt(
      artAnchor,
      artNodeName,
      artDefinition.resourcePath,
      artDefinition.sourceWidth,
      artDefinition.sourceHeight,
      artTransform?.contentSize.width ?? 0,
      artTransform?.contentSize.height ?? 0,
    );
  }

  private getRecruitmentCardArtResource(requestedSheepId: string | undefined): {
    resourcePath: string;
    sourceWidth: number;
    sourceHeight: number;
  } {
    switch (requestedSheepId) {
      case '003':
        return {
          resourcePath: RECRUITMENT_SHEEP_003_CARD_RESOURCE,
          sourceWidth: RECRUITMENT_SHEEP_003_CARD_SOURCE_WIDTH,
          sourceHeight: RECRUITMENT_SHEEP_003_CARD_SOURCE_HEIGHT,
        };
      case '007':
        return {
          resourcePath: RECRUITMENT_SHEEP_007_CARD_RESOURCE,
          sourceWidth: RECRUITMENT_SHEEP_007_CARD_SOURCE_WIDTH,
          sourceHeight: RECRUITMENT_SHEEP_007_CARD_SOURCE_HEIGHT,
        };
      case '001':
      default:
        return {
          resourcePath: RECRUITMENT_SHEEP_001_CARD_RESOURCE,
          sourceWidth: RECRUITMENT_SHEEP_001_CARD_SOURCE_WIDTH,
          sourceHeight: RECRUITMENT_SHEEP_001_CARD_SOURCE_HEIGHT,
        };
    }
  }

  private attachSpriteByResource(
    parent: Node,
    name: string,
    resourcePath: string,
    position: Vec3,
    width: number,
    height: number,
    siblingIndex = 0,
  ): void {
    void this.loadSpriteFrame(resourcePath)
      .then((spriteFrame) => {
        if (!parent.isValid) {
          return;
        }

        parent.getChildByName(name)?.destroy();
        const sprite = this.createSpriteNode(parent, name, spriteFrame, position, width, height);
        sprite.node.setSiblingIndex(siblingIndex);
      })
      .catch((error) => {
        console.error(`[MainSceneController] sprite load failed: ${resourcePath}`, error);
      });
  }

  private attachRecruitmentCardArt(
    parent: Node,
    name: string,
    resourcePath: string,
    sourceWidth: number,
    sourceHeight: number,
    maxWidth: number,
    maxHeight: number,
  ): void {
    const artScale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    const displayWidth = Math.round(sourceWidth * artScale);
    const displayHeight = Math.round(sourceHeight * artScale);

    this.attachSpriteByResource(
      parent,
      name,
      resourcePath,
      new Vec3(0, 0, 0),
      displayWidth,
      displayHeight,
    );
  }

  private async renderMapSheepSprites(
    gameState: GameState,
    sceneVisualNodes: SceneVisualNodes,
  ): Promise<void> {
    const sheepInstances = getMapSheepInstances(gameState, 'map_01').sort(
      (left, right) => left.position.y - right.position.y,
    );
    if (!this.mapSheepLayer?.isValid) {
      const viewportMetrics = this.getViewportMetrics();
      this.mapSheepLayer = this.createLayerNode(
        this.node,
        'MapSheepLayer',
        new Vec3(0, 0, 5),
        viewportMetrics.width,
        viewportMetrics.height,
      );
      this.mapSheepLayer.setSiblingIndex(sceneVisualNodes.sheepArtAnchor.getSiblingIndex());
    }

    sceneVisualNodes.sheepArtAnchor.removeAllChildren();
    sceneVisualNodes.sheepArtAnchor.active = true;
    this.mapSheepLayer.removeAllChildren();

    if (sheepInstances.length === 0) {
      sceneVisualNodes.sheepStatusLabel.string = '当前第一图没有可显示的羊实例';
      return;
    }

    const spriteFrame = await this.loadSheep001SpriteFrame();
    sceneVisualNodes.sheepArtAnchor.setPosition(
      this.scalePositionForViewport(sheepInstances[0].position, this.currentLayoutScale),
    );

    for (const sheepInstance of sheepInstances) {
      const sheepNode = this.createLayerNode(
        this.mapSheepLayer,
        `MapSheep-${sheepInstance.instanceId}`,
        this.scalePositionForViewport(sheepInstance.position, this.currentLayoutScale),
        SHEEP_001_DISPLAY_WIDTH,
        SHEEP_001_DISPLAY_HEIGHT,
      );
      this.createEllipse(
        sheepNode,
        `SheepShadow-${sheepInstance.instanceId}`,
        new Vec3(0, Math.round(this.currentLayoutScale * SHEEP_001_SHADOW_OFFSET_Y), 0),
        Math.round(this.currentLayoutScale * SHEEP_001_SHADOW_WIDTH),
        Math.round(this.currentLayoutScale * SHEEP_001_SHADOW_HEIGHT),
        new Color(0, 0, 0, 82),
        new Color(0, 0, 0, 0),
        0,
      );
      this.createSpriteNode(
        sheepNode,
        `SheepSprite-${sheepInstance.instanceId}`,
        spriteFrame,
        new Vec3(0, 0, 0),
        Math.round(this.currentLayoutScale * SHEEP_001_DISPLAY_WIDTH),
        Math.round(this.currentLayoutScale * SHEEP_001_DISPLAY_HEIGHT),
      );
    }
  }

  private loadSheep001SpriteFrame(): Promise<SpriteFrame> {
    if (!this.sheep001SpriteFramePromise) {
      this.sheep001SpriteFramePromise = this.loadSpriteFrame(SHEEP_001_RESOURCE).catch(
        (error) => {
          this.sheep001SpriteFramePromise = null;
          throw error;
        },
      );
    }

    return this.sheep001SpriteFramePromise;
  }

  private scalePositionForViewport(position: SheepPosition, layoutScale: number): Vec3 {
    return new Vec3(
      Math.round(position.x * layoutScale),
      Math.round(position.y * layoutScale),
      0,
    );
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
   * 当前主场景里实际可见的是第一图羊层，因此秒产反馈要逐只挂到对应羊节点上。
   * 正常运行时这里会严格每秒弹一次；如果前台卡顿补帧过多，则压缩成每只羊一次汇总提示，避免爆屏。
   */
  private playVisibleMapSheepIdleProductionFeedback(
    gameState: GameState,
    settledSeconds: number,
  ): void {
    if (!this.mapSheepLayer?.isValid || settledSeconds <= 0) {
      return;
    }

    const displayedSheepInstances = getMapSheepInstances(gameState, 'map_01');
    const showCompressedFeedback = settledSeconds > 5;
    for (const sheepInstance of displayedSheepInstances) {
      const sheepNode = this.mapSheepLayer.getChildByName(`MapSheep-${sheepInstance.instanceId}`);
      const sheepDefinition = GAME_CONFIG.sheepDefinitions[sheepInstance.sheepId];
      if (!sheepNode?.isValid || !sheepDefinition || sheepDefinition.idleEnergyPerSecond <= 0) {
        continue;
      }

      if (showCompressedFeedback) {
        void this.spawnIdleEnergyFeedback(
          sheepNode,
          sheepDefinition.idleEnergyPerSecond * settledSeconds,
        );
        continue;
      }

      for (let secondIndex = 0; secondIndex < settledSeconds; secondIndex += 1) {
        this.scheduleOnce(() => {
          if (!sheepNode.isValid) {
            return;
          }

          void this.spawnIdleEnergyFeedback(
            sheepNode,
            sheepDefinition.idleEnergyPerSecond,
          );
        }, secondIndex * SHEEP_IDLE_ENERGY_FEEDBACK_STAGGER_SECONDS);
      }
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
