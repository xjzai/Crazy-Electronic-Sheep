import {
  _decorator,
  Color,
  Component,
  Label,
  Node,
  resources,
  SpriteFrame,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import { GAME_CONFIG } from '../config/gameConfig';
import { getMapSheepInstances, type GameState } from '../domain/gameStateSchema';
import {
  createLabel,
  createLayerNode,
  createRect,
  createSpriteNode,
} from './uiNodeFactory';

const { ccclass } = _decorator;

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

interface RecruitmentCardControls {
  artAnchor: Node;
  artNodeName: string;
  sheepNameLabel: Label;
  idleProductionLabel: Label;
  priceLabel: Label;
  purchaseButtonLabel: Label;
}

export interface MainSceneRecruitmentPanelBuildOptions {
  viewportWidth: number;
  viewportHeight: number;
  layoutScale: number;
  onToggleModal: () => void;
  onPurchase: () => void;
  onUnavailableAction: (message: string) => void;
}

export interface MainSceneRecruitmentPanelRefreshOptions {
  gameState: GameState;
  isModalVisible: boolean;
  latestFeedback: string;
  formatIdleEnergyValue: (value: number) => string;
}

/**
 * 主场景招聘入口与招聘弹窗组件。
 * 组件只负责展示与触摸回调，不直接修改业务状态或写入存档。
 */
@ccclass('MainSceneRecruitmentPanelView')
export class MainSceneRecruitmentPanelView extends Component {
  /**
   * 招聘弹窗根节点。
   * 控制器通过 `refresh` 传入的显示状态决定是否激活。
   */
  private recruitmentModalRoot: Node | null = null;

  /**
   * 第一张可购买招聘卡的控件句柄。
   */
  private primaryCardControls: RecruitmentCardControls | null = null;

  /**
   * 第二张预览招聘卡的控件句柄。
   */
  private secondaryCardControls: RecruitmentCardControls | null = null;

  /**
   * 当前地图容量文案。
   */
  private recruitmentCapacityLabel: Label | null = null;

  /**
   * 最近一次招聘反馈文案。
   */
  private recruitmentFeedbackLabel: Label | null = null;

  /**
   * 构建招聘入口按钮与弹窗节点树。
   * 输入是主场景尺寸和控制器回调，输出保存在组件字段中供后续刷新。
   */
  public build(options: MainSceneRecruitmentPanelBuildOptions): void {
    this.node.removeAllChildren();

    const scaleLayout = (value: number) => Math.round(value * options.layoutScale);
    const recruitButtonWidth = Math.min(
      scaleLayout(170),
      Math.round(options.viewportWidth * 0.24),
    );
    const recruitButtonHeight = this.calculateHeightByWidth(
      recruitButtonWidth,
      RECRUITMENT_MAIN_BUTTON_SOURCE_WIDTH,
      RECRUITMENT_MAIN_BUTTON_SOURCE_HEIGHT,
    );
    const recruitButtonX =
      Math.round(options.viewportWidth / 2) -
      scaleLayout(18) -
      Math.round(recruitButtonWidth / 2);
    const recruitButtonY = Math.max(
      -Math.round(options.viewportHeight / 2) +
        Math.round(recruitButtonHeight / 2) +
        scaleLayout(36),
      -Math.round(options.viewportHeight * 0.24),
    );
    const recruitButtonRoot = createLayerNode(
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
    recruitButtonRoot.on(Node.EventType.TOUCH_END, options.onToggleModal);

    const modalScale = Math.min(
      (options.viewportWidth - scaleLayout(56)) / RECRUITMENT_MODAL_FRAME_SOURCE_WIDTH,
      (options.viewportHeight - scaleLayout(150)) / RECRUITMENT_MODAL_FRAME_SOURCE_HEIGHT,
    );
    const modalWidth = Math.round(RECRUITMENT_MODAL_FRAME_SOURCE_WIDTH * modalScale);
    const modalHeight = Math.round(RECRUITMENT_MODAL_FRAME_SOURCE_HEIGHT * modalScale);
    const modalRoot = createLayerNode(
      this.node,
      'RecruitmentModalRoot',
      new Vec3(0, 0, 30),
      options.viewportWidth,
      options.viewportHeight,
    );
    modalRoot.active = false;
    modalRoot.on(Node.EventType.TOUCH_END, (event) => {
      event.propagationStopped = true;
    });

    const modalMask = createRect(
      modalRoot,
      'RecruitmentModalMask',
      new Vec3(0, 0, 0),
      options.viewportWidth,
      options.viewportHeight,
      new Color(12, 18, 18, 190),
      new Color(12, 18, 18, 0),
    );
    modalMask.on(Node.EventType.TOUCH_END, options.onToggleModal);

    const recruitmentPanel = createLayerNode(
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
    const closeButtonRoot = createLayerNode(
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
    closeButtonRoot.on(Node.EventType.TOUCH_END, options.onToggleModal);

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

    this.primaryCardControls = this.createRecruitmentCard({
      panel: recruitmentPanel,
      cardNodeName: 'RecruitmentPrimaryCard',
      cardY: primaryCardY,
      cardWidth,
      cardHeight,
      artAnchorWidth,
      artAnchorHeight,
      artNodeName: 'RecruitmentPrimaryCardArt',
      previewSheepId: '001',
      purchaseButtonWidth,
      purchaseButtonHeight,
      purchaseButtonIconSize,
      buttonOpacity: 255,
      onTouchEnd: options.onPurchase,
    });

    this.secondaryCardControls = this.createRecruitmentCard({
      panel: recruitmentPanel,
      cardNodeName: 'RecruitmentSecondaryCard',
      cardY: secondaryCardY,
      cardWidth,
      cardHeight,
      artAnchorWidth,
      artAnchorHeight,
      artNodeName: 'RecruitmentSecondaryCardArt',
      previewSheepId: SECONDARY_RECRUITMENT_PREVIEW_SHEEP_ID,
      purchaseButtonWidth,
      purchaseButtonHeight,
      purchaseButtonIconSize,
      buttonOpacity: 190,
      onTouchEnd: () => {
        options.onUnavailableAction('当前版本仅开放第一档招聘');
      },
    });

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
    const prevButtonRoot = createLayerNode(
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
    const nextButtonRoot = createLayerNode(
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
      options.onUnavailableAction('当前页只开放第一档招聘');
    });
    nextButtonRoot.on(Node.EventType.TOUCH_END, () => {
      options.onUnavailableAction('当前页只开放第一档招聘');
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

    this.recruitmentCapacityLabel = createLabel(
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
    this.recruitmentFeedbackLabel = createLabel(
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
  }

  /**
   * 刷新招聘卡、容量和反馈文案。
   * 返回当前应该同步到主场景状态条的反馈文本。
   */
  public refresh(options: MainSceneRecruitmentPanelRefreshOptions): string {
    const currentMapDefinition = GAME_CONFIG.maps[options.gameState.currentMapId];
    const currentMapSheepCount = getMapSheepInstances(
      options.gameState,
      options.gameState.currentMapId,
    ).length;
    const requestedSheepId = currentMapDefinition.defaultPurchasableSheepIds[0];
    const fallbackMessage = requestedSheepId
      ? `当前羊数 ${currentMapSheepCount}/${currentMapDefinition.maxSheepCapacity}`
      : '当前地图招聘入口尚未开放';
    const feedbackMessage = options.latestFeedback || fallbackMessage;

    if (this.recruitmentModalRoot?.isValid) {
      this.recruitmentModalRoot.active = options.isModalVisible;
    }

    if (this.primaryCardControls) {
      this.refreshRecruitmentCardContent(
        requestedSheepId,
        this.primaryCardControls,
        {
          unavailableName: '当前地图未开放招聘',
          unavailableIdleProduction: '--',
          unavailablePrice: '当前地图暂未开放招聘',
          unavailableButton: '暂未开放',
          availablePricePrefix: '当前开放 · 消耗',
          availableButtonPrefix: '购买',
        },
        options.formatIdleEnergyValue,
      );
    }

    if (this.secondaryCardControls) {
      this.refreshRecruitmentCardContent(
        SECONDARY_RECRUITMENT_PREVIEW_SHEEP_ID,
        this.secondaryCardControls,
        {
          unavailableName: '后续档位',
          unavailableIdleProduction: '--',
          unavailablePrice: '当前版本仅开放第一档招聘',
          unavailableButton: '敬请期待',
          availablePricePrefix: '后续开放 · 消耗',
          availableButtonPrefix: '购买',
        },
        options.formatIdleEnergyValue,
      );
    }

    if (this.recruitmentCapacityLabel) {
      this.recruitmentCapacityLabel.string =
        `当前羊数 ${currentMapSheepCount}/${currentMapDefinition.maxSheepCapacity}`;
    }
    if (this.recruitmentFeedbackLabel) {
      this.recruitmentFeedbackLabel.string = feedbackMessage;
    }

    return feedbackMessage;
  }

  private createRecruitmentCard(options: {
    panel: Node;
    cardNodeName: string;
    cardY: number;
    cardWidth: number;
    cardHeight: number;
    artAnchorWidth: number;
    artAnchorHeight: number;
    artNodeName: string;
    previewSheepId: string;
    purchaseButtonWidth: number;
    purchaseButtonHeight: number;
    purchaseButtonIconSize: number;
    buttonOpacity: number;
    onTouchEnd: () => void;
  }): RecruitmentCardControls {
    const cardRoot = createLayerNode(
      options.panel,
      options.cardNodeName,
      new Vec3(0, options.cardY, 2),
      options.cardWidth,
      options.cardHeight,
    );
    this.attachSpriteByResource(
      cardRoot,
      `${options.cardNodeName}Sprite`,
      RECRUITMENT_LIST_ITEM_RESOURCE,
      new Vec3(0, 0, 0),
      options.cardWidth,
      options.cardHeight,
    );

    const artAnchor = createLayerNode(
      cardRoot,
      `${options.cardNodeName}ArtAnchor`,
      new Vec3(-Math.round(options.cardWidth * 0.24), 0, 1),
      options.artAnchorWidth,
      options.artAnchorHeight,
    );
    const artDefinition = this.getRecruitmentCardArtResource(options.previewSheepId);
    this.attachRecruitmentCardArt(
      artAnchor,
      options.artNodeName,
      artDefinition.resourcePath,
      artDefinition.sourceWidth,
      artDefinition.sourceHeight,
      options.artAnchorWidth,
      options.artAnchorHeight,
    );

    const sheepNameLabel = createLabel(
      cardRoot,
      `${options.cardNodeName}SheepNameLabel`,
      `${options.previewSheepId} 预览羊`,
      Math.max(18, Math.round(options.cardHeight * 1)),
      Math.round(options.cardWidth * 0.5),
      Math.round(options.cardHeight * 0.15),
      new Vec3(Math.round(options.cardWidth * 0.25), Math.round(options.cardHeight * 0.3), 1),
      new Color(72, 102, 33, 255),
      Label.HorizontalAlign.LEFT,
      true,
    );
    this.attachSpriteByResource(
      cardRoot,
      `${options.cardNodeName}IdleIcon`,
      IDLE_ENERGY_ICON_RESOURCE,
      new Vec3(Math.round(options.cardWidth * 0.10), Math.round(options.cardHeight * 0.1), 1),
      Math.round(options.cardHeight * 0.15),
      Math.round(options.cardHeight * 0.15),
      1,
    );
    const idleProductionLabel = createLabel(
      cardRoot,
      `${options.cardNodeName}IdleProductionLabel`,
      '+1/秒',
      Math.max(16, Math.round(options.cardHeight * 1)),
      Math.round(options.cardWidth * 0.24),
      Math.round(options.cardHeight * 0.10),
      new Vec3(Math.round(options.cardWidth * 0.27), Math.round(options.cardHeight * 0.1), 1),
      new Color(132, 112, 42, 255),
      Label.HorizontalAlign.LEFT,
      true,
    );
    const priceLabel = createLabel(
      cardRoot,
      `${options.cardNodeName}PriceLabel`,
      '消耗 10',
      Math.max(14, Math.round(options.cardHeight * 0.08)),
      Math.round(options.cardWidth * 0.36),
      Math.round(options.cardHeight * 0.10),
      new Vec3(Math.round(options.cardWidth * 0.16), -Math.round(options.cardHeight * 0.20), 1),
      new Color(112, 93, 44, 255),
      Label.HorizontalAlign.LEFT,
      true,
    );

    const purchaseButtonRoot = createLayerNode(
      cardRoot,
      `${options.cardNodeName}PurchaseButton`,
      new Vec3(
        Math.round(options.cardWidth * 0.20),
        -Math.round(options.cardHeight * 0.22),
        1,
      ),
      options.purchaseButtonWidth,
      options.purchaseButtonHeight,
    );
    this.attachSpriteByResource(
      purchaseButtonRoot,
      `${options.cardNodeName}PurchaseButtonSprite`,
      RECRUITMENT_PURCHASE_BUTTON_RESOURCE,
      new Vec3(0, 0, 0),
      options.purchaseButtonWidth,
      options.purchaseButtonHeight,
    );
    if (options.buttonOpacity < 255) {
      purchaseButtonRoot.addComponent(UIOpacity).opacity = options.buttonOpacity;
    }
    this.attachSpriteByResource(
      purchaseButtonRoot,
      `${options.cardNodeName}PurchaseButtonIcon`,
      IDLE_ENERGY_ICON_RESOURCE,
      new Vec3(-Math.round(options.purchaseButtonWidth * 0.33), 6, 1),
      options.purchaseButtonIconSize,
      options.purchaseButtonIconSize,
      1,
    );
    const purchaseButtonLabel = createLabel(
      purchaseButtonRoot,
      `${options.cardNodeName}PurchaseButtonLabel`,
      '购买 10',
      Math.max(16, Math.round(options.purchaseButtonHeight * 0.35)),
      Math.round(options.purchaseButtonWidth * 0.68),
      Math.round(options.purchaseButtonHeight * 0.52),
      new Vec3(Math.round(options.purchaseButtonWidth * 0.2), 3, 1),
      new Color(255, 251, 232, 255),
      Label.HorizontalAlign.LEFT,
      true,
    );
    purchaseButtonRoot.on(Node.EventType.TOUCH_END, options.onTouchEnd);

    return {
      artAnchor,
      artNodeName: options.artNodeName,
      sheepNameLabel,
      idleProductionLabel,
      priceLabel,
      purchaseButtonLabel,
    };
  }

  private refreshRecruitmentCardContent(
    sheepId: string | undefined,
    controls: RecruitmentCardControls,
    copy: {
      unavailableName: string;
      unavailableIdleProduction: string;
      unavailablePrice: string;
      unavailableButton: string;
      availablePricePrefix: string;
      availableButtonPrefix: string;
    },
    formatIdleEnergyValue: (value: number) => string,
  ): void {
    this.refreshRecruitmentCardArt(controls.artAnchor, controls.artNodeName, sheepId);

    const sheepDefinition = sheepId ? GAME_CONFIG.sheepDefinitions[sheepId] : undefined;
    if (!sheepId || !sheepDefinition) {
      controls.sheepNameLabel.string = copy.unavailableName;
      controls.idleProductionLabel.string = copy.unavailableIdleProduction;
      controls.priceLabel.string = copy.unavailablePrice;
      controls.purchaseButtonLabel.string = copy.unavailableButton;
      return;
    }

    controls.sheepNameLabel.string = `${sheepId} ${sheepDefinition.displayName}`;
    controls.idleProductionLabel.string =
      `+${formatIdleEnergyValue(sheepDefinition.idleEnergyPerSecond)}/秒`;
    controls.priceLabel.string =
      `${copy.availablePricePrefix} ${formatIdleEnergyValue(
        sheepDefinition.purchaseIdleEnergyCost,
      )}`;
    controls.purchaseButtonLabel.string =
      `${copy.availableButtonPrefix} ${formatIdleEnergyValue(
        sheepDefinition.purchaseIdleEnergyCost,
      )}`;
  }

  private refreshRecruitmentCardArt(
    artAnchor: Node,
    artNodeName: string,
    requestedSheepId: string | undefined,
  ): void {
    if (!artAnchor.isValid) {
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
        const sprite = createSpriteNode(parent, name, spriteFrame, position, width, height);
        sprite.node.setSiblingIndex(siblingIndex);
      })
      .catch((error) => {
        console.error(`[MainSceneRecruitmentPanelView] sprite load failed: ${resourcePath}`, error);
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

  private calculateHeightByWidth(
    displayWidth: number,
    sourceWidth: number,
    sourceHeight: number,
  ): number {
    return Math.round((displayWidth * sourceHeight) / sourceWidth);
  }
}
