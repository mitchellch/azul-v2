const DEBUG = process.env.EXPO_PUBLIC_DEBUG_MODE === 'true';

export const SLIDER_MAX_POS = 100;

// Production: 1–60 minutes, 1-minute granularity
// Debug:      5–300 seconds, 5-second granularity
const SEG1_POS   = 25;

const PROD_SEG1_MIN = 1;   // minutes
const PROD_SEG1_MAX = 5;
const PROD_SEG2_MIN = 5;
const PROD_SEG2_MAX = 60;

const DBG_SEG1_MIN = 5;    // seconds
const DBG_SEG1_MAX = 30;
const DBG_SEG2_MIN = 30;
const DBG_SEG2_MAX = 300;

export function sliderToMinutes(pos: number): number {
  if (DEBUG) return sliderToSeconds(pos) / 60;
  const p = Math.max(0, Math.min(pos, 100));
  if (p < SEG1_POS) {
    return Math.round(PROD_SEG1_MIN + (p / SEG1_POS) * (PROD_SEG1_MAX - PROD_SEG1_MIN));
  }
  return Math.round(PROD_SEG2_MIN + ((p - SEG1_POS) / (100 - SEG1_POS)) * (PROD_SEG2_MAX - PROD_SEG2_MIN));
}

export function minutesToSlider(mins: number): number {
  if (DEBUG) return secondsToSlider(mins * 60);
  const m = Math.max(PROD_SEG1_MIN, Math.min(mins, PROD_SEG2_MAX));
  if (m <= PROD_SEG1_MAX) {
    return ((m - PROD_SEG1_MIN) / (PROD_SEG1_MAX - PROD_SEG1_MIN)) * SEG1_POS;
  }
  return SEG1_POS + ((m - PROD_SEG2_MIN) / (PROD_SEG2_MAX - PROD_SEG2_MIN)) * (100 - SEG1_POS);
}

export function sliderToSeconds(pos: number): number {
  if (DEBUG) {
    const p = Math.max(0, Math.min(pos, 100));
    if (p < SEG1_POS) {
      const secs = DBG_SEG1_MIN + (p / SEG1_POS) * (DBG_SEG1_MAX - DBG_SEG1_MIN);
      return Math.round(secs / 5) * 5;
    }
    const secs = DBG_SEG2_MIN + ((p - SEG1_POS) / (100 - SEG1_POS)) * (DBG_SEG2_MAX - DBG_SEG2_MIN);
    return Math.round(secs / 5) * 5;
  }
  return sliderToMinutes(pos) * 60;
}

export function secondsToSlider(secs: number): number {
  if (DEBUG) {
    const s = Math.max(DBG_SEG1_MIN, Math.min(secs, DBG_SEG2_MAX));
    if (s <= DBG_SEG1_MAX) {
      return ((s - DBG_SEG1_MIN) / (DBG_SEG1_MAX - DBG_SEG1_MIN)) * SEG1_POS;
    }
    return SEG1_POS + ((s - DBG_SEG2_MIN) / (DBG_SEG2_MAX - DBG_SEG2_MIN)) * (100 - SEG1_POS);
  }
  return minutesToSlider(Math.max(1, Math.round(secs / 60)));
}

export function formatDurationLabel(secs: number): string {
  if (secs < 60)     return `${secs}s`;
  const totalMin = Math.round(secs / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export type SliderLabel = { pos: number; mins: number; label: string };

export const SLIDER_LABELS: SliderLabel[] = DEBUG
  ? [
      { pos: secondsToSlider(5),   mins: 5/60,   label: '5s'  },
      { pos: secondsToSlider(15),  mins: 15/60,  label: '15s' },
      { pos: secondsToSlider(30),  mins: 30/60,  label: '30s' },
      { pos: secondsToSlider(60),  mins: 1,      label: '1m'  },
      { pos: secondsToSlider(180), mins: 3,      label: '3m'  },
      { pos: secondsToSlider(300), mins: 5,      label: '5m'  },
    ]
  : [
      { pos: minutesToSlider(1),  mins: 1,  label: '1m'  },
      { pos: minutesToSlider(5),  mins: 5,  label: '5m'  },
      { pos: minutesToSlider(15), mins: 15, label: '15m' },
      { pos: minutesToSlider(30), mins: 30, label: '30m' },
      { pos: minutesToSlider(45), mins: 45, label: '45m' },
      { pos: minutesToSlider(60), mins: 60, label: '60m' },
    ];
