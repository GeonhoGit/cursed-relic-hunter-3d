import { AUXILIARY_IDS, type GrowthProfile, type GrowthStat, type Investment, type RelicUnlockId, type RunState } from './model';
import { isCurseHistory, RELIC_IDS } from './relics';
import { currentWeapon, isWeapon, weaponUnlocked } from './weapons';

export const GROWTH_LIMITS: Investment = { health: 60, attack: 60, speed: 60, movement: 60, dodge: 60 };
export const emptyInvestment = (): Investment => ({ health: 0, attack: 0, speed: 0, movement: 0, dodge: 0 });
export const defaultProfile = (): GrowthProfile => ({ investment: emptyInvestment(), rooms: [], purchases: [], relics: [], bossDefeated: false });
export const investedPoints = (v: Investment) => Object.values(v).reduce((sum, n) => sum + n, 0);
export function growthGoals(p: GrowthProfile) {
  return [
    { id: 'G01', title: '첫 발걸음', description: '일반 전투방 첫 클리어 · 침묵의 종·균열 렌즈 해금', count: Math.min(1, p.rooms.length), target: 1 },
    { id: 'G02', title: '유적의 탐험가', description: '일반 전투방 최초 클리어 누적 5회 · 별빛 바늘·가시 장화 해금', count: p.rooms.length, target: 5 },
    { id: 'G03', title: '문지기를 넘어서', description: '문지기 석상 첫 처치 · 석공의 손 해금 · 꼭두각시 실 해금', count: Number(p.bossDefeated), target: 1 },
    { id: 'G04', title: '사슬을 끊는 자', description: '사슬의 사제 첫 처치 · 허수아비 인형 해금', count: Number(p.priestDefeated ?? false), target: 1 },
    { id: 'G05', title: '심장의 정복자', description: '유물 심장 첫 처치 · 유랑자의 닻·거미 발톱 해금', count: Number(p.heartDefeated ?? false), target: 1 },
    { id: 'G06', title: '유물 수집가', description: '서로 다른 유물 12종 실제 획득 · 공중 발판·뿌리 장화 해금', count: p.relics.length, target: 12 },
    { id: 'G07', title: '유물 연구가', description: '서로 다른 유물 24종 실제 획득 · 운명의 주사위 해금', count: p.relics.length, target: 24 },
    { id: 'G08', title: '도구의 달인', description: '서로 다른 보조 기술 3종 성공 사용 · 상인의 저울·빈 액자 해금', count: p.auxiliaryUsed?.length ?? 0, target: 3 },
    { id: 'G09', title: '단골 사냥꾼', description: '상점 구매 누적 5회 · 비밀의 열쇠·청소부 자석 해금', count: p.purchases.length, target: 5 },
    { id: 'G10', title: '대가의 수집가', description: '서로 다른 저주 유물 3종 실제 획득', count: p.relics.filter(isCurseHistory).length, target: 3 },
    { id: 'G11', title: '봉인을 여는 자', description: '서로 다른 탐험·지역의 잠금방 최초 개방 3회', count: p.lockedRooms?.length ?? 0, target: 3 },
    { id: 'G12', title: '순수한 승리', description: '탐험 중 저주 획득 없이 유물 심장 처치 · 피의 지갑도 저주 이력으로 계산 · 봉인된 왕관·거꾸로 된 지도 해금', count: Number(p.curseFreeWin ?? false), target: 1 },
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
export function growthRelicUnlocks(p: GrowthProfile): RelicUnlockId[] {
  const ids: RelicUnlockId[] = [];
  if (p.rooms.length >= 5) ids.push('R14', 'R15');
  if (p.bossDefeated) ids.push('R16', 'R17');
  if (p.priestDefeated) ids.push('R18');
  if (p.heartDefeated) ids.push('R26', 'R27');
  if (p.relics.length >= 12) ids.push('R28','R29');
  if (p.relics.length >= 24) ids.push('R32');
  if ((p.auxiliaryUsed?.length ?? 0) >= 3) ids.push('R33', 'R34');
  if(p.purchases.length>=5)ids.push('R35','R36');
  if(p.curseFreeWin)ids.push('R47','R48');
  return ids;
}
export function beginGrowthRun(s: RunState, investment: Investment, id: string, firstRoomCleared = false, relicUnlocks: RelicUnlockId[] = []): boolean {
  if (s.growth) return false;
  s.growth = { id, investment: { ...investment }, ...(firstRoomCleared ? { firstRoomCleared: true as const } : {}),
    ...(relicUnlocks.length ? { relicUnlocks: [...relicUnlocks] } : {}) };
  s.player.hp = growthStats(s).maxHp; return true;
}
export function recordGrowth(profile: GrowthProfile, s: RunState | null): GrowthProfile {
  const p = structuredClone(profile), id = s?.growth?.id;
  if (!s || !id) return p;
  const rooms = s.expedition?.dungeon?.rooms;
  const cleared = rooms ? rooms.filter(r => r.kind === 'combat' && r.cleared).map(r => r.id)
    : Array.from({ length: Math.min(3, (s.expedition?.room ?? 0) + Number(s.phase === 'cleared')) }, (_, i) => i);
  const region = s.expedition?.region ?? 1;
  for(const [d,r] of [[s.expedition?.dungeon,region],[s.expedition?.previousDungeon,region-1],[s.expedition?.earlierDungeon,1]] as const)
    for(const room of d?.rooms ?? [])if(room.keyOpened){const events=p.lockedRooms ??= [];if(events.length<3&&!events.some(e=>e.runId===id&&e.region===r&&e.room===room.id))events.push({runId:id,region:r as 1|2|3,room:room.id});}
  for (const room of cleared) if (p.rooms.length < 5 && !p.rooms.some(r => r.runId === id && r.room === room && (r.region ?? 1) === region))
    p.rooms.push({ runId: id, room, ...(region > 1 ? { region } : {}) });
  for (const room of rooms ?? []) for (const [slot, offer] of room.shop?.slots.entries() ?? []) {
    if (offer.purchased && p.purchases.length < 5 && !p.purchases.some(r => r.runId === id && r.room === room.id && r.slot === slot && (r.region ?? 1) === region))
      p.purchases.push({ runId: id, room: room.id, slot, ...(region > 1 ? { region } : {}) });
  }
  for (const relic of s.expedition?.acquired ?? []) if (!p.relics.includes(relic)) p.relics.push(relic);
  for (const id of s.growth!.auxiliaryUsed ?? []) { const ids = p.auxiliaryUsed ??= []; if (!ids.includes(id)) ids.push(id); }
  if (s.expedition?.previousDungeon?.rooms[8]?.cleared || (region === 1 && s.phase === 'cleared' && s.player.hp > 0
    && (s.boss?.hp === 0 || rooms?.some(r => r.kind === 'boss' && r.cleared)))) p.bossDefeated = true;
  if ((region === 3 && s.expedition?.previousDungeon?.rooms[8]?.cleared) || (region === 2 && s.phase === 'cleared' && s.player.hp > 0
    && s.boss?.kind === 'chainpriest' && s.boss.hp === 0 && rooms?.some(r=>r.kind==='boss' && r.cleared))) p.priestDefeated = true;
  if (region === 3 && s.phase === 'cleared' && s.player.hp > 0 && s.boss?.kind === 'relicheart' && s.boss.hp === 0
    && rooms?.some(r=>r.kind==='boss' && r.cleared)) {
      p.heartDefeated = true;
      if((s.expedition?.dungeon?.layoutVersion ?? 0)>=2&&!s.expedition!.acquired.some(isCurseHistory))p.curseFreeWin=true;
    }
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
  if(p.curseFreeWin!==undefined&&(p.curseFreeWin!==true||!p.heartDefeated))return false;
  if(p.lockedRooms!==undefined&&(!Array.isArray(p.lockedRooms)||p.lockedRooms.length>3||p.lockedRooms.some(r=>!r||!validGrowthId(r.runId)||r.room!==11||![1,2,3].includes(r.region))
    ||new Set(p.lockedRooms.map(r=>`${r.runId}/${r.region}/${r.room}`)).size!==p.lockedRooms.length))return false;
  if (p.auxiliaryUsed !== undefined && (!Array.isArray(p.auxiliaryUsed) || p.auxiliaryUsed.length > AUXILIARY_IDS.length
    || new Set(p.auxiliaryUsed).size !== p.auxiliaryUsed.length || !Array.isArray(p.relics)
    || !p.auxiliaryUsed.every(id => AUXILIARY_IDS.includes(id) && p.relics.includes(id)))) return false;
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
