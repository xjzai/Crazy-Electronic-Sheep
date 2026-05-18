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
  createHudPanelLayers,
  createLabel,
  createLayerNode,
  createSpriteNode,
} from './uiNodeFactory';

const { ccclass } = _decorator;

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
   * 摸鱼能量总量文本节点。
   * 由 `refresh` 接收上层格式化后的字符串，不直接读取业务状态。
   */
  private idleEnergyValueLabel: Label | null = null;

  /**
   * 全局每秒产出文本节点。
   */
  private globalIdleEnergyPerSecondValueLabel: Label | null = null;

  /**
   * 羊钻占位文本节点。
   */
  private sheepDiamondValueLabel: Label | null = null;

  /**
   * 摸鱼能量 HUD 贴图挂点。
   */
  private idleEnergyHudSpriteAnchor: Node | null = null;

  /**
   * 羊钻 HUD 贴图挂点。
   */
  private sheepDiamondHudSpriteAnchor: Node | null = null;

  /**
   * 构建顶部 HUD 节点树。
   * 输入是主场景计算好的可视尺寸，输出通过组件字段保留刷新句柄。
   */
  public build(options: MainSceneHudViewBuildOptions): void {
    this.node.removeAllChildren();

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

    const idleEnergyHud = createHudPanelLayers(
      this.node,
      'IdleEnergyHud',
      new Vec3(idleEnergyHudX, diamondHudY, 0),
      idleEnergyHudWidth,
      idleEnergyHudHeight,
    );
    this.idleEnergyHudSpriteAnchor = idleEnergyHud.spriteAnchor;
    this.idleEnergyValueLabel = createLabel(
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
    this.globalIdleEnergyPerSecondValueLabel = createLabel(
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

    const sheepDiamondHud = createHudPanelLayers(
      this.node,
      'HighestUnlockedHud',
      new Vec3(diamondHudX, diamondHudY, 0),
      diamondHudWidth,
      diamondHudHeight,
    );
    this.sheepDiamondHudSpriteAnchor = sheepDiamondHud.spriteAnchor;
    this.sheepDiamondValueLabel = createLabel(
      sheepDiamondHud.labelLayer,
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
