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
  UITransform,
  Vec3,
  view,
} from 'cc';
import { bootGameState } from '../boot/bootCoordinator';
import { GAME_CONFIG } from '../config/gameConfig';
import type { LoadGameStateSource } from '../domain/loadGameState';
import {
  countUnlockedCollectionEntries,
  getMapSheepInstances,
  type GameState,
} from '../domain/gameStateSchema';
import { setRuntimeGameState } from '../runtime/runtimeSession';
import { readSerializedSave, writeSerializedSave } from '../storage/localSaveRepository';

const { ccclass } = _decorator;

/**
 * 主场景继续使用固定设计尺寸，保证素材布局先稳定在竖屏 MVP 口径上。
 */
const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;

/**
 * 旧布局最初按 `720x1280` 搭起骨架，当前统一按这个基准等比放大到 `1080x1920`。
 */
const LEGACY_LAYOUT_WIDTH = 720;
const MAP_01_BACKGROUND_SOURCE_WIDTH = 941;
const MAP_01_BACKGROUND_SOURCE_HEIGHT = 1672;

/**
 * `resources` 目录中的背景图资源路径，运行时按 `spriteFrame` 子资源加载。
 */
const MAP_01_BACKGROUND_RESOURCE = 'map_01/map_01_background/spriteFrame';

/**
 * `resources` 目录中的 001 羊资源路径，运行时按 `spriteFrame` 子资源加载。
 */
const SHEEP_001_RESOURCE = 'sheep/sheep_001/spriteFrame';

/**
 * 当前 issue 只需要展示一只赠送的 `001`，因此先固定它在场景中的显示尺寸。
 */
const SHEEP_001_DISPLAY_WIDTH = 132;
const SHEEP_001_DISPLAY_HEIGHT = 165;

/**
 * 最低级羊的阴影也要同步缩小，否则会继续显得羊体过大。
 */
const SHEEP_001_SHADOW_WIDTH = 148;
const SHEEP_001_SHADOW_HEIGHT = 30;

/**
 * 渲染基础骨架后保留下来的关键节点引用，供异步贴图加载完成后继续挂载真实素材。
 */
type SceneVisualNodes = {
  backgroundArtLayer: Node;
  sheepArtAnchor: Node;
  sheepStatusLabel: Label;
};

/**
 * 统一把旧布局数值转换到当前 `1080x1920` 设计尺寸。
 */
type ViewportMetrics = {
  width: number;
  height: number;
  layoutScale: number;
};

@ccclass('MainSceneController')
export class MainSceneController extends Component {
  /**
   * Cocos 生命周期入口。
   * 先执行 boot，再渲染 issue #2 需要的主场景与素材层。
   */
  protected start(): void {
    void this.bootstrapAndRender();
  }

  /**
   * 统一协调存档启动、场景骨架渲染和真实素材接入。
   */
  private async bootstrapAndRender(): Promise<void> {
    try {
      const bootResult = bootGameState({
        readSerializedSave: () => readSerializedSave(GAME_CONFIG.storageKey),
        writeSerializedSave: (gameState) =>
          writeSerializedSave(GAME_CONFIG.storageKey, gameState),
      });

      setRuntimeGameState(bootResult.gameState);
      const sceneVisualNodes = this.renderFoundation(
        bootResult.gameState,
        bootResult.source,
        bootResult.didPersist,
      );

      await this.hydrateSceneArt(bootResult.gameState, sceneVisualNodes);
    } catch (error) {
      console.error('[MainSceneController] boot failed', error);
      this.renderFatalError();
    }
  }

  /**
   * 先把文字信息层、锁定位骨架和贴图挂点渲染出来。
   * 即使真实素材加载失败，也要保证场景不会回退成黑屏。
   */
  private renderFoundation(
    gameState: GameState,
    bootSource: LoadGameStateSource,
    didPersist: boolean,
  ): SceneVisualNodes {
    const viewportMetrics = this.getViewportMetrics();
    const scaleLayout = this.createLayoutScaler(viewportMetrics.layoutScale);
    const backgroundDisplayHeight = this.calculateHeightByWidth(
      viewportMetrics.width,
      MAP_01_BACKGROUND_SOURCE_WIDTH,
      MAP_01_BACKGROUND_SOURCE_HEIGHT,
    );

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

    this.createRect(
      this.node,
      'TopOverlayPanel',
      new Vec3(0, scaleLayout(425), 0),
      scaleLayout(640),
      scaleLayout(210),
      new Color(7, 21, 32, 178),
      new Color(114, 165, 181, 220),
    );

    this.createLabel(
      this.node,
      'Title',
      '电子羊会发疯',
      scaleLayout(42),
      scaleLayout(620),
      scaleLayout(56),
      new Vec3(0, scaleLayout(540), 0),
      new Color(244, 248, 252, 255),
    );
    this.createLabel(
      this.node,
      'Subtitle',
      'issue #2 · 主场景底座与新档开局',
      scaleLayout(22),
      scaleLayout(620),
      scaleLayout(34),
      new Vec3(0, scaleLayout(496), 0),
      new Color(162, 214, 228, 255),
    );

    const unlockedCollectionCount = countUnlockedCollectionEntries(gameState);
    this.createLabel(
      this.node,
      'SummaryText',
      [
        `启动来源：${this.describeBootSource(bootSource)}`,
        `当前地图：${gameState.currentMapId}    最高解锁羊：${gameState.highestUnlockedSheepId}`,
        `已解锁列表：${gameState.unlockedSheepIds.join(', ')}`,
        `图鉴进度：${unlockedCollectionCount}/${GAME_CONFIG.catalogSheepIds.length}    本次是否写回存档：${didPersist ? '是' : '否'}`,
      ].join('\n'),
      scaleLayout(19),
      scaleLayout(580),
      scaleLayout(124),
      new Vec3(0, scaleLayout(397), 0),
      new Color(223, 236, 243, 255),
      Label.HorizontalAlign.LEFT,
    );

    this.createBadge(
      this.node,
      'Map01Badge',
      new Vec3(0, scaleLayout(276), 0),
      scaleLayout(250),
      scaleLayout(44),
      'map_01 · 当前主场景',
      new Color(16, 97, 83, 224),
      new Color(148, 245, 219, 255),
    );

    this.createLabel(
      this.node,
      'SceneHint',
      '真实背景图已挂载到 map_01，场景内展示新档赠送的 001。',
      scaleLayout(18),
      scaleLayout(560),
      scaleLayout(30),
      new Vec3(0, scaleLayout(230), 0),
      new Color(229, 245, 237, 255),
    );

    this.createEllipse(
      this.node,
      'SheepShadow',
      new Vec3(0, scaleLayout(-360), 0),
      SHEEP_001_SHADOW_WIDTH,
      SHEEP_001_SHADOW_HEIGHT,
      new Color(0, 0, 0, 90),
    );

    const sheepArtAnchor = this.createLayerNode(
      this.node,
      'SheepArtAnchor',
      new Vec3(0, scaleLayout(-275), 0),
      SHEEP_001_DISPLAY_WIDTH,
      SHEEP_001_DISPLAY_HEIGHT,
    );

    const sheepStatusLabel = this.createLabel(
      this.node,
      'SheepStatusLabel',
      '正在加载 001 羊素材…',
      scaleLayout(18),
      scaleLayout(540),
      scaleLayout(42),
      new Vec3(0, scaleLayout(-430), 0),
      new Color(248, 250, 252, 255),
    );

    const mapTwoPanel = this.createRect(
      this.node,
      'Map02Panel',
      new Vec3(0, scaleLayout(-500), 0),
      scaleLayout(640),
      scaleLayout(122),
      new Color(28, 25, 44, 206),
      new Color(178, 160, 222, 235),
    );
    this.createLabel(
      mapTwoPanel,
      'Map02Title',
      'map_02 · 锁定位骨架',
      scaleLayout(24),
      scaleLayout(560),
      scaleLayout(32),
      new Vec3(0, scaleLayout(28), 0),
      new Color(244, 239, 252, 255),
    );
    this.createLabel(
      mapTwoPanel,
      'Map02Body',
      [
        gameState.maps.map_02.isUnlocked ? '当前状态：已解锁' : '当前状态：未解锁',
        `预留编号范围：${GAME_CONFIG.maps.map_02.startSheepId}-${GAME_CONFIG.maps.map_02.endSheepId}`,
        '本轮不实现第二图玩法、购买、科技、离线收益。',
      ].join('\n'),
      scaleLayout(18),
      scaleLayout(580),
      scaleLayout(72),
      new Vec3(0, scaleLayout(-20), 0),
      new Color(229, 221, 244, 255),
      Label.HorizontalAlign.LEFT,
    );

    this.createLabel(
      this.node,
      'Footer',
      '当前验收重点：进入主场景、初始化 map_01、建立双地图最小骨架、新档赠送 001。',
      scaleLayout(16),
      scaleLayout(640),
      scaleLayout(28),
      new Vec3(0, scaleLayout(-600), 0),
      new Color(215, 223, 231, 255),
    );

    return {
      backgroundArtLayer,
      sheepArtAnchor,
      sheepStatusLabel,
    };
  }

  /**
   * 把真实贴图接入当前场景。
   * 背景图和 001 羊分别独立加载，避免单个素材失败拖垮整个场景。
   */
  private async hydrateSceneArt(
    gameState: GameState,
    sceneVisualNodes: SceneVisualNodes,
  ): Promise<void> {
    await this.attachBackgroundSprite(sceneVisualNodes.backgroundArtLayer);

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
      giftedSheepInstance.instanceId,
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
   * 把新档赠送的 `001` 羊素材挂进场景，并把实例信息同步显示到文案层。
   */
  private async attachGiftedSheepSprite(
    sheepArtAnchor: Node,
    sheepStatusLabel: Label,
    sheepInstanceId: string,
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
      sheepStatusLabel.string = `001 实习羊已入场 · ${sheepInstanceId}`;
    } catch (error) {
      console.error('[MainSceneController] sheep_001 load failed', error);
      sheepStatusLabel.string = '001 羊素材加载失败，请检查 resources 路径。';
    }
  }

  /**
   * 把 `resources` 中的图片子资源统一转成 `SpriteFrame` Promise。
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
  /**
   * 获取当前视口可见区域尺寸。
   * 背景与相机都应跟随这里的尺寸，而不是继续硬钉固定像素。
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
   * 创建当前帧使用的布局缩放函数。
   * 现阶段继续按宽度优先缩放 UI，避免不同设备下横向比例漂移。
   */
  private createLayoutScaler(layoutScale: number): (value: number) => number {
    return (value: number) => Math.round(value * layoutScale);
  }

  /**
   * 只按目标宽度和原图比例计算显示高度。
   * 这样地图宽度可以铺满屏幕，而高度只会等比变化，不会被拉伸变形。
   */
  private calculateHeightByWidth(
    displayWidth: number,
    sourceWidth: number,
    sourceHeight: number,
  ): number {
    return Math.round((displayWidth * sourceHeight) / sourceWidth);
  }

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
   * 创建纯内容挂点，供背景图和羊贴图这类异步素材使用。
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
   * 创建带自定义尺寸的 `Sprite` 节点，用于真实场景素材挂载。
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
   * 创建带描边的矩形块，用于信息面板与锁定骨架。
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
   * 创建椭圆阴影，给羊素材一个稳定落点，避免悬浮感过强。
   */
  private createEllipse(
    parent: Node,
    name: string,
    position: Vec3,
    width: number,
    height: number,
    fillColor: Color,
  ): Node {
    const node = new Node(name);
    node.parent = parent;
    node.setPosition(position);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fillColor;
    graphics.ellipse(0, 0, width / 2, height / 2);
    graphics.fill();

    return node;
  }

  /**
   * 统一创建文本节点，减少 UI 零散硬编码。
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

    return label;
  }

  /**
   * 徽标用于强调 `map_01` 当前就是 issue #2 的真实主场景入口。
   */
  private createBadge(
    parent: Node,
    name: string,
    position: Vec3,
    width: number,
    height: number,
    text: string,
    fillColor: Color,
    strokeColor: Color,
  ): void {
    const badge = this.createRect(parent, name, position, width, height, fillColor, strokeColor);
    this.createLabel(
      badge,
      `${name}Text`,
      text,
      16,
      width - 18,
      height - 8,
      new Vec3(0, 0, 0),
      new Color(236, 252, 248, 255),
    );
  }

  /**
   * 把启动来源转换成场景内可读文本。
   */
  private describeBootSource(source: LoadGameStateSource): string {
    switch (source) {
      case 'existing-save':
        return '读取已有存档';
      case 'new-save-missing':
        return '空档，新建存档';
      case 'new-save-recreated':
        return '坏档重建新档';
      default:
        return '未知来源';
    }
  }
}
