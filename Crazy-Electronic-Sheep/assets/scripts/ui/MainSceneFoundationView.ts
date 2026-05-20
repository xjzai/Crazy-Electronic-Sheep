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
import { MainSceneDebugControlsView } from './MainSceneDebugControlsView';
import { MainSceneHudView } from './MainSceneHudView';
import {
  MainSceneStatusView,
  STATUS_MESSAGE_ROOT_HEIGHT,
  STATUS_MESSAGE_ROOT_WIDTH,
  STATUS_MESSAGE_TOP_Y,
} from './MainSceneStatusView';
import {
  createLayerNode,
  createRect,
  createLabel,
  ensureSpriteNode,
  isRuntimeManagedNode,
} from './uiNodeFactory';

const { ccclass, property } = _decorator;

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
 * 主场景渲染完成后需要持续刷新的关键节点引用。
 * UI 层只持有展示句柄，不持有业务真值。
 */
export interface MainSceneVisualNodes {
  backgroundArtLayer: Node;
  sheepArtAnchor: Node;
  hudView: MainSceneHudView;
  statusView: MainSceneStatusView;
}

/**
 * 当前可视区域与旧布局缩放系数。
 * 背景、相机与 HUD 都基于这里的结果自适应到实际设备尺寸。
 */
export interface MainSceneViewportMetrics {
  width: number;
  height: number;
  layoutScale: number;
}

export interface MainSceneFoundationBuildOptions {
  /**
   * 测试期清档按钮回调。
   * 具体清档、读档和状态刷新仍由主场景控制器负责。
   */
  onClearSave: () => void;
}

export interface MainSceneFoundationBuildResult {
  viewportMetrics: MainSceneViewportMetrics;
  sceneVisualNodes: MainSceneVisualNodes;
}

/**
 * 主场景中可以预先放在 Cocos 层级面板里的固定根节点。
 * 这些节点只承担“挂点”职责，具体 Label/Sprite 仍由各视图组件按状态生成。
 */
interface MainSceneMountedRoots {
  backgroundRoot: Node;
  coreHudRoot: Node;
  sheepArtAnchor: Node;
  sheepStatusRoot: Node;
  debugControlsRoot: Node;
}

/**
 * 主场景基础视图组件。
 * 只负责屏幕适配、基础层级、背景、HUD 和启动失败画面，不持有业务状态。
 */
@ccclass('MainSceneFoundationView')
export class MainSceneFoundationView extends Component {
  /**
   * 记录哪些固定挂点是运行时兜底创建的。
   * 这些挂点即使在后续 build 中被复用，也仍应继续使用代码默认布局，而不是被误当成场景真值冻结住。
   */
  private readonly runtimeFallbackNodes = new WeakSet<Node>();

  /**
   * 地图内容根节点。
   * 背景、羊锚点和地图表现层应放在这里，语义上固定在游戏世界内容上。
   */
  @property(Node)
  private worldRoot: Node | null = null;

  /**
   * 屏幕 UI 根节点。
   * HUD、状态条、调试入口和弹窗应放在这里，语义上固定在手机屏幕 UI 上。
   */
  @property(Node)
  private screenUiRoot: Node | null = null;

  /**
   * 场景中预挂载的背景根节点。
   * 兜底背景和真实地图背景都会生成在这里，避免直接污染 `ContentRoot`。
   */
  @property(Node)
  private backgroundRoot: Node | null = null;

  /**
   * 场景中预挂载的真实背景贴图层。
   * 该节点可以直接在 Cocos 层级面板中调整，运行时只同步到当前屏幕尺寸。
   */
  @property(Node)
  private backgroundArtLayer: Node | null = null;

  /**
   * 场景中预挂载的核心 HUD 根节点。
   * `MainSceneHudView` 会挂在该节点上，后续可继续把 HUD 子节点迁到 Prefab。
   */
  @property(Node)
  private coreHudRoot: Node | null = null;

  /**
   * 场景中预挂载的核心 HUD 组件。
   * 若旧场景未绑定，则运行时会从 `coreHudRoot` 上查找或兜底创建。
   */
  @property(MainSceneHudView)
  private coreHudView: MainSceneHudView | null = null;

  /**
   * 第一张地图背景图的 Inspector 绑定资源。
   * 新场景应优先在 Cocos 中拖入 SpriteFrame；缺失时才走 `resources.load` 兜底。
   */
  @property(SpriteFrame)
  private map01BackgroundSpriteFrame: SpriteFrame | null = null;

  /**
   * 场景中预挂载的 `map_01` 背景图片 Sprite。
   * 绑定后图片节点会稳定出现在层级面板里，不再每次启动都由代码重新创建。
   */
  @property(Sprite)
  private map01BackgroundSprite: Sprite | null = null;

  /**
   * 场景中预挂载的第一图羊表现挂点。
   * 羊实例节点由羊群视图动态维护，但根挂点位置由场景资产承载。
   */
  @property(Node)
  private sheepArtAnchor: Node | null = null;

  /**
   * 场景中预挂载的顶部提示根节点。
   * 该根节点只承担挂点职责，真实文本节点优先从场景资产里复用。
   */
  @property(Node)
  private sheepStatusRoot: Node | null = null;

  /**
   * 场景中预挂载的顶部提示组件。
   * 新场景应直接挂在 `SheepStatusRoot` 上；旧场景缺失时由运行时兜底补齐。
   */
  @property(MainSceneStatusView)
  private statusView: MainSceneStatusView | null = null;

  /**
   * 场景中预挂载的调试控件根节点。
   * 目前只承载测试期“清档重开”按钮。
   */
  @property(Node)
  private debugControlsRoot: Node | null = null;

  /**
   * 场景中预挂载的调试控件组件。
   * 新场景应直接挂在 `DebugControlsRoot` 上；旧场景缺失时由运行时兜底补齐。
   */
  @property(MainSceneDebugControlsView)
  private debugControlsView: MainSceneDebugControlsView | null = null;

  /**
   * 先渲染稳定的骨架层，确保真实贴图尚未加载时场景也可见。
   * 顶部 HUD 固定在屏幕顶部安全区内，因为当前地图可视范围就是整个屏幕。
   */
  public build(
    options: MainSceneFoundationBuildOptions,
  ): MainSceneFoundationBuildResult {
    const viewportMetrics = this.getViewportMetrics();
    const scaleLayout = this.createLayoutScaler(viewportMetrics.layoutScale);
    const backgroundDisplayHeight = this.calculateHeightByWidth(
      viewportMetrics.width,
      MAP_01_BACKGROUND_SOURCE_WIDTH,
      MAP_01_BACKGROUND_SOURCE_HEIGHT,
    );
    const mapVisibleHeight = Math.min(backgroundDisplayHeight, viewportMetrics.height);

    this.applyViewportToCanvas(viewportMetrics);
    const mountedRoots = this.prepareMountedRoots(
      viewportMetrics,
      scaleLayout,
      backgroundDisplayHeight,
      mapVisibleHeight,
    );
    this.clearManagedRootChildren(Object.values(mountedRoots));

    const fallbackBackground = createRect(
      mountedRoots.backgroundRoot,
      'FallbackBackground',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      viewportMetrics.height,
      new Color(24, 34, 44, 255),
      new Color(24, 34, 44, 255),
    );
    // 当前会保留场景中预挂载的 `BackgroundArtLayer`，因此兜底底色必须固定压到最底层，
    // 否则它会在 rebuild 后盖住真实地图背景图，表现成“地图消失，只剩纯色底板”。
    fallbackBackground.setSiblingIndex(0);

    const backgroundArtLayer = this.ensureMountedNode(
      this.backgroundArtLayer,
      mountedRoots.backgroundRoot,
      'BackgroundArtLayer',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      backgroundDisplayHeight,
    );
    this.backgroundArtLayer = backgroundArtLayer;

    const hudView = this.ensureCoreHudView(mountedRoots.coreHudRoot);
    hudView.build({
      viewportWidth: viewportMetrics.width,
      mapVisibleHeight,
      layoutScale: viewportMetrics.layoutScale,
    });

    const statusView = this.ensureStatusView(mountedRoots.sheepStatusRoot);
    statusView.build({
      layoutScale: viewportMetrics.layoutScale,
      initialMessage: '正在加载 001 羊素材…',
    });

    const debugControlsView = this.ensureDebugControlsView(mountedRoots.debugControlsRoot);
    debugControlsView.build({
      layoutScale: viewportMetrics.layoutScale,
      onClearSave: options.onClearSave,
    });

    return {
      viewportMetrics,
      sceneVisualNodes: {
        backgroundArtLayer,
        sheepArtAnchor: mountedRoots.sheepArtAnchor,
        hudView,
        statusView,
      },
    };
  }

  /**
   * 将真实贴图接入当前场景。
   * HUD 面板与地图背景独立加载，单个资源失败不会拖垮整屏。
   */
  public async attachSceneArt(sceneVisualNodes: MainSceneVisualNodes): Promise<void> {
    await Promise.all([
      this.attachBackgroundSprite(sceneVisualNodes.backgroundArtLayer),
      sceneVisualNodes.hudView.attachPanelSprites(),
    ]);
  }

  /**
   * 启动失败时给出稳定可见的错误反馈，避免黑屏。
   */
  public renderFatalError(): void {
    const viewportMetrics = this.getViewportMetrics();
    const scaleLayout = this.createLayoutScaler(viewportMetrics.layoutScale);
    this.applyViewportToCanvas(viewportMetrics);
    const mountedRoots = this.prepareMountedRoots(
      viewportMetrics,
      scaleLayout,
      viewportMetrics.height,
      viewportMetrics.height,
    );
    this.clearManagedRootChildren(Object.values(mountedRoots));

    createRect(
      mountedRoots.backgroundRoot,
      'ErrorBackground',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      viewportMetrics.height,
      new Color(36, 18, 18, 255),
      new Color(36, 18, 18, 255),
    );
    createLabel(
      mountedRoots.backgroundRoot,
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
  public getViewportMetrics(): MainSceneViewportMetrics {
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
      const spriteFrame =
        this.map01BackgroundSpriteFrame ??
        (await this.loadSpriteFrame(MAP_01_BACKGROUND_RESOURCE));
      this.map01BackgroundSprite = ensureSpriteNode(
        backgroundArtLayer,
        this.map01BackgroundSprite,
        'Map01BackgroundSprite',
        spriteFrame,
        new Vec3(0, 0, 0),
        viewportMetrics.width,
        backgroundDisplayHeight,
      );
    } catch (error) {
      console.error('[MainSceneFoundationView] map_01 background load failed', error);
    }
  }

  /**
   * 统一准备场景中预挂载的根节点。
   * 如果用户打开旧场景或误删节点，运行时会按同名节点查找或兜底创建，保证预览不中断。
   */
  private prepareMountedRoots(
    viewportMetrics: MainSceneViewportMetrics,
    scaleLayout: (value: number) => number,
    backgroundDisplayHeight: number,
    mapVisibleHeight: number,
  ): MainSceneMountedRoots {
    const worldRoot = this.ensureMountedNode(
      this.worldRoot,
      this.node,
      'WorldRoot',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      viewportMetrics.height,
    );
    const screenUiRoot = this.ensureMountedNode(
      this.screenUiRoot,
      this.node,
      'ScreenUiRoot',
      new Vec3(0, 0, 30),
      viewportMetrics.width,
      viewportMetrics.height,
    );
    const backgroundRoot = this.ensureMountedNode(
      this.backgroundRoot,
      worldRoot,
      'BackgroundRoot',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      Math.max(backgroundDisplayHeight, viewportMetrics.height),
    );
    const coreHudRoot = this.ensureMountedNode(
      this.coreHudRoot,
      screenUiRoot,
      'CoreHudRoot',
      new Vec3(0, 0, 10),
      viewportMetrics.width,
      mapVisibleHeight,
    );
    const sheepArtAnchor = this.ensureMountedNode(
      this.sheepArtAnchor,
      worldRoot,
      'SheepArtAnchor',
      new Vec3(0, scaleLayout(-275), 0),
      SHEEP_001_DISPLAY_WIDTH,
      SHEEP_001_DISPLAY_HEIGHT,
    );
    const sheepStatusRoot = this.ensureMountedNode(
      this.sheepStatusRoot,
      screenUiRoot,
      'SheepStatusRoot',
      new Vec3(0, scaleLayout(STATUS_MESSAGE_TOP_Y), 0),
      scaleLayout(STATUS_MESSAGE_ROOT_WIDTH),
      scaleLayout(STATUS_MESSAGE_ROOT_HEIGHT),
      true,
    );
    const debugControlsRoot = this.ensureMountedNode(
      this.debugControlsRoot,
      screenUiRoot,
      'DebugControlsRoot',
      new Vec3(
        -Math.round(viewportMetrics.width / 2) + scaleLayout(84),
        -Math.round(viewportMetrics.height / 2) + scaleLayout(68),
        20,
      ),
      scaleLayout(128),
      scaleLayout(46),
      true,
    );

    this.worldRoot = worldRoot;
    this.screenUiRoot = screenUiRoot;
    this.backgroundRoot = backgroundRoot;
    this.coreHudRoot = coreHudRoot;
    this.sheepArtAnchor = sheepArtAnchor;
    this.sheepStatusRoot = sheepStatusRoot;
    this.debugControlsRoot = debugControlsRoot;

    return {
      backgroundRoot,
      coreHudRoot,
      sheepArtAnchor,
      sheepStatusRoot,
      debugControlsRoot,
    };
  }

  /**
   * 查找或创建一个固定挂点，并同步它的父节点、位置和 UI 尺寸。
   * 这让同一套代码既能跑新场景，也能兼容尚未绑定 Inspector 字段的旧场景。
   */
  private ensureMountedNode(
    configuredNode: Node | null,
    parentNode: Node,
    fallbackName: string,
    position: Vec3,
    width: number,
    height: number,
    preferSceneAuthoredLayout = false,
  ): Node {
    // 旧场景可能还把固定根直接挂在 ContentRoot 下；分层初始化时复用后再重挂，避免生成重复节点。
    const existingNode =
      configuredNode?.isValid
        ? configuredNode
        : parentNode.getChildByName(fallbackName) ??
          (parentNode === this.node ? null : this.node.getChildByName(fallbackName));
    const mountedNode =
      existingNode ?? createLayerNode(parentNode, fallbackName, position, width, height);

    if (!existingNode) {
      this.runtimeFallbackNodes.add(mountedNode);
    }

    if (mountedNode.parent !== parentNode) {
      mountedNode.parent = parentNode;
    }

    if (!existingNode || !preferSceneAuthoredLayout || this.runtimeFallbackNodes.has(mountedNode)) {
      mountedNode.setPosition(position);
      const transform =
        mountedNode.getComponent(UITransform) ?? mountedNode.addComponent(UITransform);
      transform.setContentSize(width, height);
    }

    return mountedNode;
  }

  /**
   * 只清理基础视图自己管理的根节点内部内容。
   * 只删除运行时代码创建的 direct child，保留 Cocos 场景里已经预挂载好的稳定结构。
   */
  private clearManagedRootChildren(managedRoots: Node[]): void {
    for (const rootNode of managedRoots) {
      if (!rootNode.isValid) {
        continue;
      }

      for (const childNode of [...rootNode.children]) {
        if (!childNode.isValid) {
          continue;
        }

        if (!isRuntimeManagedNode(childNode)) {
          continue;
        }

        childNode.destroy();
      }
    }
  }

  /**
   * 获取挂在顶部提示根节点上的状态提示组件。
   * 新场景通过 Inspector 绑定，旧场景或测试场景则运行时兜底补齐。
   */
  private ensureStatusView(sheepStatusRoot: Node): MainSceneStatusView {
    if (this.statusView?.isValid && this.statusView.node.isValid) {
      return this.statusView;
    }

    const statusView =
      sheepStatusRoot.getComponent(MainSceneStatusView) ??
      sheepStatusRoot.addComponent(MainSceneStatusView);
    this.statusView = statusView;
    return statusView;
  }

  /**
   * 获取挂在调试控件根节点上的视图组件。
   * 新场景通过 Inspector 绑定，旧场景或测试场景则运行时兜底补齐。
   */
  private ensureDebugControlsView(
    debugControlsRoot: Node,
  ): MainSceneDebugControlsView {
    if (this.debugControlsView?.isValid && this.debugControlsView.node.isValid) {
      return this.debugControlsView;
    }

    const debugControlsView =
      debugControlsRoot.getComponent(MainSceneDebugControlsView) ??
      debugControlsRoot.addComponent(MainSceneDebugControlsView);
    this.debugControlsView = debugControlsView;
    return debugControlsView;
  }

  /**
   * 获取挂在 HUD 根节点上的视图组件。
   * 新场景通过 Inspector 绑定，旧场景或测试场景则运行时兜底补齐。
   */
  private ensureCoreHudView(coreHudRoot: Node): MainSceneHudView {
    if (this.coreHudView?.isValid && this.coreHudView.node.isValid) {
      return this.coreHudView;
    }

    const hudView =
      coreHudRoot.getComponent(MainSceneHudView) ??
      coreHudRoot.addComponent(MainSceneHudView);
    this.coreHudView = hudView;
    return hudView;
  }

  /**
   * 将当前可视尺寸同步到 Canvas、主场景根节点和正交相机。
   */
  private applyViewportToCanvas(viewportMetrics: MainSceneViewportMetrics): void {
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
}
