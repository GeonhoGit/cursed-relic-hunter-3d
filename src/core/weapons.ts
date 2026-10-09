import type { GrowthProfile, RunState, WeaponId } from './model';

export const WEAPONS = {
  W01: { name: '유물 사수기', damage: 7, interval: 24, pellets: 1, spread: 0, speed: 320, targets: 1, icon: '⌁', description: '정확한 단발 · 거리를 유지하며 꾸준히 공격', unlock: '처음부터 사용 가능' },
  W02: { name: '산탄 성물', damage: 2.5, interval: 36, pellets: 5, spread: 22, speed: 280, targets: 1, icon: '⋔', description: '22° 부채꼴 산탄 · 가까울수록 여러 탄환 적중', unlock: '문지기 석상 첫 처치' },
  W03: { name: '관측자의 쇠뇌', damage: 14, interval: 45, pellets: 1, spread: 0, speed: 440, targets: 1, icon: '⌖', description: '강한 단발 · 느린 연사와 빠른 탄속, 최대 사거리 22m', unlock: '사슬의 사제 첫 처치' },
  W04: { name: '균열 지팡이', damage: 12, interval: 42, pellets: 1, spread: 0, speed: 250, targets: 2, icon: '✧', description: '적 2마리까지 관통하는 마력탄 · 0.7초 간격, 최대 사거리 12.5m. 관통 유물 획득 시 최대 4마리', unlock: '유물 심장 첫 처치' },
} as const;
export const isWeapon = (v: unknown): v is WeaponId => v === 'W01' || v === 'W02' || v === 'W03' || v === 'W04';
export const weaponUnlocked = (p: GrowthProfile, id: WeaponId) => id === 'W01' || (id === 'W04' ? p.heartDefeated === true : id === 'W02' ? p.bossDefeated : p.priestDefeated === true);
export const selectedWeapon = (p: GrowthProfile): WeaponId => p.selectedWeapon && weaponUnlocked(p, p.selectedWeapon) ? p.selectedWeapon : 'W01';
export const currentWeapon = (s: Pick<RunState, 'weapon'>) => WEAPONS[s.weapon ?? 'W01'];
