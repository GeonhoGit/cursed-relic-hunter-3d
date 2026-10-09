import { AUXILIARY_IDS, type AuxiliaryId, type RunState } from '../core/model';
import { MASONRY } from '../core/masonry';
import { PUPPET } from '../core/allegiance';
import { SCARECROW } from '../core/scarecrow';
import { ANCHOR } from '../core/anchor';

const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
export function validAuxiliaryState(s: RunState): boolean {
  const timers = s.player.auxCooldowns, acquired = s.expedition?.acquired ?? [], used = s.growth?.auxiliaryUsed;
  if (timers !== undefined && (!timers || typeof timers !== 'object' || Array.isArray(timers) || !Object.keys(timers).length
    || Object.keys(timers).some(id => !['R16', 'R17', 'R18', 'R26','R40','R42'].includes(id)
      || !integer(timers[id as AuxiliaryId], 1, id === 'R16' ? MASONRY.cooldown : id === 'R18'||id==='R40' ? SCARECROW.cooldown : id === 'R26' ? ANCHOR.cooldown : PUPPET.cooldown) || !acquired.includes(id as AuxiliaryId)))) return false;
  return used === undefined || Array.isArray(used) && used.length <= AUXILIARY_IDS.length && new Set(used).size === used.length
    && used.every(id => AUXILIARY_IDS.includes(id) && acquired.includes(id));
}
export function validPuppets(s: RunState): boolean {
  const active = s.enemies.filter(e => e?.charm !== undefined), acquired = s.expedition?.acquired.includes('R17');
  const npcTargets = acquired || s.expedition?.acquired.includes('R18') || s.expedition?.acquired.includes('R41');
  if (active.length > 1 || (active.length && (s.phase !== 'combat' || !s.expedition?.relics.includes('R17')))) return false;
  if (acquired && new Set(s.enemies.map(e => e?.id)).size !== s.enemies.length) return false;
  if (s.boss?.contactCooldown !== undefined && (!npcTargets || !integer(s.boss.contactCooldown, 1, PUPPET.contactTicks))) return false;
  if (s.boss?.allyShockHit !== undefined && (!acquired || s.boss.kind !== 'relicheart' || s.boss.mode !== 'wave' || !integer(s.boss.allyShockHit, 1, s.nextId - 1))) return false;
  if (s.cues.some(c => !c || c.ally !== undefined && (c.ally !== true || c.kind !== 'blast' || !acquired))) return false;
  for (const e of s.enemies) {
    if (!e) return false;
    if (e.charm !== undefined && (!e.charm || e.hp <= 0 || (e.spawnTicks ?? 0) > 0 || !integer(e.charm.ticks, 1, PUPPET.duration)
      || e.charm.ownerFaction !== 'player' || e.charm.sourceRelicId !== 'R17' || e.charm.originalEnemyId !== e.id || !integer(e.id, 1, s.nextId - 1)
      || (s.player.auxCooldowns?.R17 ?? 0)+(s.player.cooldownCredits?.R17 ?? 0) < e.charm.ticks + PUPPET.cooldown - PUPPET.duration || e.summonPoints !== undefined)) return false;
    if (e.targetId !== undefined && (!npcTargets || !integer(e.targetId, 0, s.nextId - 1) || e.targetId === e.id)) return false;
    if (e.contactCooldown !== undefined && (!npcTargets || !integer(e.contactCooldown, 1, PUPPET.contactTicks))) return false;
  }
  return s.bullets.every(b => b && (b.kind === 'ally' ? acquired && b.owner === 'player' && b.sourceRelicId === 'R17'
    && integer(b.originalEnemyId, 1, s.nextId - 1) && b.originalEnemyId !== b.id && integer(b.life, 1, 240)
    && [b.phase, b.eventId, b.splitDone, b.originTargetId, b.outboundHits, b.lightningDone, b.gravityDone, b.bouncesLeft].every(v => v === undefined)
    : b.sourceRelicId === undefined && (b.originalEnemyId === undefined || acquired && b.owner === 'enemy' && integer(b.originalEnemyId, 1, s.nextId - 1) && b.originalEnemyId !== b.id)));
}
