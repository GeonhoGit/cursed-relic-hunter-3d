import { MOUSE_SENSITIVITY } from '../core/settings';
import type { GraphicsMode } from '../core/render-timing';
import type { GrowthProfile, RunState } from '../core/model';
import type { KeyBindings } from '../core/keybindings';

export interface Settings { fps: number; sound: boolean; reducedMotion: boolean; showFps: boolean; mouseSensitivity?: number; graphicsQuality?: GraphicsMode; bindings?:KeyBindings }
export const defaultSettings = (): Settings => ({ fps: 60, sound: true, reducedMotion: false, showFps: false, mouseSensitivity: MOUSE_SENSITIVITY.default, graphicsQuality: 'auto' });
export interface SaveRecord { schema: 1; content: 'prototype-0.1' | 'prototype-0.2' | 'prototype-0.3' | 'prototype-0.4' | 'prototype-0.5' | 'prototype-0.6' | 'prototype-0.7' | 'prototype-0.8' | 'prototype-0.9' | 'prototype-0.10' | 'prototype-0.11' | 'prototype-0.12' | 'prototype-0.13' | 'prototype-0.14'|'prototype-0.15'|'prototype-0.16'; revision: number; savedAt: string; run: RunState | null; settings: Settings; profile?: GrowthProfile }
