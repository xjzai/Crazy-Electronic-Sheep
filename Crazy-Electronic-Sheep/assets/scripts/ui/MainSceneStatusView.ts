import {
  _decorator,
  Color,
  Component,
  Label,
  Tween,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import { createLabel } from './uiNodeFactory';

const { ccclass, property } = _decorator;

/**
 * 顶部提示文本的默认停留与淡出配置。
 * 目标是做成“小提示飘字”而不是常驻状态栏，因此会在短暂停留后缓慢上浮并消失。
 */
export const STATUS_MESSAGE_HOLD_SECONDS = 1.6;
export const STATUS_MESSAGE_FADE_SECONDS = 0.9;
export const STATUS_MESSAGE_RISE_DISTANCE = 54;
export const STATUS_MESSAGE_ROOT_WIDTH = 760;
export const STATUS_MESSAGE_ROOT_HEIGHT = 72;
export const STATUS_MESSAGE_LABEL_WIDTH = 720;
export const STATUS_MESSAGE_LABEL_HEIGHT = 72;
export const STATUS_MESSAGE_LABEL_FONT_SIZE = 42;
export const STATUS_MESSAGE_TOP_Y = 508;

export interface MainSceneStatusViewBuildOptions {
  layoutScale: number;
  initialMessage?: string;
}

/**
 * 主场景顶部提示组件。
 * Cocos 场景负责承载根节点和默认文本节点，组件只负责兜底创建、显隐和上浮淡出动画。
 */
@ccclass('MainSceneStatusView')
export class MainSceneStatusView extends Component {
  /**
   * 场景中预挂载的提示文本组件。
   * 如果旧场景缺失该字段或对应节点，运行时会按同名节点查找或兜底创建。
   */
  @property(Label)
  private statusLabel: Label | null = null;

  /**
   * 提示文本自身的透明度组件。
   * 使用独立透明度而不是整根节点透明度，避免未来扩展其他子节点时一起被淡出。
   */
  private statusOpacity: UIOpacity | null = null;

  /**
   * 提示文本的初始位置。
   * 每次播放新提示前都回到这个位置，再执行上浮动画。
   */
  private statusBasePosition: Vec3 | null = null;

  /**
   * 提示动画的递增序号。
   * 新提示会终止旧动画，只有最新序号允许在结束时真正隐藏文本。
   */
  private statusMessageSequence = 0;

  /**
   * 当前文本节点是否属于运行时兜底创建。
   * 如果是，则后续 rebuild 仍继续吃代码默认布局，而不是冻结为某次运行态结果。
   */
  private usesRuntimeFallbackLabel = false;

  /**
   * 初始化顶部提示组件。
   * 新场景优先复用 Cocos 中已存在的文本节点；旧场景缺节点时才回退到代码默认布局。
   */
  public build(options: MainSceneStatusViewBuildOptions): void {
    this.statusLabel = this.ensureStatusLabel(options.layoutScale);
    this.statusOpacity =
      this.statusLabel.node.getComponent(UIOpacity) ?? this.statusLabel.node.addComponent(UIOpacity);
    this.statusOpacity.opacity = 0;
    this.statusBasePosition = this.statusLabel.node.getPosition().clone();
    this.statusLabel.string = '';
    this.statusLabel.node.active = false;
    this.raiseToFront();

    if (options.initialMessage) {
      this.showMessage(options.initialMessage);
    }
  }

  /**
   * 播放一条顶部提示文本。
   * 文本会先停留，再像秒产飘字一样轻微上浮并淡出。
   */
  public showMessage(message: string): void {
    if (!message || !this.statusLabel?.node.isValid) {
      return;
    }

    const statusNode = this.statusLabel.node;
    this.raiseToFront();
    const statusOpacity =
      this.statusOpacity?.node === statusNode
        ? this.statusOpacity
        : statusNode.getComponent(UIOpacity) ?? statusNode.addComponent(UIOpacity);
    this.statusOpacity = statusOpacity;
    this.statusBasePosition ??= statusNode.getPosition().clone();

    const animationSequence = this.statusMessageSequence + 1;
    this.statusMessageSequence = animationSequence;

    this.statusLabel.string = message;
    statusNode.active = true;
    statusNode.setPosition(this.statusBasePosition);
    statusOpacity.opacity = 255;

    Tween.stopAllByTarget(statusNode);
    Tween.stopAllByTarget(statusOpacity);

    const endPosition = new Vec3(
      this.statusBasePosition.x,
      this.statusBasePosition.y + STATUS_MESSAGE_RISE_DISTANCE,
      this.statusBasePosition.z,
    );

    tween(statusNode)
      .delay(STATUS_MESSAGE_HOLD_SECONDS)
      .to(STATUS_MESSAGE_FADE_SECONDS, { position: endPosition }, { easing: 'sineOut' })
      .call(() => {
        if (!statusNode.isValid || this.statusMessageSequence !== animationSequence) {
          return;
        }

        statusNode.setPosition(this.statusBasePosition!);
      })
      .start();

    tween(statusOpacity)
      .delay(STATUS_MESSAGE_HOLD_SECONDS)
      .to(STATUS_MESSAGE_FADE_SECONDS, { opacity: 0 }, { easing: 'quadOut' })
      .call(() => {
        if (!statusNode.isValid || this.statusMessageSequence !== animationSequence) {
          return;
        }

        this.statusLabel!.string = '';
        statusNode.active = false;
      })
      .start();
  }

  /**
   * 查找或创建顶部提示文本节点。
   * 场景已挂载节点时保留编辑器里的字体、字号、颜色和局部位置；旧场景缺失时才使用默认布局。
   */
  private ensureStatusLabel(layoutScale: number): Label {
    const existingLabel =
      this.statusLabel?.isValid && this.statusLabel.node.isValid
        ? this.statusLabel
        : this.node.getChildByName('SheepStatusLabel')?.getComponent(Label) ?? null;
    const labelNode =
      existingLabel?.node ??
      createLabel(
        this.node,
        'SheepStatusLabel',
        '',
        Math.round(layoutScale * STATUS_MESSAGE_LABEL_FONT_SIZE),
        Math.round(layoutScale * STATUS_MESSAGE_LABEL_WIDTH),
        Math.round(layoutScale * STATUS_MESSAGE_LABEL_HEIGHT),
        new Vec3(0, 0, 0),
        new Color(255, 243, 142, 255),
        Label.HorizontalAlign.CENTER,
        true,
      ).node;

    if (!existingLabel) {
      this.usesRuntimeFallbackLabel = true;
    }

    if (labelNode.parent !== this.node) {
      labelNode.parent = this.node;
    }

    if (this.usesRuntimeFallbackLabel) {
      labelNode.setPosition(new Vec3(0, 0, 0));
      const labelTransform =
        labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
      labelTransform.setContentSize(
        Math.round(layoutScale * STATUS_MESSAGE_LABEL_WIDTH),
        Math.round(layoutScale * STATUS_MESSAGE_LABEL_HEIGHT),
      );
    }

    const statusLabel = existingLabel ?? labelNode.getComponent(Label)!;
    if (this.usesRuntimeFallbackLabel) {
      statusLabel.fontSize = Math.round(layoutScale * STATUS_MESSAGE_LABEL_FONT_SIZE);
      statusLabel.lineHeight = Math.round(layoutScale * (STATUS_MESSAGE_LABEL_FONT_SIZE + 10));
      statusLabel.color = new Color(255, 243, 142, 255);
      statusLabel.enableWrapText = true;
      statusLabel.overflow = Label.Overflow.SHRINK;
      statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      statusLabel.verticalAlign = Label.VerticalAlign.CENTER;
      statusLabel.isBold = true;
    }

    return statusLabel;
  }

  /**
   * 顶部提示根节点必须始终处于屏幕 UI 最前面。
   * 这样招聘弹窗遮罩或后续新增面板都不会把提示文本盖住。
   */
  private raiseToFront(): void {
    if (!this.node.isValid || !this.node.parent?.isValid) {
      return;
    }

    this.node.setSiblingIndex(this.node.parent.children.length - 1);
  }
}
