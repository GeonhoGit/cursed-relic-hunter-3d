import type { GrowthProfile, GrowthStat, Investment, RunState } from './model';
import { RELIC_IDS } from './relics';
import { currentWeapon, isWeapon, weaponUnlocked } from './weapons';

export const GROWTH_LIMITS: Investment = { health: 60, attack: 60, speed: 60, movement: 60, dodge: 60 };
export const emptyInvestment = (): Investment => ({ health: 0, attack: 0, speed: 0, movement: 0, dodge: 0 });
export const defaultProfile = (): GrowthProfile => ({ investment: emptyInvestment(), rooms: [], purchases: [], relics: [], bossDefeated: false });
export const investedPoints = (v: Investment) => Object.values(v).reduce((sum, n) => sum + n, 0);
export function growthGoals(p: GrowthProfile) {
  return [
    { id: 'G01', title: '첫 발걸음', description: '일반 전투방 첫 클리어 · 침묵의 종·균열 렌즈 해금', count: Math.min(1, p.rooms.length), target: 1 },
    { id: 'G02', title: '유적의 탐험가', description: '일반 전투방 최초 클리어 누적 5회', count: p.rooms.length, target: 5 },
    { id: 'G03', title: '문지기를 넘어서', description: '문지기 석상 첫 처치', count: Number(p.bossDefeated), target: 1 },
    { id: 'G04', title: '사슬을 끊는 자', description: '사슬의 사제 첫 처치', count: Number(p.priestDefeated ?? false), target: 1 },
    { id: 'G05', title: '심장의 정복자', description: '유물 심장 첫 처치', count: Number(p.heartDefeated ?? false), target: 1 },
    { id: 'G06', title: '유물 수집가', description: '서로 다른 유물 12종 실제 획득', count: p.relics.length, target: 12 },
    { id: 'G09', title: '단골 사냥꾼', description: '상점 구매 누적 5회', count: p.purchases.length, target: 5 },
  ];
}
export const earnedPoints = (p: GrowthProfile) => growthGoals(p).filter(g => g.count >= g.target).length * 5;
export function changeInvestment(v: Investment, stat: GrowthStat, delta: 1 | -1, budget: number): Investment {
  const next = { ...v, [stat]: v[stat] + delta };
  return next[stat] < 0 || next[stat] > GROWTH_LIMITS[stat] || investedPoints(next) > budget ? { ...v } : next;
}
export function growthStats(s: Pick<RunState, 'growth' | 'weapon'>) {
  const v = s.growth?.investment ?? emptyInvestment();
  const weapon = currentWeapon(s);
  return { maxHp: 100 + v.health, damage: weapon.damage * (1 + v.attack * 0.005), fireInterval: weapon.interval / (1 + v.speed * 0.005),
    moveSpeed: 150 * (1 + v.movement * 0.003), dodgeRecharge: 96 * (1 - v.dodge * 0.005) };
}
export function beginGrowthRun(s: RunState, investment: Investment, id: string, firstRoomCleared = false): boolean {
  if (s.growth) return false;
  s.growth = { id, investment: { ...investment }, ...(firstRoomCleared ? { firstRoomCleared: true as const } : {}) };
  s.player.hp = growthStats(s).maxHp; return true;
}
export function recordGrowth(profile: GrowthProfile, s: RunState | null): GrowthProfile {
  const p = structuredClone(profile), id = s?.growth?.id;
  if (!s || !id) return p;
  const rooms = s.expedition?.dungeon?.rooms;
  const cleared = rooms ? rooms.filter(r => r.kind === 'combat' && r.cleared).map(r => r.id)
    : Array.from({ length: Math.min(3, (s.expedition?.room ?? 0) + Number(s.phase === 'cleared')) }, (_, i) => i);
  const region = s.expedition?.region ?? 1;
  for (const room of cleared) if (p.rooms.length < 5 && !p.rooms.some(r => r.runId === id && r.room === room && (r.region ?? 1) === region))
    p.rooms.push({ runId: id, room, ...(region > 1 ? { region } : {}) });
  for (const room of rooms ?? []) for (const [slot, offer] of room.shop?.slots.entries() ?? []) {
    if (offer.purchased && p.purchases.length < 5 && !p.purchases.some(r => r.runId === id && r.room === room.id && r.slot === slot && (r.region ?? 1) === region))
      p.purchases.push({ runId: id, room: room.id, slot, ...(region > 1 ? { region } : {}) });
  }
  for (const relic of s.expedition?.acquired ?? []) if (!p.relics.includes(relic)) p.relics.push(relic);
  if (s.expedition?.previousDungeon?.rooms[8]?.cleared || (region === 1 && s.phase === 'cleared' && s.player.hp > 0
    && (s.boss?.hp === 0 || rooms?.some(r => r.kind === 'boss' && r.cleared)))) p.bossDefeated = true;
  if ((region === 3 && s.expedition?.previousDungeon?.rooms[8]?.cleared) || (region === 2 && s.phase === 'cleared' && s.player.hp > 0
    && s.boss?.kind === 'chainpriest' && s.boss.hp === 0 && rooms?.some(r=>r.kind==='boss' && r.cleared))) p.priestDefeated = true;
  if (region === 3 && s.phase === 'cleared' && s.player.hp > 0 && s.boss?.kind === 'relicheart' && s.boss.hp === 0
    && rooms?.some(r=>r.kind==='boss' && r.cleared)) p.heartDefeated = true;
  return p;
}
export const validGrowthId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
export function validInvestment(value: unknown, budget = 60): value is Investment {
  if (!value || typeof value !== 'object') return false;
  const v = value as Investment;
  return Object.keys(v).length === 5 && (Object.keys(GROWTH_LIMITS) as GrowthStat[]).every(k => Number.isInteger(v[k]) && v[k] >= 0 && v[k] <= GROWTH_LIMITS[k])
    && investedPoints(v) <= budget;
}
export function validProfile(value: unknown): value is GrowthProfile {
  if (!value || typeof value !== 'object') return false;
  const p = value as GrowthProfile;
  return Array.isArray(p.rooms) && p.rooms.length <= 5 && p.rooms.every(r => r && validGrowthId(r.runId) && Number.isInteger(r.room) && r.room >= 0 && r.room <= 5 && (r.region === undefined || [1, 2, 3].includes(r.region)))
    && new Set(p.rooms.map(r => `${r.runId}/${r.region ?? 1}/${r.room}`)).size === p.rooms.length
    && Array.isArray(p.purchases) && p.purchases.length <= 5 && p.purchases.every(r => r && validGrowthId(r.runId) && r.room === 10 && Number.isInteger(r.slot) && r.slot >= 0 && r.slot < 4 && (r.region === undefined || [1, 2, 3].includes(r.region)))
    && new Set(p.purchases.map(r => `${r.runId}/${r.region ?? 1}/${r.room}/${r.slot}`)).size === p.purchases.length
    && Array.isArray(p.relics) && p.relics.length <= RELIC_IDS.length && p.relics.every(id => RELIC_IDS.includes(id)) && new Set(p.relics).size === p.relics.length
    && typeof p.bossDefeated === 'boolean' && validInvestment(p.investment, earnedPoints(p))
    && (p.priestDefeated === undefined || (typeof p.priestDefeated === 'boolean' && (!p.priestDefeated || p.bossDefeated)))
    && (p.heartDefeated === undefined || (typeof p.heartDefeated === 'boolean' && (!p.heartDefeated || (p.bossDefeated && p.priestDefeated === true))))
    // Pre-lock saves may prefer W04. selectedWeapon falls back to W01 until unlocked.
    && (p.selectedWeapon === undefined || (isWeapon(p.selectedWeapon) && (p.selectedWeapon === 'W04' || weaponUnlocked(p, p.selectedWeapon))));
}
