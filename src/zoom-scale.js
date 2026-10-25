const STEPS = 1000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const zoomFromPosition = (position, min = 5, max = 300) =>
    Math.round(min * (max / min) ** (clamp(position, 0, STEPS) / STEPS));

export const positionFromZoom = (zoom, min = 5, max = 300) =>
    Math.round((STEPS * Math.log(clamp(zoom, min, max) / min)) / Math.log(max / min));
