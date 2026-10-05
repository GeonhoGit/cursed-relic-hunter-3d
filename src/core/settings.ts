export const MOUSE_SENSITIVITY = { min: 0.2, max: 3, step: 0.05, default: 1 } as const;
export const validMouseSensitivity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= MOUSE_SENSITIVITY.min && value <= MOUSE_SENSITIVITY.max;
