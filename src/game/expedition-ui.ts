import { canRerollReward, roomInfo, roomReward, ROOMS } from '../core/expedition';
import type { RelicId, RunState } from '../core/model';
import { normalRelics, RELICS } from '../core/relics';
import { currentRoom } from '../core/dungeon';
import { dungeonMapMarkup } from './dungeon-view';
import { activeAuxiliary, isAuxiliary } from '../core/auxiliary';
import { growthStats } from '../core/growth';
import { regionName } from '../core/region';
import { rarityBadge, rarityGuideMarkup } from './relic-rarity-ui';

function card(id: RelicId, selectable = false, status = '', locked = '') {
  const relic = RELICS[id], tag = selectable ? 'button' : 'div';
  return `<${tag} class="relic-card${status ? ' consumed' : ''}" data-rarity="${relic.rarity}" ${selectable ? `data-action="choose-${id}" aria-label="${relic.name} 선택" ${locked ? 'disabled' : ''}` : ''}>
    <span class="relic-symbol" aria-hidden="true">${relic.icon}</span><div class="relic-meta">${rarityBadge(relic.rarity)}<small>${status || relic.type}</small></div><b>${relic.name}</b><p>${relic.description}</p>
    ${selectable ? `<span class="relic-select">${locked || '이 유물 선택 <span>↗</span>'}</span>` : ''}</${tag}>`;
}
export function rewardMarkup(s: RunState) {
  const reward = roomReward(s)!, info = roomInfo(s), maze = !!currentRoom(s);
  if (currentRoom(s)?.kind === 'altar' && reward.choice === null) {
    const count = normalRelics(s).length;
    return `<div class="modal-eyebrow curse-label">CURSED ALTAR · 저주받은 제단</div>
      <h2 id="modal-title">힘에는 대가가 따릅니다.</h2>
      <p class="modal-description">제단은 고정된 저주 유물을 제안합니다. 힘은 하나만 가져갈 수 있으니 대가를 읽고 선택하세요.</p>
      <div class="reward-options altar-options">${card('R38', true, '', s.expedition!.acquired.includes('R38') ? '이미 획득한 유물' : count < 2 ? `일반 유물 2개 필요 · 현재 ${count}개` : '')}${card('R43', true, '', s.expedition!.acquired.includes('R43') ? '이미 획득한 유물' : '')}</div>
      <p class="altar-warning">계약서는 잃은 유물을 돌려주지 않습니다. 멈춘 탄환도 닿으면 위험합니다.</p>
      <div class="modal-actions"><button class="secondary" data-action="leave-altar">나중에 돌아오기</button><button class="quiet" data-action="choose-skip">이번 제단 포기</button></div>
      <p class="modal-footnote">나중에 돌아와도 제안은 유지됩니다. 선택하면 자동 저장 후 바로 탐험합니다.</p>`;
  }
  const chosen = reward.choice !== null;
  return `<div class="modal-eyebrow">${maze ? 'RELIC SANCTUARY · 발견한 유물' : `CHAMBER ${String(info.index + 1).padStart(2, '0')} / CLEARED · +8 GOLD`}</div>
    <h2 id="modal-title">${!chosen ? '유물을 하나 선택하세요.' : reward.choice === 'skip' ? '가벼운 발걸음으로.' : '유물을 챙겼습니다.'}</h2>
    <p class="modal-description">${!chosen ? '석실에 남겨진 힘 하나를 가져가세요. 다음 전투부터 함께합니다.' : maze ? '다시 문으로 돌아가 다음 길을 고르세요.' : `다음 목적지 · ${ROOMS[info.index + 1].name}`}</p>
    ${rarityGuideMarkup()}
    ${!chosen ? `<div class="reward-toolbar"><p>${reward.rerolled ? '이 상자의 새로고침을 사용했습니다.' : canRerollReward(s) ? '선택지를 무료로 한 번 바꿀 수 있습니다.' : '새로 뽑을 수 있는 다른 유물이 없습니다.'}</p><button class="secondary" data-action="reroll-reward" ${canRerollReward(s) ? '' : 'disabled'}>${reward.rerolled ? '새로고침 사용 완료' : '새로고침 · 무료 1회'}</button></div>` : ''}
    ${!chosen ? `<div class="reward-options">${reward.candidates.map(id => card(id, true)).join('')}</div>` : reward.choice !== 'skip' ? `<div class="chosen-relic">${card(reward.choice!)}</div>` : '<p class="skip-note">이번 보상은 포기했습니다. 보유한 유물과 금화는 유지됩니다.</p>'}
    <div class="modal-actions">${chosen ? (maze ? '<button class="primary" data-action="resume">방으로 돌아가기</button>' : '<button class="primary" data-action="next-room">다음 방으로</button>') : '<button class="quiet" data-action="choose-skip">유물 없이 진행</button>'}<button class="secondary" data-action="save-home">저장하고 야영지로</button></div>
    <p class="modal-footnote">생명력 ${Number(s.player.hp.toFixed(1))} / ${growthStats(s).maxHp} · 금화 ${s.gold} · 선택과 다음 방 진입은 자동 저장됩니다.</p>`;
}
export function inventoryMarkup(s: RunState) {
  const e = s.expedition;
  const equipped = activeAuxiliary(s), safe = s.phase === 'explore' || s.phase === 'cleared';
  return `<div class="modal-eyebrow">RELIC COLLECTION</div><h2 id="modal-title">이번 탐험의 유물</h2>
    <p class="modal-description">보조 기술은 하나만 장착하며, 안전한 방에서 교체할 수 있습니다.<br>교체해도 재사용 대기와 시간의 빚은 유지됩니다. 소모하거나 잃은 유물은 다시 등장하지 않습니다.</p>
    ${rarityGuideMarkup()}
    <div class="inventory-grid">${e?.acquired.length ? e.acquired.map(id => `<div class="inventory-entry">${card(id, false, e.relics.includes(id) ? '' : s.revival?.lost.includes(id) ? '대가로 잃음' : '소모됨')}
      ${isAuxiliary(id) && e.relics.includes(id) ? `<button class="equip-button ${equipped === id ? 'equipped' : ''}" data-action="equip-${id}" aria-label="${RELICS[id].name} 장착" ${!safe || equipped === id ? 'disabled' : ''}>${equipped === id ? '장착 중 · 우클릭' : safe ? '이 보조 기술 장착' : '안전한 방에서 교체 가능'}</button>` : ''}</div>`).join('') : `<p class="skip-note">아직 유물이 없습니다.<br>${currentRoom(s) ? '◇ 표시의 유물방을 탐험해 보세요.' : '첫 석실을 돌파하면 유물을 고를 수 있습니다.'}</p>`}</div>
    <div class="modal-actions"><button class="primary" data-action="close">유물 목록 닫기</button></div>`;
}
export function mapMarkup(s: RunState) {
  const info = roomInfo(s);
  if (currentRoom(s)) return `<div class="modal-eyebrow">EXPEDITION MAP · ${regionName(s)}</div><h2 id="modal-title">${s.expedition?.region===3?'심장부의 길':s.expedition?.region===2?'저주받은 회랑의 길':'잊힌 유적의 길'}</h2>
    <p class="modal-description">문으로 걸어가 다음 방을 고르세요. 탐험한 방은 다시 오갈 수 있습니다.<br>멀리 있는 미발견 방은 탐험하며 드러납니다.</p>
    <div class="dungeon-map">${dungeonMapMarkup(s)}</div><div class="map-legend"><span>⌂ 시작</span><span>◇ 유물</span><span>☽ 저주 제단</span><span>◈ 상점</span><span>♜ 보스</span><span>밝은 방 · 현재 위치</span></div>
    <p class="modal-footnote">방문 ${s.expedition!.dungeon!.rooms.filter(r => r.visited).length} / ${info.total} · 전투 중에는 문이 잠깁니다.</p>
    <div class="modal-actions"><button class="primary" data-action="close">지도 닫기</button></div>`;
  return `<div class="modal-eyebrow">EXPEDITION MAP</div><h2 id="modal-title">잊힌 유적의 길</h2>
    <p class="modal-description">${info.total === 1 ? '이전 버전에서 시작한 단일 석실 탐험입니다.' : info.total === 4 ? '첫 두 석실에서 유물을 고르고, 세 번째 석실 뒤의 문지기를 쓰러뜨리세요.' : '세 석실을 돌파하세요. 첫 두 석실에서 유물을 하나씩 고릅니다.'}</p>
    <ol class="expedition-map">${ROOMS.slice(0, info.total).map((room, i) => {
      const complete = i < info.index || (i === info.index && s.phase === 'cleared');
      const purpose = room.boss ? '보스전' : i === info.total - 1 ? '탐험 종료' : room.reward ? '유물 보상' : '보스로 이동';
      return `<li class="${i === info.index ? 'current' : ''} ${complete ? 'complete' : ''}"><span>${complete ? '✓' : String(i + 1).padStart(2, '0')}</span><div><b>${room.name}</b><small>${i === info.index ? '현재 위치 · ' : ''}${complete ? '돌파 완료' : i <= info.index ? '전투 중' : '미진입'} · ${purpose}</small></div></li>`;
    }).join('')}</ol><div class="modal-actions"><button class="primary" data-action="close">지도 닫기</button></div>`;
}
