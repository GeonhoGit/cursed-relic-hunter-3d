import type { GrowthProfile, RunState } from '../core/model';
import { relicCodex, type CodexEntry, type CodexOptions } from '../core/relic-codex';
import { RELIC_RARITIES } from '../core/relic-rarity';
import { isAuxiliary } from '../core/auxiliary';
import { rarityBadge, rarityGuideMarkup } from './relic-rarity-ui';

const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function entryMarkup(e:CodexEntry){
 const status=e.runStatus==='held'?'이번 탐험 보유':e.runStatus==='lost'?'이번 탐험에서 상실':e.runStatus==='consumed'?'이번 탐험에서 소모':null;
 return `<details class="codex-entry" data-relic-id="${e.id}" data-rarity="${e.rarity}" data-discovered="${e.discovered}" data-unlocked="${e.unlocked}">
  <summary><span class="codex-icon" aria-hidden="true">${e.icon}</span><span class="codex-heading"><small>${e.id} · ${e.curse?'저주':isAuxiliary(e.id)?'보조 기술':'유물'}</small><b>${e.name}</b></span>${rarityBadge(e.rarity)}<span class="codex-status">${e.discovered?'발견 완료':'미발견'} · ${e.unlocked?'해금됨':'미해금'}</span></summary>
  <div class="codex-detail"><p>${escape(e.description)}</p><dl><div><dt>계정 해금 조건</dt><dd>${escape(e.unlock.description)}${e.unlock.target>1?` <strong>${e.unlock.count}/${e.unlock.target}</strong>`:''}</dd></div>
  <div><dt>등장 조건</dt><dd>${escape(e.appearance)}</dd></div>
  ${e.departureUnlocked===null?'':`<div><dt>이번 탐험</dt><dd>${status?`${status} · `:''}${e.departureUnlocked?'해금 조건 충족':e.unlocked?'새로 해금됨 · 다음 탐험부터 등장':'출발 해금 조건 미충족'}</dd></div>`}</dl></div></details>`;
}
export function codexResultsMarkup(profile:GrowthProfile,run:RunState|null,options:CodexOptions={}):string{
 const entries=relicCodex(profile,run,options);
 return `<p class="codex-result-count" role="status" aria-live="polite">유물 ${entries.length}종 표시</p><div class="codex-list">${entries.length?entries.map(entryMarkup).join(''):'<p class="codex-empty">검색 결과가 없습니다. 검색어나 필터를 바꿔 보세요.</p>'}</div>`;
}
export function codexMarkup(profile:GrowthProfile,run:RunState|null,options:CodexOptions={}):string{
 const entries=relicCodex(profile,run),found=entries.filter(e=>e.discovered).length,unlocked=entries.filter(e=>e.unlocked).length;
 return `<div class="modal-eyebrow">HUNTER'S FIELD GUIDE · 영구 기록</div><h2 id="modal-title">유물 도감</h2>
  <p class="modal-description">발견하지 않은 유물도 효과와 대가를 미리 볼 수 있습니다. 유물 이름을 눌러 자세히 확인하세요.</p>
  <div class="codex-progress"><b>발견 ${found} / ${entries.length}</b><span>계정 해금 ${unlocked} / ${entries.length}</span></div>
  <p class="codex-note">소모하거나 잃어도 발견 기록은 남습니다. 성장 목표로 얻은 해금은 다음 탐험부터 적용됩니다. 침묵의 종·균열 렌즈는 첫 전투방 클리어 후 등장합니다.</p>
  <div class="codex-toolbar"><div><label for="codex-search">이름·ID·효과 검색</label><input id="codex-search" type="search" maxlength="120" value="${escape(options.query ?? '')}" placeholder="예: 회복, R40" autocomplete="off" aria-controls="codex-results"></div>
  <div><label for="codex-status">기록 필터</label><select id="codex-status" aria-controls="codex-results">${[['all','전체'],['discovered','발견한 유물'],['undiscovered','미발견 유물'],['locked','미해금 유물']].map(([value,label])=>`<option value="${value}" ${value===(options.status ?? 'all')?'selected':''}>${label}</option>`).join('')}</select></div>
  <div><label for="codex-rarity">등급 필터</label><select id="codex-rarity" aria-controls="codex-results"><option value="all">모든 등급</option>${Object.entries(RELIC_RARITIES).map(([value,r])=>`<option value="${value}" ${value===options.rarity?'selected':''}>${r.name}</option>`).join('')}</select></div></div>
  <div id="codex-results">${codexResultsMarkup(profile,run,options)}</div>${rarityGuideMarkup()}
  <div class="modal-actions"><button class="primary" data-action="close-codex">도감 닫기</button></div>`;
}
