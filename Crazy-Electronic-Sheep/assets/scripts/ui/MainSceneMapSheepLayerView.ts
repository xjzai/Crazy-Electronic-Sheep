import {
  _decorator,
  Color,
  Component,
  Label,
  Node,
  resources,
  SpriteFrame,
  tween,
  UIOpacity,
  Vec3,
} from 'cc';
import {
  getMapSheepInstances,
  type GameState,
  type SheepId,
  type SheepIdleProductionDefinition,
  type SheepInstanceState,
  type SheepPosition,
} from '../domain/gameStateSchema';
import {
  createInitialSheepRoamingState,
  createSheepVisualStyle,
  getSheepSpriteScaleX,
  stepSheepRoamingState,
  type RoamingConfig,
  type RoamingMapBounds,
  type SheepRoamingState,
} from '../domain/sheepRoamingService';
import {
  createEllipse,
  createLabel,
  createLayerNode,
  createSpriteNode,
} from './uiNodeFactory';

const { ccclass } = _decorator;

const SHEEP_001_RESOURCE = 'sheep/sheep_001/spriteFrame';
const IDLE_ENERGY_ICON_RESOURCE = 'ui/idle_energy_icon/spriteFrame';

const SHEEP_001_DISPLAY_WIDTH = 131;
const SHEEP_001_DISPLAY_HEIGHT = 120;
const SHEEP_001_SHADOW_WIDTH = 120;
const SHEEP_001_SHADOW_HEIGHT = 42;
const SHEEP_001_SHADOW_OFFSET_Y = -50;

/**
 * 前台卡顿或调试断点后，单帧 `deltaTime` 可能非常大。
 * 可视漫游只负责表现，因此限制单帧推进，避免羊瞬移穿过整张地图。
 */
const SHEEP_ROAMING_MAX_DELTA_SECONDS = 0.25;

const SHEEP_IDLE_ENERGY_FEEDBACK_WIDTH = 210;
const SHEEP_IDLE_ENERGY_FEEDBACK_HEIGHT = 58;
const SHEEP_IDLE_ENERGY_FEEDBACK_START_Y = 114;
const SHEEP_IDLE_ENERGY_FEEDBACK_RISE_DISTANCE = 78;
const SHEEP_IDLE_ENERGY_FEEDBACK_DURATION_SECONDS = 0.9;
const SHEEP_IDLE_ENERGY_FEEDBACK_STAGGER_SECONDS = 0.12;
const SHEEP_IDLE_ENERGY_FEEDBACK_ICON_SIZE = 50;
const SHEEP_IDLE_ENERGY_FEEDBACK_FONT_SIZE = 100;

export interface MainSceneMapSheepRenderOptions {
  layoutScale: number;
  roamingConfig: RoamingConfig;
  sheepArtAnchor: Node;
  showStatusMessage: (message: string) => void;
}

export interface MainSceneMapSheepFeedbackOptions {
  settledSeconds: number;
  sheepDefinitions: Record<SheepId, SheepIdleProductionDefinition>;
  formatIdleEnergyValue: (value: number) => string;
}

/**
 * 主场景地图羊群表现组件。
 * 当前只渲染第一图羊实例，后续接入切图时再把 mapId 变成输入。
 */
@ccclass('MainSceneMapSheepLayerView')
export class MainSceneMapSheepLayerView extends Component {
  /**
   * 每只可见羊的当前漫游表现状态。
   * 该状态不写回 `GameState`，只用于当前第一图视图的逐帧移动。
   */
  private readonly roamingStatesByInstanceId = new Map<string, SheepRoamingState>();

  /**
   * 当前场景中可见羊节点索引。
   * 自动产出飘字和逐帧移动都通过实例 ID 找回对应节点。
   */
  private readonly sheepNodesByInstanceId = new Map<string, Node>();

  /**
   * 最近一次渲染时传入的漫游配置。
   * Cocos `update` 没有业务参数，只能读取这里缓存的表现配置。
   */
  private currentRoamingConfig: RoamingConfig | null = null;

  /**
   * 当前显示地图的连续漫游边界。
   * 本 issue 只显示第一图，因此这里固定缓存 `map_01` 的边界。
   */
  private currentRoamingBounds: RoamingMapBounds | null = null;

  /**
   * 当前屏幕布局缩放。
   * 漫游状态保存未缩放地图坐标，写入节点前再按该比例转成屏幕坐标。
   */
  private currentLayoutScale = 1;

  /**
   * 当前地图羊贴图会在购买成功后反复复用，缓存起来避免每次重绘都重复加载。
   */
  private sheep001SpriteFramePromise: Promise<SpriteFrame> | null = null;

  /**
   * 摸鱼能量小图标会被每秒飘字频繁复用，因此在组件内缓存加载 Promise。
   */
  private idleEnergyFeedbackSpriteFramePromise: Promise<SpriteFrame> | null = null;

  /**
   * 提前加载摸鱼能量图标，避免首次自动产出时再阻塞飘字创建。
   */
  public preloadIdleEnergyFeedbackSpriteFrame(): void {
    void this.loadIdleEnergyFeedbackSpriteFrame().catch((error) => {
      console.error('[MainSceneMapSheepLayerView] idle energy feedback icon load failed', error);
    });
  }

  /**
   * 按当前游戏状态重绘可见地图羊群。
   * 输入来自业务快照，输出只影响本组件节点树和顶部提示文本。
   */
  public async render(
    gameState: GameState,
    options: MainSceneMapSheepRenderOptions,
  ): Promise<void> {
    const sheepInstances = getMapSheepInstances(gameState, 'map_01').sort(
      (left, right) => left.position.y - right.position.y,
    );
    const visibleInstanceIds = new Set(
      sheepInstances.map((sheepInstance) => sheepInstance.instanceId),
    );

    this.currentLayoutScale = options.layoutScale;
    this.currentRoamingConfig = options.roamingConfig;
    this.currentRoamingBounds = options.roamingConfig.mapBounds.map_01;
    this.pruneInvisibleSheep(visibleInstanceIds);

    options.sheepArtAnchor.removeAllChildren();
    options.sheepArtAnchor.active = true;
    this.node.removeAllChildren();
    this.sheepNodesByInstanceId.clear();

    if (sheepInstances.length === 0) {
      options.showStatusMessage('当前第一图没有可显示的羊实例');
      return;
    }

    const spriteFrame = await this.loadSheep001SpriteFrame();
    options.sheepArtAnchor.setPosition(
      this.scalePositionForViewport(sheepInstances[0].position, options.layoutScale),
    );

    for (const sheepInstance of sheepInstances) {
      const roamingState = this.getRoamingStateForSheep(sheepInstance, options);
      const visualStyle = createSheepVisualStyle(sheepInstance.sheepId);
      const sheepNode = createLayerNode(
        this.node,
        `MapSheep-${sheepInstance.instanceId}`,
        this.scalePositionForViewport(roamingState.position, options.layoutScale),
        Math.round(options.layoutScale * SHEEP_001_DISPLAY_WIDTH),
        Math.round(options.layoutScale * SHEEP_001_DISPLAY_HEIGHT),
      );
      this.sheepNodesByInstanceId.set(sheepInstance.instanceId, sheepNode);
      createEllipse(
        sheepNode,
        `SheepShadow-${sheepInstance.instanceId}`,
        new Vec3(0, Math.round(options.layoutScale * SHEEP_001_SHADOW_OFFSET_Y), 0),
        Math.round(options.layoutScale * SHEEP_001_SHADOW_WIDTH * visualStyle.displayScale),
        Math.round(options.layoutScale * SHEEP_001_SHADOW_HEIGHT * visualStyle.displayScale),
        new Color(0, 0, 0, 82),
        new Color(0, 0, 0, 0),
        0,
      );
      const sheepSprite = createSpriteNode(
        sheepNode,
        `SheepSprite-${sheepInstance.instanceId}`,
        spriteFrame,
        new Vec3(0, 0, 0),
        Math.round(options.layoutScale * SHEEP_001_DISPLAY_WIDTH * visualStyle.displayScale),
        Math.round(options.layoutScale * SHEEP_001_DISPLAY_HEIGHT * visualStyle.displayScale),
      );
      sheepSprite.color = new Color(
        visualStyle.tint.r,
        visualStyle.tint.g,
        visualStyle.tint.b,
        255,
      );
      this.applySheepFacing(sheepInstance.instanceId, roamingState.facing);
    }

    this.syncSheepSiblingOrder();
  }

  /**
   * Cocos 每帧入口。
   * 这里只推进当前可见第一图的表现位置，不修改业务状态或存档。
   */
  protected update(deltaTime: number): void {
    if (!this.currentRoamingConfig || !this.currentRoamingBounds) {
      return;
    }

    const safeDeltaSeconds = Math.min(
      SHEEP_ROAMING_MAX_DELTA_SECONDS,
      Math.max(0, deltaTime),
    );
    if (safeDeltaSeconds === 0) {
      return;
    }

    for (const [instanceId, roamingState] of this.roamingStatesByInstanceId) {
      const sheepNode = this.sheepNodesByInstanceId.get(instanceId);
      if (!sheepNode?.isValid) {
        continue;
      }

      const nextRoamingState = stepSheepRoamingState(
        roamingState,
        this.currentRoamingBounds,
        this.currentRoamingConfig,
        safeDeltaSeconds,
      );
      this.roamingStatesByInstanceId.set(instanceId, nextRoamingState);
      sheepNode.setPosition(
        this.scalePositionForViewport(nextRoamingState.position, this.currentLayoutScale),
      );
      this.applySheepFacing(instanceId, nextRoamingState.facing);
    }

    this.syncSheepSiblingOrder();
  }

  /**
   * 获取单只羊的表现漫游状态。
   * 已存在的羊保留上一帧位置；新购买的羊则从业务出生点开始进入停顿状态。
   */
  private getRoamingStateForSheep(
    sheepInstance: SheepInstanceState,
    options: MainSceneMapSheepRenderOptions,
  ): SheepRoamingState {
    const existingState = this.roamingStatesByInstanceId.get(sheepInstance.instanceId);
    if (existingState) {
      return existingState;
    }

    const initialState = createInitialSheepRoamingState(
      sheepInstance,
      options.roamingConfig,
    );
    this.roamingStatesByInstanceId.set(sheepInstance.instanceId, initialState);

    return initialState;
  }

  /**
   * 清掉已经不在当前地图实例列表里的表现状态。
   * 后续接入合成删除或切图时，可避免旧节点状态泄漏到新渲染。
   */
  private pruneInvisibleSheep(visibleInstanceIds: Set<string>): void {
    for (const instanceId of [...this.roamingStatesByInstanceId.keys()]) {
      if (!visibleInstanceIds.has(instanceId)) {
        this.roamingStatesByInstanceId.delete(instanceId);
      }
    }
  }

  /**
   * 根据漫游朝向水平翻转羊贴图。
   * 只翻转贴图节点，不翻转阴影，避免朝向变化影响地面接触感。
   */
  private applySheepFacing(
    instanceId: string,
    facing: SheepRoamingState['facing'],
  ): void {
    const sheepNode = this.sheepNodesByInstanceId.get(instanceId);
    const sheepSpriteNode = sheepNode?.getChildByName(`SheepSprite-${instanceId}`);
    if (!sheepSpriteNode?.isValid) {
      return;
    }

    sheepSpriteNode.setScale(getSheepSpriteScaleX(facing), 1, 1);
  }

  /**
   * 按 y 坐标同步 sibling 顺序。
   * 下方羊排在更上层，能形成最小的前后遮挡关系。
   */
  private syncSheepSiblingOrder(): void {
    const visibleSheepNodes = [...this.sheepNodesByInstanceId.values()].filter(
      (sheepNode) => sheepNode.isValid,
    );
    visibleSheepNodes
      .sort((left, right) => right.position.y - left.position.y)
      .forEach((sheepNode, index) => {
        sheepNode.setSiblingIndex(index);
      });
  }

  /**
   * 给当前可见地图中的每只羊播放自动产出反馈。
   * 如果一次补算了过多秒数，则合并成单次提示，避免屏幕被大量飘字覆盖。
   */
  public playIdleProductionFeedback(
    gameState: GameState,
    options: MainSceneMapSheepFeedbackOptions,
  ): void {
    if (!this.node.isValid || options.settledSeconds <= 0) {
      return;
    }

    const displayedSheepInstances = getMapSheepInstances(gameState, 'map_01');
    const showCompressedFeedback = options.settledSeconds > 5;
    for (const sheepInstance of displayedSheepInstances) {
      const sheepNode = this.node.getChildByName(`MapSheep-${sheepInstance.instanceId}`);
      const sheepDefinition = options.sheepDefinitions[sheepInstance.sheepId];
      if (!sheepNode?.isValid || !sheepDefinition || sheepDefinition.idleEnergyPerSecond <= 0) {
        continue;
      }

      if (showCompressedFeedback) {
        void this.spawnIdleEnergyFeedback(
          sheepNode,
          sheepDefinition.idleEnergyPerSecond * options.settledSeconds,
          options.formatIdleEnergyValue,
        );
        continue;
      }

      for (let secondIndex = 0; secondIndex < options.settledSeconds; secondIndex += 1) {
        this.scheduleOnce(() => {
          if (!sheepNode.isValid) {
            return;
          }

          void this.spawnIdleEnergyFeedback(
            sheepNode,
            sheepDefinition.idleEnergyPerSecond,
            options.formatIdleEnergyValue,
          );
        }, secondIndex * SHEEP_IDLE_ENERGY_FEEDBACK_STAGGER_SECONDS);
      }
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

  /**
   * 创建一次“图标 + +x 数字”的轻量飘字。
   */
  private async spawnIdleEnergyFeedback(
    sheepArtAnchor: Node,
    producedIdleEnergy: number,
    formatIdleEnergyValue: (value: number) => string,
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
      const feedbackRoot = createLayerNode(
        sheepArtAnchor,
        `IdleEnergyFeedback-${Date.now()}`,
        startPosition,
        SHEEP_IDLE_ENERGY_FEEDBACK_WIDTH,
        SHEEP_IDLE_ENERGY_FEEDBACK_HEIGHT,
      );
      feedbackRoot.setSiblingIndex(99);

      const opacity = feedbackRoot.addComponent(UIOpacity);
      opacity.opacity = 255;

      createSpriteNode(
        feedbackRoot,
        'IdleEnergyFeedbackIcon',
        spriteFrame,
        new Vec3(-56, 0, 0),
        SHEEP_IDLE_ENERGY_FEEDBACK_ICON_SIZE,
        SHEEP_IDLE_ENERGY_FEEDBACK_ICON_SIZE,
      );
      createLabel(
        feedbackRoot,
        'IdleEnergyFeedbackValue',
        `+${formatIdleEnergyValue(producedIdleEnergy)}`,
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
      console.error('[MainSceneMapSheepLayerView] idle energy feedback spawn failed', error);
    }
  }

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
}
