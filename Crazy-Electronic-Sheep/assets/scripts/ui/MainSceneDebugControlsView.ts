import {
  _decorator,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import { EDITOR } from 'cc/env';
import { createLabel, createLayerNode } from './uiNodeFactory';

const { ccclass, executeInEditMode, property } = _decorator;

export const CLEAR_SAVE_BUTTON_WIDTH = 128;
export const CLEAR_SAVE_BUTTON_HEIGHT = 46;
export const CLEAR_SAVE_BUTTON_RADIUS = 18;
export const CLEAR_SAVE_BUTTON_STROKE_WIDTH = 3;
export const CLEAR_SAVE_LABEL_WIDTH = 108;
export const CLEAR_SAVE_LABEL_HEIGHT = 28;
export const CLEAR_SAVE_LABEL_FONT_SIZE = 16;
const CLEAR_SAVE_LABEL_TEXT = '清档重开';

export interface MainSceneDebugControlsViewBuildOptions {
  layoutScale: number;
  onClearSave: () => void;
}

/**
 * 主场景调试控件组件。
 * Cocos 场景负责承载根节点和默认按钮/文字节点；组件只负责旧场景兜底、底板绘制和点击回调绑定。
 */
@ccclass('MainSceneDebugControlsView')
@executeInEditMode
export class MainSceneDebugControlsView extends Component {
  /**
   * 场景中预挂载的清档按钮根节点。
   * 如旧场景缺失该节点，则运行时会按旧默认布局创建兜底节点。
   */
  @property(Node)
  private clearSaveButton: Node | null = null;

  /**
   * 场景中预挂载的清档按钮文字组件。
   * 如果场景未绑定，则优先按同名子节点查找，再按旧布局兜底创建。
   */
  @property(Label)
  private clearSaveButtonLabel: Label | null = null;

  /**
   * 标记当前按钮是否由运行时兜底创建。
   * 兜底节点在后续 rebuild 时仍应继续吃代码默认尺寸，而不是把某次运行态当成新的场景真值。
   */
  private usesRuntimeFallbackButton = false;

  /**
   * 标记当前按钮文字是否由运行时兜底创建。
   * 这样旧场景缺失 Label 时，后续 rebuild 仍会持续同步默认字号和尺寸。
   */
  private usesRuntimeFallbackLabel = false;

  /**
   * 当前生效的清档回调。
   * 组件本身不持有存档逻辑，只保存控制器传入的动作引用。
   */
  private onClearSaveCallback: (() => void) | null = null;

  /**
   * 编辑器预览时最近一次用于绘制底板的按钮尺寸。
   * 只有尺寸变化时才重画，避免在编辑器空转时每帧都清空并重绘 Graphics。
   */
  private previewButtonSizeSignature = '';

  /**
   * 初始化调试控件。
   * 新场景优先复用 Cocos 中已有的按钮与文字布局；旧场景缺节点时才回退到代码默认值。
   */
  public build(options: MainSceneDebugControlsViewBuildOptions): void {
    const clearSaveButton = this.ensureClearSaveButton(options.layoutScale);
    const clearSaveButtonLabel = this.ensureClearSaveButtonLabel(
      clearSaveButton,
      options.layoutScale,
    );

    clearSaveButton.active = true;
    clearSaveButtonLabel.string = CLEAR_SAVE_LABEL_TEXT;
    this.renderClearSaveButtonBackground(clearSaveButton);
    this.bindClearSaveHandler(clearSaveButton, options.onClearSave);
  }

  /**
   * 编辑器模式下也主动刷新一次静态预览。
   * 这样场景层级面板里不运行游戏时，也能直接看到清档按钮的底板。
   */
  protected onLoad(): void {
    this.refreshEditorPreview();
  }

  /**
   * 组件重新启用时，编辑器模式需要补一次预览刷新。
   * 运行时不走这里的完整 build，而是继续由基础视图统一装配。
   */
  protected onEnable(): void {
    this.refreshEditorPreview();
  }

  /**
   * 禁用或销毁组件时要主动解除触摸监听。
   * 避免调试按钮在场景重建后重复注册同一回调。
   */
  protected onDisable(): void {
    this.detachClearSaveHandler();
  }

  protected onDestroy(): void {
    this.detachClearSaveHandler();
  }

  /**
   * 编辑器里如果用户改了按钮尺寸，需要即时重画圆角底板。
   * 这里只比较尺寸签名，避免无意义地反复清空 Graphics。
   */
  protected update(): void {
    if (!EDITOR) {
      return;
    }

    const clearSaveButton =
      this.clearSaveButton?.isValid
        ? this.clearSaveButton
        : this.node.getChildByName('ClearSaveButton');
    const buttonTransform = clearSaveButton?.getComponent(UITransform) ?? null;
    const sizeSignature = buttonTransform
      ? `${Math.round(buttonTransform.width)}x${Math.round(buttonTransform.height)}`
      : 'missing';

    if (sizeSignature === this.previewButtonSizeSignature) {
      return;
    }

    this.refreshEditorPreview();
  }

  /**
   * 查找或创建清档按钮节点。
   * 场景已挂载节点时保留编辑器里的位置和尺寸；旧场景缺失时才使用旧 TS 默认布局。
   */
  private ensureClearSaveButton(layoutScale: number): Node {
    const existingButton =
      this.clearSaveButton?.isValid
        ? this.clearSaveButton
        : this.node.getChildByName('ClearSaveButton');
    const clearSaveButton =
      existingButton ??
      createLayerNode(
        this.node,
        'ClearSaveButton',
        new Vec3(0, 0, 0),
        Math.round(layoutScale * CLEAR_SAVE_BUTTON_WIDTH),
        Math.round(layoutScale * CLEAR_SAVE_BUTTON_HEIGHT),
      );

    if (!existingButton) {
      this.usesRuntimeFallbackButton = true;
    }

    if (clearSaveButton.parent !== this.node) {
      clearSaveButton.parent = this.node;
    }

    const buttonTransform =
      clearSaveButton.getComponent(UITransform) ?? clearSaveButton.addComponent(UITransform);
    if (this.usesRuntimeFallbackButton) {
      clearSaveButton.setPosition(new Vec3(0, 0, 0));
      buttonTransform.setContentSize(
        Math.round(layoutScale * CLEAR_SAVE_BUTTON_WIDTH),
        Math.round(layoutScale * CLEAR_SAVE_BUTTON_HEIGHT),
      );
    }

    this.clearSaveButton = clearSaveButton;
    return clearSaveButton;
  }

  /**
   * 查找或创建清档按钮文字。
   * 场景已挂载文字时保留编辑器里的字号和位置；旧场景缺失时才按旧布局兜底。
   */
  private ensureClearSaveButtonLabel(
    clearSaveButton: Node,
    layoutScale: number,
  ): Label {
    const existingLabel =
      this.clearSaveButtonLabel?.isValid && this.clearSaveButtonLabel.node.isValid
        ? this.clearSaveButtonLabel
        : clearSaveButton.getChildByName('ClearSaveButtonLabel')?.getComponent(Label) ?? null;
    const labelNode =
      existingLabel?.node ??
      createLabel(
        clearSaveButton,
        'ClearSaveButtonLabel',
        CLEAR_SAVE_LABEL_TEXT,
        Math.round(layoutScale * CLEAR_SAVE_LABEL_FONT_SIZE),
        Math.round(layoutScale * CLEAR_SAVE_LABEL_WIDTH),
        Math.round(layoutScale * CLEAR_SAVE_LABEL_HEIGHT),
        new Vec3(0, 0, 0),
        new Color(122, 56, 40, 255),
        Label.HorizontalAlign.CENTER,
        true,
      ).node;

    if (!existingLabel) {
      this.usesRuntimeFallbackLabel = true;
    }

    if (labelNode.parent !== clearSaveButton) {
      labelNode.parent = clearSaveButton;
    }

    const labelTransform =
      labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
    if (this.usesRuntimeFallbackLabel) {
      labelNode.setPosition(new Vec3(0, 0, 0));
      labelTransform.setContentSize(
        Math.round(layoutScale * CLEAR_SAVE_LABEL_WIDTH),
        Math.round(layoutScale * CLEAR_SAVE_LABEL_HEIGHT),
      );
    }

    const clearSaveButtonLabel = existingLabel ?? labelNode.getComponent(Label)!;
    if (this.usesRuntimeFallbackLabel) {
      clearSaveButtonLabel.fontSize = Math.round(layoutScale * CLEAR_SAVE_LABEL_FONT_SIZE);
      clearSaveButtonLabel.lineHeight = Math.round(
        layoutScale * (CLEAR_SAVE_LABEL_FONT_SIZE + 10),
      );
      clearSaveButtonLabel.color = new Color(122, 56, 40, 255);
      clearSaveButtonLabel.enableWrapText = true;
      clearSaveButtonLabel.overflow = Label.Overflow.SHRINK;
      clearSaveButtonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      clearSaveButtonLabel.verticalAlign = Label.VerticalAlign.CENTER;
      clearSaveButtonLabel.isBold = true;
    }

    this.clearSaveButtonLabel = clearSaveButtonLabel;
    return clearSaveButtonLabel;
  }

  /**
   * 按按钮当前尺寸重画圆角底板。
   * 这样即使用户在 Cocos 里调整了按钮尺寸，底板圆角和描边也会跟随变化。
   */
  private renderClearSaveButtonBackground(clearSaveButton: Node): void {
    const buttonTransform =
      clearSaveButton.getComponent(UITransform) ?? clearSaveButton.addComponent(UITransform);
    const graphics =
      clearSaveButton.getComponent(Graphics) ?? clearSaveButton.addComponent(Graphics);
    const { width, height } = buttonTransform.contentSize;
    const radius = Math.max(
      1,
      Math.round((height * CLEAR_SAVE_BUTTON_RADIUS) / CLEAR_SAVE_BUTTON_HEIGHT),
    );
    const lineWidth = Math.max(
      1,
      Math.round((height * CLEAR_SAVE_BUTTON_STROKE_WIDTH) / CLEAR_SAVE_BUTTON_HEIGHT),
    );

    graphics.clear();
    graphics.fillColor = new Color(255, 244, 236, 245);
    graphics.strokeColor = new Color(176, 88, 64, 255);
    graphics.lineWidth = lineWidth;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    graphics.stroke();
  }

  /**
   * 绑定清档按钮点击回调。
   * rebuild 前会先解绑旧监听，避免在同一按钮上重复叠加多次 `TOUCH_END`。
   */
  private bindClearSaveHandler(
    clearSaveButton: Node,
    onClearSave: () => void,
  ): void {
    this.detachClearSaveHandler();
    this.onClearSaveCallback = onClearSave;
    clearSaveButton.on(Node.EventType.TOUCH_END, this.handleClearSaveTap, this);
  }

  /**
   * 解除当前按钮的点击监听。
   * 只清理本组件挂上的回调，不碰业务层其他可能存在的监听。
   */
  private detachClearSaveHandler(): void {
    if (this.clearSaveButton?.isValid) {
      this.clearSaveButton.off(Node.EventType.TOUCH_END, this.handleClearSaveTap, this);
    }
  }

  /**
   * 将按钮点击转发给控制器提供的清档动作。
   * 组件本身不持有存档仓库引用，保持展示层职责单一。
   */
  private handleClearSaveTap(): void {
    this.onClearSaveCallback?.();
  }

  /**
   * 在编辑器模式下生成静态预览。
   * 预览只负责显示按钮底板和文字，不绑定实际清档回调，避免在编辑器里误触业务逻辑。
   */
  private refreshEditorPreview(): void {
    if (!EDITOR || !this.node.isValid) {
      return;
    }

    const clearSaveButton = this.ensureClearSaveButton(1);
    const clearSaveButtonLabel = this.ensureClearSaveButtonLabel(clearSaveButton, 1);
    const buttonTransform =
      clearSaveButton.getComponent(UITransform) ?? clearSaveButton.addComponent(UITransform);

    clearSaveButton.active = true;
    clearSaveButtonLabel.string = CLEAR_SAVE_LABEL_TEXT;
    this.renderClearSaveButtonBackground(clearSaveButton);
    this.previewButtonSizeSignature = `${Math.round(buttonTransform.width)}x${Math.round(
      buttonTransform.height,
    )}`;
  }
}
