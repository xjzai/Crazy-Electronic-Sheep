import {
  _decorator,
  Camera,
  Color,
  Component,
  Label,
  Node,
  resources,
  SpriteFrame,
  UITransform,
  Vec3,
  view,
} from 'cc';
import { MainSceneHudView } from './MainSceneHudView';
import {
  createLabel,
  createLayerNode,
  createRect,
  createRoundedRect,
  createSpriteNode,
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
  sheepStatusLabel: Label;
  hudView: MainSceneHudView;
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
   * 场景中预挂载的背景根节点。
   * 兜底背景和真实地图背景都会生成在这里，避免直接污染 `ContentRoot`。
   */
  @property(Node)
  private backgroundRoot: Node | null = null;

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
   * 场景中预挂载的第一图羊表现挂点。
   * 羊实例节点由羊群视图动态维护，但根挂点位置由场景资产承载。
   */
  @property(Node)
  private sheepArtAnchor: Node | null = null;

  /**
   * 场景中预挂载的羊状态条根节点。
   * 当前状态徽章和文本仍运行时生成，后续可以拆为独立状态条组件。
   */
  @property(Node)
  private sheepStatusRoot: Node | null = null;

  /**
   * 场景中预挂载的调试控件根节点。
   * 目前只承载测试期“清档重开”按钮。
   */
  @property(Node)
  private debugControlsRoot: Node | null = null;

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

    createRect(
      mountedRoots.backgroundRoot,
      'FallbackBackground',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      viewportMetrics.height,
      new Color(24, 34, 44, 255),
      new Color(24, 34, 44, 255),
    );

    const backgroundArtLayer = createLayerNode(
      mountedRoots.backgroundRoot,
      'BackgroundArtLayer',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      backgroundDisplayHeight,
    );

    const hudView = this.ensureCoreHudView(mountedRoots.coreHudRoot);
    hudView.build({
      viewportWidth: viewportMetrics.width,
      mapVisibleHeight,
      layoutScale: viewportMetrics.layoutScale,
    });

    const sheepStatusBadge = createRoundedRect(
      mountedRoots.sheepStatusRoot,
      'SheepStatusBadge',
      new Vec3(0, 0, 0),
      scaleLayout(320),
      scaleLayout(44),
      scaleLayout(22),
      new Color(251, 252, 241, 230),
      new Color(101, 133, 61, 255),
      scaleLayout(3),
    );
    const sheepStatusLabel = createLabel(
      sheepStatusBadge,
      'SheepStatusLabel',
      '正在加载 001 羊素材…',
      scaleLayout(16),
      scaleLayout(284),
      scaleLayout(28),
      new Vec3(0, 0, 0),
      new Color(88, 69, 42, 255),
    );

    this.createClearSaveButton(
      mountedRoots.debugControlsRoot,
      scaleLayout,
      options.onClearSave,
    );

    return {
      viewportMetrics,
      sceneVisualNodes: {
        backgroundArtLayer,
        sheepArtAnchor: mountedRoots.sheepArtAnchor,
        sheepStatusLabel,
        hudView,
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
      const spriteFrame = await this.loadSpriteFrame(MAP_01_BACKGROUND_RESOURCE);
      createSpriteNode(
        backgroundArtLayer,
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
   * 测试期保留一个极简清档按钮，方便快速回到新档开局。
   * 这里只注册回调，不直接触碰业务状态或存档仓库。
   */
  private createClearSaveButton(
    debugControlsRoot: Node,
    scaleLayout: (value: number) => number,
    onClearSave: () => void,
  ): void {
    const clearSaveButton = createRoundedRect(
      debugControlsRoot,
      'ClearSaveButton',
      new Vec3(0, 0, 0),
      scaleLayout(128),
      scaleLayout(46),
      scaleLayout(18),
      new Color(255, 244, 236, 245),
      new Color(176, 88, 64, 255),
      scaleLayout(3),
    );
    createLabel(
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
    clearSaveButton.on(Node.EventType.TOUCH_END, onClearSave);
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
    const backgroundRoot = this.ensureMountedNode(
      this.backgroundRoot,
      'BackgroundRoot',
      new Vec3(0, 0, 0),
      viewportMetrics.width,
      Math.max(backgroundDisplayHeight, viewportMetrics.height),
    );
    const coreHudRoot = this.ensureMountedNode(
      this.coreHudRoot,
      'CoreHudRoot',
      new Vec3(0, 0, 10),
      viewportMetrics.width,
      mapVisibleHeight,
    );
    const sheepArtAnchor = this.ensureMountedNode(
      this.sheepArtAnchor,
      'SheepArtAnchor',
      new Vec3(0, scaleLayout(-275), 0),
      SHEEP_001_DISPLAY_WIDTH,
      SHEEP_001_DISPLAY_HEIGHT,
    );
    const sheepStatusRoot = this.ensureMountedNode(
      this.sheepStatusRoot,
      'SheepStatusRoot',
      new Vec3(0, scaleLayout(-430), 0),
      scaleLayout(320),
      scaleLayout(44),
    );
    const debugControlsRoot = this.ensureMountedNode(
      this.debugControlsRoot,
      'DebugControlsRoot',
      new Vec3(
        -Math.round(viewportMetrics.width / 2) + scaleLayout(84),
        -Math.round(viewportMetrics.height / 2) + scaleLayout(68),
        20,
      ),
      scaleLayout(128),
      scaleLayout(46),
    );

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
    fallbackName: string,
    position: Vec3,
    width: number,
    height: number,
  ): Node {
    const existingNode =
      configuredNode?.isValid ? configuredNode : this.node.getChildByName(fallbackName);
    const mountedNode =
      existingNode ?? createLayerNode(this.node, fallbackName, position, width, height);

    if (mountedNode.parent !== this.node) {
      mountedNode.parent = this.node;
    }

    mountedNode.setPosition(position);
    const transform =
      mountedNode.getComponent(UITransform) ?? mountedNode.addComponent(UITransform);
    transform.setContentSize(width, height);

    return mountedNode;
  }

  /**
   * 只清理基础视图自己管理的根节点内部内容。
   * 不再销毁 `ContentRoot` 的其他子节点，避免误删地图羊群层、招聘弹窗层等场景挂载组件。
   */
  private clearManagedRootChildren(managedRoots: Node[]): void {
    for (const rootNode of managedRoots) {
      if (rootNode.isValid) {
        rootNode.removeAllChildren();
      }
    }
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
