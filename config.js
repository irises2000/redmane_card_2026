export const canvas = document.getElementById("maneCanvas");
export const ctx = canvas.getContext("2d");

/* =========================
   1) 기본 비주얼 설정
========================= */
export const BG_COLOR = "#bc0927";
export const SPINE_COLOR = "#bc0927";

export const MANE_SEGMENTS = 10;
export const MANE_LENGTH_RATIO = 15;
export const THICK_PORTION = 0.6;
export const MANE_ROOT_JITTER = 1;

/* =========================
   2) 텍스트 설정
========================= */
export let GREETING_TEXT = "";
export const TEXT_COLOR = "rgba(255, 235, 215, 0.9)";
export const TEXT_FONT_FAMILY = '"Times New Roman", serif';
export const TEXT_WEIGHT = "150";
export const TEXT_SIZE_RATIO = 0.01;
export const TEXT_START_OFFSET = 40;

export function setGreetingText(value) {
  GREETING_TEXT = value;
}

/* =========================
   3) 구글 시트 주소
========================= */
export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRKi5g-6wPn9FoAMVi82Exy8t1sluR2jNqjXgtB4eCB1U6ncqyl69d60CWrd10e4F_2eW2v7Gl9Jubs/pub?gid=0&single=true&output=csv";

export const SHEET_WRITE_URL =
  "https://script.google.com/macros/s/AKfycbx_coYgzHZjJaD8pLW6BZyVL9i3kLufUzbz5ZcJ_wBcAbwp8w7eWSuDt1-51xTLOOz1sA/exec";

/* =========================
   4) 구슬/묶임 설정
========================= */
export const RIBBON_CAPTURE_RADIUS = 40;
export const RIBBON_TOGGLE_RADIUS = 12;
export const RIBBON_SNAP_STRENGTH = 0.97;
export const BEAD_RADIUS = 8;

/* =========================
   5) 클릭 / 드래그 판정
========================= */
export const CLICK_MOVE_THRESHOLD = 6;
export const CLICK_TIME_THRESHOLD = 10;
export const TOUCH_TAP_TIME_THRESHOLD = 10;
export const TOUCH_TAP_MOVE_THRESHOLD = 12;

/* =========================
   6) 마우스 힘
========================= */
export const POINTER_INFLUENCE_RADIUS = 70;
export const POINTER_FORCE_MULTIPLIER = 20;

/* =========================
   7) 전역 상태값
========================= */
export let mouseX = 0;
export let mouseY = 0;
export let mouseDown = false;

export let pointerStartX = 0;
export let pointerStartY = 0;
export let pointerCurrentX = 0;
export let pointerCurrentY = 0;
export let pointerDownTime = 0;
export let pointerMoved = false;

export function setMousePosition(x, y) {
  mouseX = x;
  mouseY = y;
}

export function setMouseDown(value) {
  mouseDown = value;
}

export function beginPointerState(x, y) {
  mouseX = x;
  mouseY = y;
  mouseDown = true;

  pointerStartX = x;
  pointerStartY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;
  pointerDownTime = performance.now();
  pointerMoved = false;
}

export function movePointerState(x, y) {
  mouseX = x;
  mouseY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;

  const dx = pointerCurrentX - pointerStartX;
  const dy = pointerCurrentY - pointerStartY;
  const dist = Math.hypot(dx, dy);

  if (dist > CLICK_MOVE_THRESHOLD) {
    pointerMoved = true;
  }
}

export function endPointerState(x, y) {
  mouseX = x;
  mouseY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;
  mouseDown = false;
}

/* =========================
   8) 시트 데이터 상태
========================= */
export let sheetRows = [];

export function setSheetRows(rows) {
  sheetRows = rows;
}

/* =========================
   9) 공용 유틸
========================= */
export function cleanCell(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .replace(/""/g, '"')
    .replace(/\r/g, "")
    .trim();
}

export function normalizeName(value) {
  return cleanCell(value).normalize("NFC").replace(/\s+/g, "").toLowerCase();
}

export function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export function getRandomRibbonColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65 + Math.random() * 25;
  const lightness = 35 + Math.random() * 20;

  return {
    h: hue,
    s: saturation,
    l: lightness,
    base: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    mid: `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 12, 82)}%)`,
    highlight: `hsl(${hue}, ${Math.max(saturation - 10, 30)}%, ${Math.min(
      lightness + 28,
      92,
    )}%)`,
  };
}
