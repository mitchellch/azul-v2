// Piecewise slider: position 0–25 maps to 5s–60s, position 25–100 maps to 1m–60m

export function sliderToSeconds(pos: number): number {
  if (pos <= 25) return (Math.round((pos / 25) * 11) + 1) * 5;   // 5s..60s
  return (Math.round(((pos - 25) / 75) * 59) + 1) * 60;          // 1m..60m
}

export function secondsToSlider(secs: number): number {
  if (secs <= 60) return ((Math.round(secs / 5) - 1) / 11) * 25;
  return 25 + ((Math.round(secs / 60) - 1) / 59) * 75;
}

export function formatDurationLabel(secs: number): string {
  if (secs < 60)       return `${secs}s`;
  if (secs % 60 === 0) return `${secs / 60}m`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
