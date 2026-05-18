import { Color, Graphics, Label, Node, Sprite, SpriteFrame, UITransform, Vec3 } from 'cc';

/**
 * HUD 面板由贴图层和文字层组成。
 * 贴图层永远在底部，文字层永远在上面，避免异步挂图覆盖文本。
 */
export interface HudPanelLayers {
  root: Node;
  spriteAnchor: Node;
  labelLayer: Node;
}

/**
 * 创建纯内容挂点，供背景图、羊贴图、HUD 贴图和弹窗局部层使用。
 */
export function createLayerNode(
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
 * 创建 HUD 面板的根节点、贴图层和文字层。
 */
export function createHudPanelLayers(
  parent: Node,
  name: string,
  position: Vec3,
  width: number,
  height: number,
): HudPanelLayers {
  const root = createLayerNode(parent, name, position, width, height);
  const spriteAnchor = createLayerNode(
    root,
    `${name}SpriteAnchor`,
    new Vec3(0, 0, 0),
    width,
    height,
  );
  const labelLayer = createLayerNode(
    root,
    `${name}LabelLayer`,
    new Vec3(0, 0, 0),
    width,
    height,
  );
  labelLayer.setSiblingIndex(1);

  return {
    root,
    spriteAnchor,
    labelLayer,
  };
}

/**
 * 创建使用自定义尺寸的 `Sprite` 节点。
 */
export function createSpriteNode(
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
 * 创建基础矩形节点，用于兜底背景与异常场景。
 */
export function createRect(
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
 * 统一创建文本节点。
 * 默认使用收缩模式，优先保证 HUD 和弹窗文案在不同设备宽度下不溢出。
 */
export function createLabel(
  parent: Node,
  name: string,
  text: string,
  fontSize: number,
  width: number,
  height: number,
  position: Vec3,
  color: Color,
  horizontalAlign: number = Label.HorizontalAlign.CENTER,
  isBold: boolean = false,
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
  label.isBold = isBold;

  return label;
}

/**
 * 创建圆角底板。
 */
export function createRoundedRect(
  parent: Node,
  name: string,
  position: Vec3,
  width: number,
  height: number,
  radius: number,
  fillColor: Color,
  strokeColor: Color,
  lineWidth: number,
): Node {
  const node = new Node(name);
  node.parent = parent;
  node.setPosition(position);

  const transform = node.addComponent(UITransform);
  transform.setContentSize(width, height);

  const graphics = node.addComponent(Graphics);
  graphics.fillColor = fillColor;
  graphics.strokeColor = strokeColor;
  graphics.lineWidth = lineWidth;
  graphics.roundRect(-width / 2, -height / 2, width, height, radius);
  graphics.fill();
  if (lineWidth > 0) {
    graphics.stroke();
  }

  return node;
}

/**
 * 创建椭圆节点。
 */
export function createEllipse(
  parent: Node,
  name: string,
  position: Vec3,
  width: number,
  height: number,
  fillColor: Color,
  strokeColor: Color,
  lineWidth: number,
): Node {
  const node = new Node(name);
  node.parent = parent;
  node.setPosition(position);

  const transform = node.addComponent(UITransform);
  transform.setContentSize(width, height);

  const graphics = node.addComponent(Graphics);
  graphics.fillColor = fillColor;
  graphics.strokeColor = strokeColor;
  graphics.lineWidth = lineWidth;
  graphics.ellipse(0, 0, width / 2, height / 2);
  graphics.fill();
  if (lineWidth > 0) {
    graphics.stroke();
  }

  return node;
}
