import {
  canvas,
  ctx,
  BG_COLOR,
  mouseX,
  mouseY,
  mouseDown,
  setMousePosition,
  setMouseDown,
  beginPointerState,
  movePointerState,
  endPointerState,
  pointerCurrentX,
  pointerCurrentY,
  pointerMoved,
  pointerDownTime,
  CLICK_MOVE_THRESHOLD,
  CLICK_TIME_THRESHOLD,
  TOUCH_TAP_MOVE_THRESHOLD,
  TOUCH_TAP_TIME_THRESHOLD,
} from "./config.js";

import {
  initManes,
  getManes,
  updateAndDrawManes,
  drawTextOnSpine,
} from "./manes.js";

import { drawRibbons, handleBindTap, getRibbonById } from "./ribbons.js";

import { loadSheetRows, createNameModal } from "./modal.js";

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initManes(getRibbonById);
}

function beginPointer(x, y) {
  beginPointerState(x, y);
}

function movePointer(x, y) {
  movePointerState(x, y);
}

function endPointer(x, y, isTouch = false) {
  const duration = performance.now() - pointerDownTime;
  const dx = x - pointerCurrentX + (pointerCurrentX - x);
  const dy = y - pointerCurrentY + (pointerCurrentY - y);
  const dist = Math.hypot(x - pointerCurrentX, y - pointerCurrentY);

  const moveThreshold = isTouch
    ? TOUCH_TAP_MOVE_THRESHOLD
    : CLICK_MOVE_THRESHOLD;
  const timeThreshold = isTouch
    ? TOUCH_TAP_TIME_THRESHOLD
    : CLICK_TIME_THRESHOLD;

  const isClick =
    !pointerMoved && dist <= moveThreshold && duration <= timeThreshold;

  if (isClick) {
    handleBindTap(x, y, getManes());
  }

  endPointerState(x, y);
}

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (mouseDown) {
    movePointer(x, y);
  } else {
    setMousePosition(x, y);
  }
});

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  beginPointer(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener("mouseup", (e) => {
  const rect = canvas.getBoundingClientRect();
  endPointer(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener("mouseleave", () => {
  setMouseDown(false);
});

canvas.addEventListener(
  "touchstart",
  (e) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    beginPointer(touch.clientX - rect.left, touch.clientY - rect.top);
  },
  { passive: true },
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    movePointer(touch.clientX - rect.left, touch.clientY - rect.top);
  },
  { passive: false },
);

canvas.addEventListener("touchend", () => {
  endPointer(pointerCurrentX, pointerCurrentY, true);
});

function animate() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTextOnSpine();
  updateAndDrawManes(mouseX, mouseY, mouseDown);
  drawRibbons();

  requestAnimationFrame(animate);
}

async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await loadSheetRows();
  createNameModal();
  animate();
}

init();
