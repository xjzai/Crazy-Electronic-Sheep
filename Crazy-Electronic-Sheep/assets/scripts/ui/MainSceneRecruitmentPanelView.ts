import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
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
import { createLayerNode, ensureSpriteNode } from './uiNodeFactory';

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
  purchaseButtonRoot: Node;
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
  formatIdleEnergyValue: (value: number) => string;
}

/**
 * 主场景招聘入口与招聘弹窗组件。
 * 布局优先由 Cocos 场景承载；只有旧场景缺节点时，才回退到运行时默认结构。
 */
@ccclass('MainSceneRecruitmentPanelView')
export class MainSceneRecruitmentPanelView extends Component {
  /**
   * 记录哪些招聘 UI 节点是运行时兜底创建的。
   * 这些节点在后续 rebuild 时仍应继续吃 TS 默认布局，而不是被冻结为场景值。
   */
  private readonly runtimeFallbackNodes = new WeakSet<Node>();

  /**
   * 招聘入口按钮根节点。
   */
  private recruitButtonRoot: Node | null = null;

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
   * 当前弹窗开关回调。
   */
  private onToggleModalAction: (() => void) | null = null;

  /**
   * 当前购买回调。
   */
  private onPurchaseAction: (() => void) | null = null;

  /**
   * 当前“暂未开放”回调。
   */
  private onUnavailableAction: ((message: string) => void) | null = null;

  /**
   * 拦截触摸冒泡，避免点击弹窗内容时被外层遮罩处理。
   */
  private readonly stopTouchPropagation = (event: EventTouch): void => {
    event.propagationStopped = true;
  };

  /**
   * 打开或关闭招聘弹窗。
   */
  private readonly handleToggleModalTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.onToggleModalAction?.();
  };

  /**
   * 触发第一档招聘购买。
   */
  private readonly handlePurchaseTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.onPurchaseAction?.();
  };

  /**
   * 统一处理当前版本未开放的招聘入口。
   */
  private readonly handleUnavailableTouchEnd = (event: EventTouch): void => {
    event.propagationStopped = true;
    this.onUnavailableAction?.('当前版本仅开放第一档招聘');
  };

  /**
   * 构建招聘入口按钮与弹窗节点树。
   * 输入是主场景尺寸和控制器回调，输出保存在组件字段中供后续刷新。
   */
  public build(options: MainSceneRecruitmentPanelBuildOptions): void {
    this.onToggleModalAction = options.onToggleModal;
    this.onPurchaseAction = options.onPurchase;
    this.onUnavailableAction = options.onUnavailableAction;

    const rootTransform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    rootTransform.setContentSize(options.viewportWidth, options.viewportHeight);

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
    this.recruitButtonRoot = this.ensureMountedNode(
      this.recruitButtonRoot,
      this.node,
      'RecruitButton',
      new Vec3(recruitButtonX, recruitButtonY, 20),
      recruitButtonWidth,
      recruitButtonHeight,
      true,
    );
    this.attachSpriteByResource(
      this.recruitButtonRoot,
      'RecruitButtonSprite',
      RECRUITMENT_MAIN_BUTTON_RESOURCE,
      new Vec3(0, 0, 0),
      recruitButtonWidth,
      recruitButtonHeight,
      0,
      true,
    );
    this.bindTouchEnd(this.recruitButtonRoot, this.handleToggleModalTouchEnd);

    const modalScale = Math.min(
      (options.viewportWidth - scaleLayout(56)) / RECRUITMENT_MODAL_FRAME_SOURCE_WIDTH,
      (options.viewportHeight - scaleLayout(150)) / RECRUITMENT_MODAL_FRAME_SOURCE_HEIGHT,
    );
    const modalWidth = Math.round(RECRUITMENT_MODAL_FRAME_SOURCE_WIDTH * modalScale);
    const modalHeight = Math.round(RECRUITMENT_MODAL_FRAME_SOURCE_HEIGHT * modalScale);
    this.recruitmentModalRoot = this.ensureMountedNode(
      this.recruitmentModalRoot,
      this.node,
      'RecruitmentModalRoot',
      new Vec3(0, 0, 30),
      options.viewportWidth,
      options.viewportHeight,
      true,
    );
    this.recruitmentModalRoot.active = false;
    this.bindTouchEnd(this.recruitmentModalRoot, this.stopTouchPropagation);

    const modalMask = this.ensureMountedNode(
      null,
      this.recruitmentModalRoot,
      'RecruitmentModalMask',
      new Vec3(0, 0, 0),
      options.viewportWidth,
      options.viewportHeight,
      true,
    );
    this.ensureModalMaskGraphics(modalMask);
    this.bindTouchEnd(modalMask, this.handleToggleModalTouchEnd);

    const recruitmentPanel = this.ensureMountedNode(
      null,
      this.recruitmentModalRoot,
      'RecruitmentPanel',
      new Vec3(0, scaleLayout(-18), 1),
      modalWidth,
      modalHeight,
      true,
    );
    this.bindTouchEnd(recruitmentPanel, this.stopTouchPropagation);
    this.attachSpriteByResource(
      recruitmentPanel,
      'RecruitmentPanelFrame',
      RECRUITMENT_MODAL_FRAME_RESOURCE,
      new Vec3(0, 0, 0),
      modalWidth,
      modalHeight,
      0,
      true,
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
      true,
    );

    const closeButtonWidth = Math.round(modalWidth * 0.15);
    const closeButtonHeight = this.calculateHeightByWidth(
      closeButtonWidth,
      RECRUITMENT_CLOSE_BUTTON_SOURCE_WIDTH,
      RECRUITMENT_CLOSE_BUTTON_SOURCE_HEIGHT,
    );
    const closeButtonRoot = this.ensureMountedNode(
      null,
      recruitmentPanel,
      'RecruitmentCloseButton',
      new Vec3(
        Math.round(modalWidth / 2) - Math.round(closeButtonWidth * 0.53),
        Math.round(modalHeight / 2) - Math.round(modalHeight * 0.07),
        2,
      ),
      closeButtonWidth,
      closeButtonHeight,
      true,
    );
    this.attachSpriteByResource(
      closeButtonRoot,
      'RecruitmentCloseButtonSprite',
      RECRUITMENT_CLOSE_BUTTON_RESOURCE,
      new Vec3(0, 0, 0),
      closeButtonWidth,
      closeButtonHeight,
      0,
      true,
    );
    this.bindTouchEnd(closeButtonRoot, this.handleToggleModalTouchEnd);

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

    this.primaryCardControls = this.ensureRecruitmentCard({
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
      onTouchEnd: this.handlePurchaseTouchEnd,
    });

    this.secondaryCardControls = this.ensureRecruitmentCard({
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
      onTouchEnd: this.handleUnavailableTouchEnd,
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
    const prevButtonRoot = this.ensureMountedNode(
      null,
      recruitmentPanel,
      'RecruitmentPrevPageButton',
      new Vec3(-Math.round(modalWidth * 0.48), pageButtonY, 2),
      pageButtonWidth,
      prevButtonHeight,
      true,
    );
    this.attachSpriteByResource(
      prevButtonRoot,
      'RecruitmentPrevPageButtonSprite',
      RECRUITMENT_PAGE_PREV_RESOURCE,
      new Vec3(0, 0, 0),
      pageButtonWidth,
      prevButtonHeight,
      0,
      true,
    );
    this.bindTouchEnd(prevButtonRoot, this.handleUnavailableTouchEnd);

    const nextButtonRoot = this.ensureMountedNode(
      null,
      recruitmentPanel,
      'RecruitmentNextPageButton',
      new Vec3(Math.round(modalWidth * 0.46), pageButtonY, 2),
      pageButtonWidth,
      nextButtonHeight,
      true,
    );
    this.attachSpriteByResource(
      nextButtonRoot,
      'RecruitmentNextPageButtonSprite',
      RECRUITMENT_PAGE_NEXT_RESOURCE,
      new Vec3(0, 0, 0),
      pageButtonWidth,
      nextButtonHeight,
      0,
      true,
    );
    this.bindTouchEnd(nextButtonRoot, this.handleUnavailableTouchEnd);

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
      true,
    );

    this.recruitmentCapacityLabel = this.ensureMountedLabel(
      this.recruitmentCapacityLabel,
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
      true,
    );
  }

  /**
   * 刷新招聘卡、容量和弹窗显隐。
   * 反馈提示已经统一上收至主场景顶部飘字，因此弹窗底部不再保留独立反馈文案。
   */
  public refresh(options: MainSceneRecruitmentPanelRefreshOptions): void {
    const currentMapDefinition = GAME_CONFIG.maps[options.gameState.currentMapId];
    const currentMapSheepCount = getMapSheepInstances(
      options.gameState,
      options.gameState.currentMapId,
    ).length;
    const requestedSheepId = currentMapDefinition.defaultPurchasableSheepIds[0];

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
  }

  /**
   * 查找或创建一张招聘卡，并把固定布局节点都收口到场景或运行时兜底结构里。
   */
  private ensureRecruitmentCard(options: {
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
    onTouchEnd: (event: EventTouch) => void;
  }): RecruitmentCardControls {
    const cardRoot = this.ensureMountedNode(
      null,
      options.panel,
      options.cardNodeName,
      new Vec3(0, options.cardY, 2),
      options.cardWidth,
      options.cardHeight,
      true,
    );
    this.attachSpriteByResource(
      cardRoot,
      `${options.cardNodeName}Sprite`,
      RECRUITMENT_LIST_ITEM_RESOURCE,
      new Vec3(0, 0, 0),
      options.cardWidth,
      options.cardHeight,
      0,
      true,
    );

    const artAnchor = this.ensureMountedNode(
      null,
      cardRoot,
      `${options.cardNodeName}ArtAnchor`,
      new Vec3(-Math.round(options.cardWidth * 0.24), 0, 1),
      options.artAnchorWidth,
      options.artAnchorHeight,
      true,
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

    const sheepNameLabel = this.ensureMountedLabel(
      null,
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
      true,
    );
    const idleProductionLabel = this.ensureMountedLabel(
      null,
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
      true,
    );
    const priceLabel = this.ensureMountedLabel(
      null,
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
      true,
    );

    const purchaseButtonRoot = this.ensureMountedNode(
      null,
      cardRoot,
      `${options.cardNodeName}PurchaseButton`,
      new Vec3(
        Math.round(options.cardWidth * 0.20),
        -Math.round(options.cardHeight * 0.22),
        1,
      ),
      options.purchaseButtonWidth,
      options.purchaseButtonHeight,
      true,
    );
    this.attachSpriteByResource(
      purchaseButtonRoot,
      `${options.cardNodeName}PurchaseButtonSprite`,
      RECRUITMENT_PURCHASE_BUTTON_RESOURCE,
      new Vec3(0, 0, 0),
      options.purchaseButtonWidth,
      options.purchaseButtonHeight,
      0,
      true,
    );
    this.ensureNodeOpacity(purchaseButtonRoot, options.buttonOpacity);
    this.attachSpriteByResource(
      purchaseButtonRoot,
      `${options.cardNodeName}PurchaseButtonIcon`,
      IDLE_ENERGY_ICON_RESOURCE,
      new Vec3(-Math.round(options.purchaseButtonWidth * 0.33), 6, 1),
      options.purchaseButtonIconSize,
      options.purchaseButtonIconSize,
      1,
      true,
    );
    const purchaseButtonLabel = this.ensureMountedLabel(
      null,
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
      true,
    );
    this.bindTouchEnd(purchaseButtonRoot, options.onTouchEnd);

    return {
      artAnchor,
      artNodeName: options.artNodeName,
      sheepNameLabel,
      idleProductionLabel,
      priceLabel,
      purchaseButtonLabel,
      purchaseButtonRoot,
    };
  }

  /**
   * 刷新一张招聘卡的文案和卡面资源。
   */
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

  /**
   * 根据当前招聘卡展示的羊编号刷新卡面贴图。
   */
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

  /**
   * 返回招聘卡当前应该展示的羊卡资源。
   */
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

  /**
   * 以卡面锚点为边界刷新招聘卡展示图。
   * 该贴图尺寸依赖羊卡资源比例，因此保持运行时动态计算。
   */
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
      0,
      false,
    );
  }

  /**
   * 统一绑定一个 TOUCH_END 事件，避免重复 build 时叠加回调。
   */
  private bindTouchEnd(
    node: Node,
    handler: (event: EventTouch) => void,
  ): void {
    node.off(Node.EventType.TOUCH_END, handler, this);
    node.on(Node.EventType.TOUCH_END, handler, this);
  }

  /**
   * 查找或创建一个招聘 UI 固定节点，并在旧场景缺节点时使用运行时布局兜底。
   */
  private ensureMountedNode(
    configuredNode: Node | null,
    parent: Node,
    nodeName: string,
    position: Vec3,
    width: number,
    height: number,
    preferSceneAuthoredLayout = false,
  ): Node {
    const existingNode =
      configuredNode?.isValid ? configuredNode : parent.getChildByName(nodeName);
    const mountedNode =
      existingNode ?? createLayerNode(parent, nodeName, position, width, height);

    if (!existingNode) {
      this.runtimeFallbackNodes.add(mountedNode);
    }

    if (mountedNode.parent !== parent) {
      mountedNode.parent = parent;
    }

    if (
      !existingNode ||
      !preferSceneAuthoredLayout ||
      this.runtimeFallbackNodes.has(mountedNode)
    ) {
      mountedNode.setPosition(position);
      const transform =
        mountedNode.getComponent(UITransform) ?? mountedNode.addComponent(UITransform);
      transform.setContentSize(width, height);
    }

    return mountedNode;
  }

  /**
   * 查找或创建一个招聘文案节点。
   * 场景已存在时保留编辑器中的位置、尺寸、字号和颜色；只有 fallback 节点才写默认值。
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
    preferSceneAuthoredLayout = false,
  ): Label {
    const existingLabel =
      configuredLabel?.isValid && configuredLabel.node.isValid
        ? configuredLabel
        : parent.getChildByName(nodeName)?.getComponent(Label) ?? null;
    const labelNode =
      existingLabel?.node ?? createLayerNode(parent, nodeName, position, width, height);

    if (!existingLabel) {
      this.runtimeFallbackNodes.add(labelNode);
    }

    if (labelNode.parent !== parent) {
      labelNode.parent = parent;
    }

    const label = existingLabel ?? labelNode.addComponent(Label);
    if (
      !existingLabel ||
      !preferSceneAuthoredLayout ||
      this.runtimeFallbackNodes.has(labelNode)
    ) {
      labelNode.setPosition(position);
      const transform =
        labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
      transform.setContentSize(width, height);
      label.string = defaultText;
      label.fontSize = fontSize;
      label.lineHeight = fontSize + 10;
      label.color = color;
      label.enableWrapText = true;
      label.overflow = Label.Overflow.SHRINK;
      label.horizontalAlign = horizontalAlign;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.isBold = isBold;
    }

    return label;
  }

  /**
   * 确保二档招聘按钮保留旧 TS 的半透明视觉，但允许场景已配置时优先使用场景值。
   */
  private ensureNodeOpacity(node: Node, opacity: number): void {
    const existingOpacity = node.getComponent(UIOpacity);
    const shouldUseRuntimeOpacity =
      !existingOpacity || this.runtimeFallbackNodes.has(node);

    const uiOpacity = existingOpacity ?? node.addComponent(UIOpacity);
    if (shouldUseRuntimeOpacity) {
      uiOpacity.opacity = opacity;
    }
  }

  /**
   * 统一挂载一个招聘面板贴图节点。
   * 静态 UI 贴图优先保留场景节点的位置和尺寸；动态卡面贴图可按传入参数实时重算大小。
   */
  private attachSpriteByResource(
    parent: Node,
    name: string,
    resourcePath: string,
    position: Vec3,
    width: number,
    height: number,
    siblingIndex = 0,
    preferSceneAuthoredLayout = true,
  ): void {
    void this.loadSpriteFrame(resourcePath)
      .then((spriteFrame) => {
        if (!parent.isValid) {
          return;
        }

        const sprite = ensureSpriteNode(
          parent,
          null,
          name,
          spriteFrame,
          position,
          width,
          height,
          preferSceneAuthoredLayout,
          this.runtimeFallbackNodes,
        );
        if (this.shouldUseRuntimeLayoutForNode(sprite.node)) {
          sprite.node.setSiblingIndex(siblingIndex);
        }
      })
      .catch((error) => {
        console.error(`[MainSceneRecruitmentPanelView] sprite load failed: ${resourcePath}`, error);
      });
  }

  /**
   * 为弹窗遮罩节点补上半透明背景绘制。
   * 场景节点已存在时复用其尺寸，只刷新 Graphics 内容。
   */
  private ensureModalMaskGraphics(maskNode: Node): void {
    const transform = maskNode.getComponent(UITransform);
    if (!transform) {
      return;
    }

    const graphics = maskNode.getComponent(Graphics) ?? maskNode.addComponent(Graphics);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    graphics.clear();
    graphics.fillColor = new Color(12, 18, 18, 190);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
  }

  /**
   * 判断某个节点是否仍由运行时兜底布局控制。
   */
  private shouldUseRuntimeLayoutForNode(node: Node | null): boolean {
    return !!node?.isValid && this.runtimeFallbackNodes.has(node);
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
