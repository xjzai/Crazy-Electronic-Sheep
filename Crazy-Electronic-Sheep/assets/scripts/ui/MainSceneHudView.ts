import {
  _decorator,
  Color,
  Component,
  Label,
  Node,
  resources,
  SpriteFrame,
  UITransform,
  Vec3,
} from 'cc';
import {
  createLayerNode,
  createSpriteNode,
} from './uiNodeFactory';

const { ccclass, property } = _decorator;

const IDLE_ENERGY_HUD_SOURCE_WIDTH = 1774;
const IDLE_ENERGY_HUD_SOURCE_HEIGHT = 500;
const SHEEP_DIAMOND_HUD_SOURCE_WIDTH = 1900;
const SHEEP_DIAMOND_HUD_SOURCE_HEIGHT = 682;
const IDLE_ENERGY_HUD_RESOURCE = 'ui/idle_energy_hud_panel/spriteFrame';
const SHEEP_DIAMOND_HUD_RESOURCE = 'ui/sheep_diamond_hud_panel/spriteFrame';

export interface MainSceneHudViewBuildOptions {
  viewportWidth: number;
  mapVisibleHeight: number;
  layoutScale: number;
}

export interface MainSceneHudViewModel {
  idleEnergyText: string;
  globalIdleEnergyPerSecondText: string;
  sheepDiamondText: string;
}

/**
 * 主场景顶部 HUD 组件。
 * 只负责创建和刷新 HUD 可视节点，不保存业务真值。
 */
@ccclass('MainSceneHudView')
export class MainSceneHudView extends Component {
  /**
   * 摸鱼能量 HUD 面板根节点。
   * 新场景通过 Inspector 绑定，旧场景缺失时按同名节点兜底创建。
   */
  @property(Node)
  private idleEnergyHudRoot: Node | null = null;

  /**
   * 摸鱼能量 HUD 面板贴图挂点。
   * 异步加载到的面板 Sprite 会作为它的子节点挂入。
   */
  @property(Node)
  private idleEnergyHudSpriteAnchor: Node | null = null;

  /**
   * 摸鱼能量 HUD 文本层。
   * 资源数值和秒产文本都挂在这一层，确保贴图异步加载不会盖住文字。
   */
  @property(Node)
  private idleEnergyHudLabelLayer: Node | null = null;

  /**
   * 摸鱼能量总量文本节点。
   * 由 `refresh` 接收上层格式化后的字符串，不直接读取业务状态。
   */
  @property(Label)
  private idleEnergyValueLabel: Label | null = null;

  /**
   * 全局每秒产出文本节点。
   */
  @property(Label)
  private globalIdleEnergyPerSecondValueLabel: Label | null = null;

  /**
   * 羊钻 HUD 面板根节点。
   * 当前只展示占位羊钻数值，后续科技系统接入后继续复用。
   */
  @property(Node)
  private sheepDiamondHudRoot: Node | null = null;

  /**
   * 羊钻 HUD 面板贴图挂点。
   */
  @property(Node)
  private sheepDiamondHudSpriteAnchor: Node | null = null;

  /**
   * 羊钻 HUD 文本层。
   */
  @property(Node)
  private sheepDiamondHudLabelLayer: Node | null = null;

  /**
   * 羊钻占位文本节点。
   */
  @property(Label)
  private sheepDiamondValueLabel: Label | null = null;

  /**
   * 构建顶部 HUD 节点树。
   * 输入是主场景计算好的可视尺寸，输出通过组件字段保留刷新句柄。
   */
  public build(options: MainSceneHudViewBuildOptions): void {
    const scaleLayout = (value: number) => Math.round(value * options.layoutScale);
    const sidePadding = scaleLayout(16);
    const topPadding = scaleLayout(16);
    const panelGap = scaleLayout(10);
    const targetIdleEnergyHudWidth = scaleLayout(300);
    const targetDiamondHudWidth = scaleLayout(180);
    const availableHudWidth = Math.max(
      1,
      options.viewportWidth - sidePadding * 2 - panelGap,
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
      -Math.round(options.viewportWidth / 2) +
      sidePadding +
      Math.round(diamondHudWidth / 2);
    const diamondHudY =
      Math.round(options.mapVisibleHeight / 2) -
      topPadding -
      Math.round(diamondHudHeight / 2);
    const idleEnergyHudX =
      diamondHudX +
      Math.round(diamondHudWidth / 2) +
      scaledHudGap +
      Math.round(idleEnergyHudWidth / 2);
    const hudTextScale = Math.max(0.72, hudFitScale);

    this.idleEnergyHudRoot = this.ensureMountedNode(
      this.idleEnergyHudRoot,
      this.node,
      'IdleEnergyHud',
      new Vec3(idleEnergyHudX, diamondHudY, 0),
      idleEnergyHudWidth,
      idleEnergyHudHeight,
    );
    this.idleEnergyHudSpriteAnchor = this.ensureMountedNode(
      this.idleEnergyHudSpriteAnchor,
      this.idleEnergyHudRoot,
      'IdleEnergyHudSpriteAnchor',
      new Vec3(0, 0, 0),
      idleEnergyHudWidth,
      idleEnergyHudHeight,
    );
    this.idleEnergyHudLabelLayer = this.ensureMountedNode(
      this.idleEnergyHudLabelLayer,
      this.idleEnergyHudRoot,
      'IdleEnergyHudLabelLayer',
      new Vec3(0, 0, 0),
      idleEnergyHudWidth,
      idleEnergyHudHeight,
    );
    this.idleEnergyHudLabelLayer.setSiblingIndex(1);

    this.idleEnergyValueLabel = this.ensureMountedLabel(
      this.idleEnergyValueLabel,
      this.idleEnergyHudLabelLayer,
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
    this.globalIdleEnergyPerSecondValueLabel = this.ensureMountedLabel(
      this.globalIdleEnergyPerSecondValueLabel,
      this.idleEnergyHudLabelLayer,
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

    this.sheepDiamondHudRoot = this.ensureMountedNode(
      this.sheepDiamondHudRoot,
      this.node,
      'HighestUnlockedHud',
      new Vec3(diamondHudX, diamondHudY, 0),
      diamondHudWidth,
      diamondHudHeight,
    );
    this.sheepDiamondHudRoot.setSiblingIndex(0);
    this.idleEnergyHudRoot.setSiblingIndex(1);
    this.sheepDiamondHudSpriteAnchor = this.ensureMountedNode(
      this.sheepDiamondHudSpriteAnchor,
      this.sheepDiamondHudRoot,
      'HighestUnlockedHudSpriteAnchor',
      new Vec3(0, 0, 0),
      diamondHudWidth,
      diamondHudHeight,
    );
    this.sheepDiamondHudLabelLayer = this.ensureMountedNode(
      this.sheepDiamondHudLabelLayer,
      this.sheepDiamondHudRoot,
      'HighestUnlockedHudLabelLayer',
      new Vec3(0, 0, 0),
      diamondHudWidth,
      diamondHudHeight,
    );
    this.sheepDiamondHudLabelLayer.setSiblingIndex(1);

    this.sheepDiamondValueLabel = this.ensureMountedLabel(
      this.sheepDiamondValueLabel,
      this.sheepDiamondHudLabelLayer,
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
  }

  /**
   * 刷新 HUD 文案。
   * 上层传入的是展示字符串，因此该组件不参与资源、秒产等业务计算。
   */
  public refresh(viewModel: MainSceneHudViewModel): void {
    if (this.idleEnergyValueLabel) {
      this.idleEnergyValueLabel.string = viewModel.idleEnergyText;
    }

    if (this.globalIdleEnergyPerSecondValueLabel) {
      this.globalIdleEnergyPerSecondValueLabel.string =
        viewModel.globalIdleEnergyPerSecondText;
    }

    if (this.sheepDiamondValueLabel) {
      this.sheepDiamondValueLabel.string = viewModel.sheepDiamondText;
    }
  }

  /**
   * 异步挂载 HUD 面板贴图。
   * 单个贴图失败只记录日志，避免 HUD 文本和主场景被阻塞。
   */
  public async attachPanelSprites(): Promise<void> {
    await Promise.all([
      this.attachHudPanelSprite(
        this.idleEnergyHudSpriteAnchor,
        IDLE_ENERGY_HUD_RESOURCE,
        'IdleEnergyHudSprite',
      ),
      this.attachHudPanelSprite(
        this.sheepDiamondHudSpriteAnchor,
        SHEEP_DIAMOND_HUD_RESOURCE,
        'HighestUnlockedHudSprite',
      ),
    ]);
  }

  private async attachHudPanelSprite(
    spriteAnchor: Node | null,
    resourcePath: string,
    spriteNodeName: string,
  ): Promise<void> {
    if (!spriteAnchor?.isValid) {
      return;
    }

    try {
      const spriteFrame = await this.loadSpriteFrame(resourcePath);
      spriteAnchor.getChildByName(spriteNodeName)?.destroy();
      const spriteTransform = spriteAnchor.getComponent(UITransform);
      const spriteWidth = spriteTransform?.contentSize.width ?? 0;
      const spriteHeight = spriteTransform?.contentSize.height ?? 0;
      createSpriteNode(
        spriteAnchor,
        spriteNodeName,
        spriteFrame,
        new Vec3(0, 0, 0),
        spriteWidth,
        spriteHeight,
      );
    } catch (error) {
      console.error(`[MainSceneHudView] hud panel load failed: ${resourcePath}`, error);
    }
  }

  /**
   * 查找或创建一个 HUD 固定节点，并同步位置和 UI 尺寸。
   * 这里不清空父节点，避免破坏用户在场景层级里手动挂载的子节点。
   */
  private ensureMountedNode(
    configuredNode: Node | null,
    parent: Node,
    nodeName: string,
    position: Vec3,
    width: number,
    height: number,
  ): Node {
    const existingNode =
      configuredNode?.isValid ? configuredNode : parent.getChildByName(nodeName);
    const mountedNode =
      existingNode ?? createLayerNode(parent, nodeName, position, width, height);

    if (mountedNode.parent !== parent) {
      mountedNode.parent = parent;
    }

    mountedNode.setPosition(position);
    const transform =
      mountedNode.getComponent(UITransform) ?? mountedNode.addComponent(UITransform);
    transform.setContentSize(width, height);

    return mountedNode;
  }

  /**
   * 查找或创建一个 HUD 文本组件，并同步它的展示参数。
   * 文本内容由 `refresh` 后续覆盖，`defaultText` 只用于首次构建时兜底。
   */
  private ensureMountedLabel(
    configuredLabel: Label | null,
    parent: Node,
    nodeName: string,
    defaultText: string,
    fontSize: number,
    width: number,
    height: number,
    position: Vec3,
    color: Color,
    horizontalAlign: number,
    isBold: boolean,
  ): Label {
    const existingLabel =
      configuredLabel?.isValid && configuredLabel.node.isValid
        ? configuredLabel
        : parent.getChildByName(nodeName)?.getComponent(Label) ?? null;
    const labelNode =
      existingLabel?.node ?? createLayerNode(parent, nodeName, position, width, height);

    if (labelNode.parent !== parent) {
      labelNode.parent = parent;
    }

    labelNode.setPosition(position);
    const transform =
      labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
    transform.setContentSize(width, height);

    const label = existingLabel ?? labelNode.addComponent(Label);
    label.string = defaultText;
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
