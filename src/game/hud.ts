import { currentRoom } from '../core/dungeon';
import { canOpenTreasure, roomInfo } from '../core/expedition';
import { hasRelic, RELICS } from '../core/relics';
import { dodgeCharges, maxDodgeCharges } from '../core/dodge';
import { activeAuxiliary,auxiliaryCooldown,auxiliaryDuration } from '../core/auxiliary';
import { lockedDoorNearby } from '../core/terrain';
import { BOMB } from '../core/bombs';
import { TIME } from '../core/time-debt';
import { MASONRY } from '../core/masonry';
import { isAlly, PUPPET } from '../core/allegiance';
import { SCARECROW } from '../core/scarecrow';
import { ANCHOR } from '../core/anchor';
import { featherAvailable } from '../core/evacuation';
import { ENEMY_NAMES } from '../core/enemy-balance';
import { attackStats } from '../core/attack-relics';
import { playerDamage } from '../core/player-effects';
import { WEAPONS } from '../core/weapons';
import { regionName } from '../core/region';
import type { RunState } from '../core/model';
import { DEFAULT_BINDINGS,bindingLabel,type KeyBindings } from '../core/keybindings';
import { dungeonMapMarkup } from './dungeon-view';

export interface HudContext {
  modal: string;
  yaw: number;
  reducedMotion: boolean;
  mouseCaptured: boolean;
  noticeUntil: number;
  bindings?:KeyBindings;
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export class CombatHud {
  private mapKey = '';
  private interactKey = '';
  private compassSector = -1;

  resetMap() { this.mapKey = ''; }

  update(s: RunState, { modal, yaw, reducedMotion, mouseCaptured, noticeUntil,bindings=DEFAULT_BINDINGS }: HudContext) {
    $('region-name').textContent=`${s.expedition?.region??1} / ${regionName(s)}`;
    const info = roomInfo(s), stats = attackStats(s), p = s.player;
    $('room-name').textContent = info.name;
    $('objective').textContent = s.phase === 'ready' ? '문이 닫힙니다 · 전투 준비' : s.phase === 'combat' ? `남은 적 ${s.enemies.length + Number(!!s.boss && s.boss.hp > 0)} · 모든 적을 처치하세요` : s.phase === 'dead' ? '탐험 종료' : s.boss?.hp === 0 ? s.boss?.kind==='relicheart'?'유물 심장 처치 · 탐험 완료':s.boss?.kind==='chainpriest'?'사슬의 사제 처치 · 심장부 개방':'문지기 처치 · 봉인 해제' : '열린 문을 골라 다음 방으로 이동하세요';
    $('hp').textContent = String(Number(p.hp.toFixed(1))); $('max-hp').textContent = String(stats.maxHp);
    $('health-fill').style.width = `${p.hp / stats.maxHp * 100}%`;
    document.querySelector('.health-track')!.setAttribute('aria-valuenow', String(p.hp));
    document.querySelector('.health-track')!.setAttribute('aria-valuemax', String(stats.maxHp));
    $('gold').textContent = String(s.gold); $('kills').textContent = `${s.stats.kills} 처치`;
    $('dodge').textContent = `${dodgeCharges(s)}/${maxDodgeCharges(s)} · ${dodgeCharges(s) ? '준비됨' : (p.dodgeCooldown / 60).toFixed(1) + '초'}`;
    $('dodge-fill').style.width = `${dodgeCharges(s) ? 100 : Math.max(0, 1 - p.dodgeCooldown / stats.dodgeRecharge) * 100}%`;
    const ally = s.enemies.find(e => e.hp > 0 && isAlly(e));
    if (ally) $('objective').textContent = s.enemies.some(e => e.hp > 0 && !isAlly(e)) || s.boss?.hp
      ? `남은 적 ${s.enemies.filter(e => e.hp > 0 && !isAlly(e)).length + Number(!!s.boss?.hp)} · 아군 1`
      : '아군만 남음 · 전환 종료 후 적대 복귀';
    if(s.phase==='combat'&&currentRoom(s)?.encounter&&!s.replay){const pending=s.enemies.filter(e=>e.spawnTicks).length,elite=s.enemies.find(e=>e.elite);
      $('objective').textContent=`${currentRoom(s)?.kind==='elite'?'정예방 · ':''}웨이브 ${s.wave}/${info.waves.length} · ${pending?`증원 ${pending}마리 출현 예고`:elite?`정예 ${ENEMY_NAMES[elite.kind]} ${Math.ceil(elite.hp)}/${elite.maxHp}`:$('objective').textContent}`;}
    $('puppet-status').hidden = !ally;
    $('puppet-status').textContent = ally ? `아군 ${ENEMY_NAMES[ally.kind]} ${Number(ally.hp.toFixed(1))}/${ally.maxHp} · ${(ally.charm!.ticks / 60).toFixed(1)}초` : '';
    $('decoy-status').hidden = !s.decoy;
    $('decoy-status').textContent = s.decoy ? `허수아비 ${Number(s.decoy.hp.toFixed(1))}/30 · ${(s.decoy.ticks / 60).toFixed(1)}초` : '';
    $('anchor-status').hidden = !s.anchor;
    $('anchor-status').textContent = s.anchor ? `닻 · ${(Math.hypot(p.x - s.anchor.x, p.y - s.anchor.y) * .04).toFixed(1)}m · ${bindingLabel(bindings.auxiliary)} 귀환${activeAuxiliary(s) === 'R26' ? '' : ' · 닻 장착 필요'}` : '';
    const aux = activeAuxiliary(s), remaining = aux?auxiliaryCooldown(s,aux):0;
    $('aux').textContent = aux ? `${RELICS[aux].name} · ${remaining > 0 ? (remaining / 60).toFixed(1) + '초' : aux === 'R26' && s.anchor ? '귀환 준비' : '준비됨'}` : '보조 유물 없음';
    $('aux-fill').style.width = aux ? `${100 * Math.max(0, 1 - remaining / auxiliaryDuration(aux))}%` : '0%';
    $('recovery-status').hidden=!hasRelic(s,'R39');$('recovery-status').textContent=`${bindingLabel(bindings.heal)} · 회복품 ${s.recoveryItems?.length ?? 0}/3 · 다음 +${s.recoveryItems?.[0]?.healAmount ?? 0}${s.recoveryCast?` · 사용 중 ${(s.recoveryCast.ticks/60).toFixed(1)}초 · 사격 불가`:''}`;
    $('portal-status').hidden=!s.portals;$('portal-status').textContent=s.portals?`공허의 문 · ${s.portals.second?'한 쌍 유지':'출구 설치 필요 · Esc 취소'} ${(s.portals.ticks/60).toFixed(1)}초`:'';
    $('shadow-status').hidden=!hasRelic(s,'R41')&&!p.dodgeLock;$('shadow-status').textContent=p.dodgeLock?`회피 잠금 ${(p.dodgeLock/60).toFixed(1)}초`:p.stealthed?'은신 · 새 목표 획득 차단':`은신 준비 ${((90-(p.quietTicks ?? 0))/60).toFixed(1)}초`;
    $('absorb-status').hidden=!hasRelic(s,'R42');$('absorb-status').textContent=`흡수 에너지 ${s.absorbEnergy ?? 0}/5${s.absorption?` · 채널 ${(s.absorption.ticks/60).toFixed(1)}초 · 이동·사격 불가`:` · 안전한 방 ${bindingLabel(bindings.inventory)}에서 대기 단축`}`;
    $('sealed-status').hidden=!s.crown;$('sealed-status').textContent=s.crown?`봉인 왕관 · A ${s.crown.a.region}지역 ${s.crown.a.room}번 · ${s.crown.selectedIds.length}/2 · B 포기됨`:'';
    document.querySelector('.abilities')?.classList.toggle('has-remaining-states',hasRelic(s,'R39')||!!s.portals||hasRelic(s,'R41')||hasRelic(s,'R42')||!!s.crown);
    if(s.replay)$('objective').textContent=`지도 재전투 · 남은 적 ${s.enemies.length} · 추가 보상 없음`;
    if(s.phase==='explore'&&currentRoom(s)?.pickups?.length)$('objective').textContent=`미수집 바닥 보상 ${currentRoom(s)!.pickups!.length}개 · 문을 나가면 사라집니다`;
    if(p.dodgeLock)$('dodge').textContent=`잠금 ${(p.dodgeLock/60).toFixed(1)}초`;
    $('stone-status').hidden = !s.stoneWall;
    $('stone-status').textContent = s.stoneWall ? `돌벽 ${Number(s.stoneWall.hp.toFixed(1))}/40 · ${(s.stoneWall.ticks / 60).toFixed(1)}초` : '';
    $('time-status').textContent = s.timeStop ? `시간 정지 ${(s.timeStop.ticks / 60).toFixed(1)}초` : s.timeDebt ? `시간의 빚 · ${(s.timeDebt / 60).toFixed(1)}초` : '';
    $('weak-status').hidden = !p.weakTicks;
    $('weak-status').textContent = p.weakTicks ? `약화 · 피해 −20% · ${(p.weakTicks / 60).toFixed(1)}초` : '';
    $('slow-status').hidden = !p.slowTicks;
    $('slow-status').textContent = p.slowTicks ? `둔화 · 걷기 −20% · ${(p.slowTicks / 60).toFixed(1)}초` : '';
    $('jump-status').textContent = `${hasRelic(s, 'R44') ? `2단 점프 · ${p.airJumpUsed ? '공중 점프 소모' : '공중 점프 준비'}` : '점프'}${hasRelic(s, 'R45') ? ' · 1.5m' : ''}`;
    $('stomp-status').hidden = !hasRelic(s, 'R46');
    $('stomp-status').textContent = `착지 충격파 · ${p.stompCooldown ? (p.stompCooldown / 60).toFixed(1) + '초' : '준비됨'}`;
    $('silence-status').hidden = !hasRelic(s, 'R11');
    $('silence-status').textContent = `침묵의 종 · ${p.silenceCooldown ? (p.silenceCooldown / 60).toFixed(1) + '초' : '중단 준비됨'}`;
    const ready = (ticks?: number) => ticks ? `${(ticks / 60).toFixed(1)}초` : '준비';
    const passiveStates = [
      ['R06', `궤도 ${p.orbitCount ?? 0}/4회`, !!s.orbitShots?.length],
      ['R09', `폭풍 ${ready(p.lightningCooldown)}`, !p.lightningCooldown],
      ['R10', `중력 ${ready(p.gravityCooldown)}`, !p.gravityCooldown],
      ['R14', `별빛 ${p.starlightCooldown ? ready(p.starlightCooldown) : (p.starlightRest ?? 0) >= 60 ? '준비' : `휴식 ${((60 - (p.starlightRest ?? 0)) / 60).toFixed(1)}초`}`, !p.starlightCooldown && (p.starlightRest ?? 0) >= 60],
      ['R15', `가시 ${s.thornTrails?.length ?? 0}/2개`, !!s.thornTrails?.length],
      ['R19', `수호 ${ready(p.wardCooldown)}`, !p.wardCooldown],
      ['R21', `이끼 ${s.mossClears ?? 0}/3방`, false],
      ['R22', `정화 ${ready(p.cleanseCooldown)}`, !p.cleanseCooldown],
      ['R23', `왕관 ${ready(p.thornsCooldown)}`, !p.thornsCooldown],
      ['R24', `대피 · ${featherAvailable(s) ? '준비 1/1' : '남은 기회 0/1'}`, featherAvailable(s)],
      ['R27', `발톱 · ${p.clawUsed ? '이번 회피 사용' : '벽타기 준비'}`, !p.clawUsed],
      ['R29', '뿌리 당김 −80%', true],
      ['R31', '길잡이 방 공개', true],
      ['R32', `주사위 ${s.diceRerolls ?? 0}/2회`, (s.diceRerolls ?? 0) > 0],
    ] as const;
    $('passive-status').hidden = !passiveStates.some(([id]) => hasRelic(s, id));
    for (const [id, text, active] of passiveStates) {
      const el = $(`passive-${id}`); el.hidden = !hasRelic(s, id); el.textContent = text;
      el.title = `${RELICS[id].name} · ${RELICS[id].description}`; el.dataset.active = String(active);
    }
    const weapon = WEAPONS[s.weapon ?? 'W01']; $('weapon-name').textContent = weapon.name;
    $('weapon-stats').textContent = `탄환당 피해 ${Number(playerDamage(s, stats.damage).toFixed(2))}${stats.damageBonus ? ` (+${Math.round(stats.damageBonus * 100)}%)` : ''} · 발사 간격 ${(stats.fireInterval / 60).toFixed(2)}초`;
    $('fang-status').hidden = !hasRelic(s, 'R51');
    $('fang-status').dataset.active = String(stats.fangActive);
    $('fang-status').textContent = `결사의 송곳니 · ${stats.fangActive ? '발동 중 +25%' : '생명력 50% 이하에서 발동'}`;
    $('crown-status').hidden = !hasRelic(s, 'R57');
    $('crown-status').dataset.active = String(stats.crownActive);
    $('crown-status').textContent = `태양의 왕관 · ${stats.crownActive ? '발동 중 +35%' : '생명력 80% 이상에서 발동'}`;
    $('weapon-id').textContent = `${s.weapon ?? 'W01'} / ${s.weapon === 'W04' ? 'RIFT STAFF' : s.weapon === 'W03' ? 'OBSERVER CROSSBOW' : weapon.pellets > 1 ? 'SCATTER RELIC' : 'RELIC SIDEARM'}`;
    $('relic-count').textContent = `유물 ${s.expedition?.relics.length??0}개`;
    const maze=s.expedition?.dungeon;
    const newMapKey = `${s.seed}:${s.expedition?.region}:${s.expedition?.room}:${maze?.rooms.filter(r => r.visited).length}:${s.phase}:${hasRelic(s, 'R31')}:${hasRelic(s,'R48')}:${maze?.rooms[11]?.locked}`;
    if (newMapKey !== this.mapKey) { this.mapKey = newMapKey; $('mini-map').innerHTML = maze?dungeonMapMarkup(s):`<span>${info.total===1?'이전 단일 석실':`${info.index+1} / ${info.total} 석실`}</span>`; }
    $('boss-hud').hidden = !s.boss || s.boss.hp <= 0;
    if (s.boss) {
      const b = s.boss; $('boss-name').textContent=b.kind==='relicheart'?'유물 심장':b.kind==='chainpriest'?'사슬의 사제':'문지기 석상'; $('boss-health').textContent = `${Math.ceil(b.hp)} / ${b.maxHp}`; $('boss-stage').textContent = `${b.stage}단계`;
      $('boss-fill').style.width = `${100 * b.hp / b.maxHp}%`;
      const pattern=b.silenceTicks ? `소환 의식 중단 · ${(b.silenceTicks / 60).toFixed(1)}초 뒤 행동 재개` : b.mode === 'transition' ? '봉인이 깨집니다 · 다음 공격 준비' : b.mode === 'recover' ? b.kind==='relicheart'?'심장이 재정비합니다 · 지금 반격하세요':'추격하며 재정비 · 지금 반격하세요' : { fan: '돌탄 부채꼴 사격 · 조준된 길에서 벗어나세요', charge: '직선 돌진 · 옆으로 피하세요', rocks: '낙석 · 바닥의 원에서 벗어나세요', shield: '정면 방패 · 측면이나 뒤에서 공격하세요', chains:'바닥 사슬 · 선을 벗어나거나 점프하세요', ring:'탄환 고리 · 초록색 안전 틈으로 피하세요', ritual:'소환 의식 · 재의 사제 2명이 나타납니다', pulse:'8방향 탄환 · 탄 사이로 피하세요 · 반사/정지 가능', laser:'⛔ 조준 고정 레이저 · 옆으로 피하세요 · 반사/정지 불가', shockwave:'⛔ 확장 충격파 · 점프로 넘으세요 · 반사/정지 불가' }[b.pattern];
      $('boss-pattern').textContent=b.pillarIndex!==undefined ? `보호막 연결 · 빛나는 기둥 ${b.pillarIndex+1} (${Math.ceil(b.pillarHp!)}/100)을 사격하세요 · ${pattern}` : pattern;
      if (b.kind === 'gatekeeper' && b.mode === 'recover' && b.pattern === 'shield' && (b.lensCooldown ?? 0) > 228)
        $('boss-pattern').textContent = '방패 해제 · 재정비 중 · 지금 공격하세요';
    }
    const chestRoom = currentRoom(s)?.kind === 'treasure' && currentRoom(s)?.reward === null;
    if (chestRoom) $('objective').textContent = `가운데 유물 상자에 다가가 ${bindingLabel(bindings.interact)}키로 여세요`;
    const locked=lockedDoorNearby(s),bossLoot=s.boss?.hp===0&&currentRoom(s)?.kind==='boss';
    $('interact').hidden = modal !== '' || (!canOpenTreasure(s) && currentRoom(s)?.kind !== 'shop'&&!locked&&!bossLoot);
    const interactKey = `${locked?'lock':bossLoot?'boss':chestRoom ? 'chest' : 'shop'}:${bindings.interact}`;
    if (interactKey !== this.interactKey) {
      this.interactKey = interactKey;
      $('interact').innerHTML = `<kbd>${bindingLabel(bindings.interact)}</kbd> ${locked?'잠금 보물방 · 열쇠로 개방':bossLoot?'보스 결과 · 다음 지역':chestRoom ? '유물 상자 열기' : '상인과 거래하기'}`;
    }
    $('damage-veil').classList.toggle('hurt', !reducedMotion && p.invulnerable > 37 && p.invulnerable <= 45);
    $('crosshair').hidden = !!modal;
    $('capture-hint').hidden = !!modal || mouseCaptured;
    const sectors = ['동쪽', '남동', '남쪽', '남서', '서쪽', '북서', '북쪽', '북동'];
    const sector = (Math.round(yaw / (Math.PI / 4)) + 8) % 8;
    if (sector !== this.compassSector) {
      this.compassSector = sector;
      $('compass').innerHTML = `${['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][sector]} <span>${sectors[sector]}</span>`;
    }
    $('notice').classList.toggle('visible', performance.now() < noticeUntil);
  }
}
