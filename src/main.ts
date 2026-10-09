import './style.css';
import './readability.css';
import { World } from './game/world';
import { CombatHud } from './game/hud';
import { FpsControls } from './game/fps-controls';
import { GameAudio } from './game/audio';
import { advanceRoom,createDungeonRun, step } from './core/simulation';
import { FixedLoop } from './core/loop';
import { AdaptiveQuality, RenderTiming, validGraphicsMode } from './core/render-timing';
import { captureMotion, interpolateMotion, type MotionFrame } from './game/render-motion';
import { currentRoom } from './core/dungeon';
import { canOpenTreasure, chooseRelic, leaveAltar, openTreasure, rerollReward, roomInfo, roomReward } from './core/expedition';
import { RELICS, RELIC_IDS } from './core/relics';
import { activeAuxiliary, equipAuxiliary, type AuxiliaryId } from './core/auxiliary';
import { stoneWallFailure } from './core/masonry';
import { scarecrowFailure } from './core/scarecrow';
import { anchorFailure } from './core/anchor';
import { puppetFailure } from './core/allegiance';
import { buyFromShop, refreshShop } from './core/shop';
import { beginGrowthRun, changeInvestment, defaultProfile, earnedPoints, emptyInvestment, growthRelicUnlocks, recordGrowth } from './core/growth';
import { selectedWeapon, weaponUnlocked } from './core/weapons';
import { SaveStore, defaultSettings, type SaveRecord } from './persistence/save';
import {SaveRecovery} from './persistence/save-recovery';
import {canAdvanceLegacy,completionModal} from './game/runtime-presentation';
import {ModalFocus} from './game/modal-focus';
import { MOUSE_SENSITIVITY, validMouseSensitivity } from './core/settings';
import { canEnterNextRegion, enterNextRegion, regionName } from './core/region';
import { inventoryMarkup, mapMarkup, rewardMarkup } from './game/expedition-ui';
import { lockedDoorNearby, unlockDoor } from './core/terrain';
import { cancelFirstPortal, portalFailure } from './core/portal';
import { absorptionFailure, spendAbsorbEnergy } from './core/shadow-absorb';
import { crownOwner, crownPlan, type CrownPlan } from './core/sealed-crown';
import { shopMarkup } from './game/shop-ui';
import { growthMarkup } from './game/growth-ui';
import { weaponMarkup } from './game/weapon-ui';
import { codexMarkup, codexResultsMarkup } from './game/relic-codex-ui';
import type { CodexOptions } from './core/relic-codex';
import { ACTIONS,DEFAULT_BINDINGS,bindingIssue,bindingLabel,normalizeBindingCode,type BindingAction,type KeyBindings } from './core/keybindings';
import { keybindingMarkup } from './game/keybinding-ui';
import type { GrowthStat, RelicId, RunState, WeaponId } from './core/model';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main id="expedition" aria-label="유물 사냥꾼 3D FPS">
    <div id="world"></div><div id="damage-veil"></div><div class="vignette"></div>
    <header class="top-hud"><div class="location"><span class="eyebrow" id="region-name">THE FORGOTTEN RUINS</span><h1 id="room-name">길잡이의 방</h1><p id="objective">열린 문을 골라 탐험을 시작하세요</p></div>
      <div class="compass" id="compass">N <span>북쪽</span></div><output id="fps-counter" hidden aria-label="현재 FPS"></output>
      <aside class="mini-map"><div class="map-heading">유적 지도 <button id="map-button" aria-label="지도 열기">TAB</button></div><div id="mini-map"></div></aside></header>
    <div id="crosshair" aria-hidden="true"><i></i><b></b><span></span></div>
    <div id="boss-hud" hidden><div class="boss-heading"><span><span id="boss-name">문지기 석상</span> <small id="boss-stage"></small></span><b id="boss-health"></b></div><div class="boss-track"><i id="boss-fill"></i></div><p id="boss-pattern"></p></div>
    <div class="notice" id="notice" role="status"></div>
    <button id="interact" hidden><kbd>E</kbd> 상인과 거래하기</button>
    <div class="weak-status" id="weak-status" role="status" hidden></div>
    <div class="weak-status slow-status" id="slow-status" role="status" hidden></div>
    <footer class="bottom-hud"><section class="vitals"><div class="hp-value"><b id="hp">100</b><span>/ <span id="max-hp">100</span> 생명력</span></div><div class="health-track" role="progressbar" aria-label="생명력" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="health-fill"></i></div><div class="resources"><span>◈ <b id="gold">0</b> 금화</span><span id="kills">0 처치</span><span id="save-status">기록 확인 중</span></div></section>
      <section class="abilities"><div><kbd>SHIFT</kbd><span>회피 <b id="dodge">준비됨</b></span><div class="ability-track"><i id="dodge-fill"></i></div></div><div><kbd>우클릭</kbd><span id="aux">보조 유물 없음</span><div class="ability-track"><i id="aux-fill"></i></div></div><p><kbd>SPACE</kbd> <span id="jump-status">점프</span></p><p id="stone-status" hidden></p><p id="stomp-status" hidden></p><p id="silence-status" hidden></p><p id="time-status"></p><section id="passive-status" aria-label="패시브 유물 상태" hidden>${['R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R24', 'R27', 'R29', 'R31', 'R32'].map(id => `<span id="passive-${id}" hidden></span>`).join('')}</section></section>
      <section class="weapon-hud"><span class="eyebrow" id="weapon-id">W01 / RELIC SIDEARM</span><h2 id="weapon-name">유물 사수기</h2><p id="weapon-stats"></p><p id="puppet-status" role="status" hidden></p><p id="decoy-status" role="status" hidden></p><p id="anchor-status" role="status" hidden></p><p id="fang-status" role="status" hidden></p><p id="crown-status" role="status" hidden></p><p><span id="relic-count">유물 0개</span> <button id="inventory-button">보유 유물 <kbd>I</kbd></button> <button id="pause-button" aria-label="일시정지">ESC</button></p></section></footer>
    <div id="overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div id="panel" class="modal-panel"></div></div>
    <div class="capture-hint" id="capture-hint" hidden>마우스를 움직여 조준 · 화면 클릭으로 마우스 잠금 시도</div>
  </main>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const combatHud = new CombatHud();
const modalFocus=new ModalFocus();
const store = new SaveStore('cursed-relic-hunter-3d-v1');
const recovery=new SaveRecovery();
const audio = new GameAudio(), clock = new FixedLoop();
const renderTiming = new RenderTiming(); renderTiming.reset(performance.now());
const adaptiveQuality = new AdaptiveQuality();
let previousMotion: MotionFrame | null = null;
let run: RunState | null = null, record: SaveRecord | null = null, profile = defaultProfile();
let settings = defaultSettings(), modal = 'home', busy = false, storageError = '';
let closeTo = '';
let codexReturn='home',codexParent='';
const codexOptions:CodexOptions={query:'',status:'all',rarity:'all'};
let bindingDraft:KeyBindings={...DEFAULT_BINDINGS},bindingWaiting:BindingAction|null=null,bindingFeedback:string|null=null,bindingReturn='settings',bindingParent='';
const keyLabel=(action:BindingAction)=>bindingLabel((settings.bindings ?? DEFAULT_BINDINGS)[action]);
let growthDraft = emptyInvestment(), weaponDraft: WeaponId = 'W01';
let lastFrame = 0, lastCue = 0, noticeUntil = 0, lastQualitySample = 0, lastHudUpdate = 0;
const preview = createDungeonRun(42);
let world: World;
try { world = new World($('world')); }
catch (error) {
  $('panel').innerHTML = `<h2 id="modal-title">3D 화면을 시작하지 못했습니다.</h2><p>WebGL2를 지원하는 PC 브라우저에서 하드웨어 가속을 켠 뒤 다시 열어 주세요.</p><button onclick="location.reload()">다시 시도</button>`;
  throw error;
}
const playable = () => !!run && !['dead', 'cleared'].includes(run.phase);
const active = () => world.ready && !!run && !modal && !document.hidden && ['ready', 'combat', 'explore'].includes(run.phase);
const controls = new FpsControls(world.renderer.domElement, active, togglePause, toggleMap, interact, () => { if (run) showModal('inventory'); }, () => settings.mouseSensitivity ?? MOUSE_SENSITIVITY.default,()=>settings.bindings);
const hud = document.querySelector<HTMLElement>('.bottom-hud')!;
const abilitiesHud = document.querySelector<HTMLElement>('.abilities')!;
abilitiesHud.insertAdjacentHTML('beforeend','<p id="recovery-status" hidden></p><p id="portal-status" hidden></p><p id="shadow-status" hidden></p><p id="absorb-status" hidden></p><p id="sealed-status" hidden></p>');
let pendingCrown: {plan:CrownPlan; action:'choose'|'buy'; value:number; revision:number}|null=null;
let pendingSkipRevision=1;
const positionHints = () => {
  $('expedition').style.setProperty('--hud-clearance', `${Math.ceil($('expedition').getBoundingClientRect().bottom - hud.getBoundingClientRect().top) + 12}px`);
  $('expedition').style.setProperty('--ability-clearance', `${Math.ceil($('expedition').getBoundingClientRect().bottom - abilitiesHud.getBoundingClientRect().top) + 12}px`);
  const height = $('interact').getBoundingClientRect().height;
  if (height) $('expedition').style.setProperty('--interaction-height', `${Math.ceil(height)}px`);
};
const hudObserver = new ResizeObserver(positionHints); hudObserver.observe(hud); hudObserver.observe(abilitiesHud); hudObserver.observe($('interact'));

function notice(text: string) { $('notice').textContent = text; noticeUntil = performance.now() + 2500; }
function syncView() { if (run) run.view = { yaw: controls.yaw, pitch: controls.pitch }; }
async function persist(investment?: typeof growthDraft, weapon?: WeaponId, snapshot = run) {
  syncView(); $('save-status').textContent = '저장 중';
  try {
    record = await recovery.save(store,{run:snapshot,settings,investment,weapon}); profile = record.profile ?? defaultProfile();
    storageError = ''; $('save-status').textContent = '탐험 저장됨'; return true;
  } catch (error) {
    storageError = error instanceof Error ? error.message : '저장하지 못했습니다.';
    $('save-status').textContent = '저장 실패'; showModal('storage-error'); return false;
  }
}
const actions = (html: string) => `<div class="modal-actions">${html}</div>`;
const button = (action: string, text: string, primary = false) => `<button data-action="${action}" class="${primary ? 'primary' : 'secondary'}">${text}</button>`;
function homeMarkup() {
  const resume = record?.run && record.run.phase !== 'dead' && (!(record.run.phase === 'cleared' && record.run.boss) || canEnterNextRegion(record.run));
  return `<div class="modal-eyebrow">EXPEDITION / 3D FIRST PERSON</div><h2 id="modal-title" class="home-title">저주받은<br>유물 사냥꾼</h2>
    <p class="home-story">문 너머의 힘을 찾아.<br>문지기의 봉인과 사슬의 사제를 넘어, 유물의 심장을 정복하세요.</p>
    ${actions(`${resume ? button('continue', '탐험 이어하기 ↗', true) : ''}${button('new', '새 탐험 시작', !resume)}`)}
    <div class="camp-links">${button('growth', '영구 성장')}${button('weapons', '출발 무기')}${button('codex','유물 도감')}${button('help', '조작 안내')}${button('settings', '설정')}</div>
    <div class="home-controls"><span><kbd>${['forward','left','backward','right'].map(a=>keyLabel(a as BindingAction)).join(' / ')}</kbd> 이동</span><span>마우스 · 시점과 조준</span><span><kbd>${keyLabel('dodge')}</kbd> 회피</span><span><kbd>${keyLabel('jump')}</kbd> 점프</span><span><kbd>${keyLabel('map')}</kbd> 지도</span></div>
    <p class="modal-footnote">3지역 · 새 탐험 지역당 13방 · 정예방과1~3웨이브 · 유물 ${RELIC_IDS.length}종<br>${resume ? `저장된 탐험 · ${regionName(record!.run!)} · ${roomInfo(record!.run!).name} · 생명력 ${record!.run!.player.hp}` : '열린 문을 골라 당신만의 길을 찾으세요.'}</p>`;
}
function showModal(next: string) {
  modalFocus.capture(modal,$('panel'));
  if(next==='codex'&&modal!=='codex'){codexReturn=modal||'pause';codexParent=closeTo;}
  if (['help', 'inventory', 'map', 'settings'].includes(next)) closeTo = ['home', 'pause', 'performance-pause'].includes(modal) ? modal : '';
  modal = next; $('expedition').dataset.ui = next; controls.clear(); clock.reset(); adaptiveQuality.resetSamples(); previousMotion = null; if (document.pointerLockElement) document.exitPointerLock();
  $('overlay').hidden = false; $('overlay').dataset.mode = next;
  let html = '';
  if (next === 'home') html = homeMarkup();
  else if (next === 'pause') html = `<div class="modal-eyebrow">EXPEDITION PAUSED</div><h2 id="modal-title">잠시 숨을 고릅니다.</h2><p>생명력 ${run!.player.hp} · 금화 ${run!.gold} · 처치 ${run!.stats.kills}</p>${actions(button('resume', '전투 재개', true) + button('save-home', '저장하고 야영지로'))}<div class="camp-links">${button('inventory', '보유 유물')}${button('codex','유물 도감')}${button('help', '조작 안내')}${button('settings', '설정')}${button('sound', settings.sound ? '소리 끄기' : '소리 켜기')}</div>`;
  else if (next === 'settings') html = `<div class="modal-eyebrow">HUNTER SETTINGS</div><h2 id="modal-title">설정</h2>
    <div class="sensitivity-heading"><label for="mouse-sensitivity">마우스 감도</label><output id="sensitivity-value" for="mouse-sensitivity">${(settings.mouseSensitivity ?? MOUSE_SENSITIVITY.default).toFixed(2)}배</output></div>
    <input id="mouse-sensitivity" type="range" min="${MOUSE_SENSITIVITY.min}" max="${MOUSE_SENSITIVITY.max}" step="${MOUSE_SENSITIVITY.step}" value="${settings.mouseSensitivity ?? MOUSE_SENSITIVITY.default}" aria-describedby="sensitivity-description">
    <div class="sensitivity-scale"><span>느리게 · 0.20배</span><span>빠르게 · 3.00배</span></div>
    <p id="sensitivity-description">숫자가 높을수록 같은 마우스 움직임으로 시점이 더 빠르게 돌아갑니다. 기본 감도는 1.00배입니다.</p>
    ${button('reset-sensitivity', '기본 감도로 복원')}${button('bindings','키 변경')}
    <div class="graphics-settings"><div class="setting-row"><label for="graphics-quality">그래픽 품질</label><select id="graphics-quality"><option value="auto" ${settings.graphicsQuality === 'auto' ? 'selected' : ''}>자동 · 60FPS 목표</option><option value="low" ${settings.graphicsQuality === 'low' ? 'selected' : ''}>낮음 · 성능 우선</option><option value="high" ${settings.graphicsQuality === 'high' ? 'selected' : ''}>높음 · 화질 우선</option></select></div><div class="setting-row"><label for="fps-limit">최대 FPS</label><select id="fps-limit">${[30, 60, 120, 144, 0].map(fps => `<option value="${fps}" ${settings.fps === fps ? 'selected' : ''}>${fps ? `${fps} FPS${fps === 60 ? ' · 기본' : ''}` : '제한 없음'}</option>`).join('')}</select></div>
    <label class="setting-row" for="show-fps"><span>FPS 표시</span><input id="show-fps" type="checkbox" ${settings.showFps ? 'checked' : ''}></label>
    <label class="setting-row" for="reduced-motion"><span>효과 감소</span><input id="reduced-motion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''} aria-describedby="effects-description"></label></div>
    <p id="effects-description">효과 감소는 걷기 흔들림, 사격 섬광, 장식 입자와 빛 번짐을 끕니다. 공격 위험 표시와 탄환은 유지됩니다.</p><p class="modal-footnote">FPS는 화면 출력 상한입니다. 실제 출력은 화면 주사율과 PC 성능에 따라 달라지며 전투 속도는 바뀌지 않습니다.</p>
    <p id="settings-status" role="status">변경한 설정은 자동으로 저장됩니다.</p>${actions(button('close', '돌아가기', true))}`;
  else if (next === 'reward') html = rewardMarkup(run!);
  else if (next === 'map') html = mapMarkup(run!);
  else if (next === 'inventory') html = inventoryMarkup(run!,settings.bindings);
  else if(next==='codex'){const viewed=run ?? record?.run ?? null;html=codexMarkup(recordGrowth(profile,viewed),viewed,codexOptions);}
  else if (next === 'shop') html = shopMarkup(run!);
  else if(next==='crown-confirm'&&pendingCrown){const p=pendingCrown.plan;html=`<div class="modal-eyebrow">SEALED CROWN · 대가 확인</div><h2 id="modal-title">두 보상을 왕관에 묶습니다.</h2><p>A · ${p.a.region}지역 ${p.a.room}번 지정 방에서 서로 다른 유물 2개를 선택합니다.</p><p>예약 유물 · ${p.ids.map(id=>RELICS[id].name).join(' · ')}</p><p>B · ${p.b.region}지역 ${p.b.room}번 지정 방의 유물 보상은 지금 영구 포기됩니다. 금화는 유지됩니다.</p>${actions(button('crown-confirm','이 대가로 왕관 획득',true)+button('crown-cancel','돌아가기'))}`;}
  else if(next==='crown-abandon')html=`<h2 id="modal-title">남은 왕관 선택을 포기할까요?</h2><p>이미 받은 유물은 유지하고 남은 선택을 포기합니다. B의 유물 보상은 돌아오지 않습니다.</p>${actions(button('crown-abandon','남은 선택 포기',true)+button('reward-return','계속 선택'))}`;
  else if (next === 'growth') html = growthMarkup(profile, growthDraft, '');
  else if (next === 'weapons') html = weaponMarkup(profile, weaponDraft, '');
  else if(next==='bindings')html=keybindingMarkup(bindingDraft,bindingWaiting,bindingFeedback);
  else if (next === 'region-transition') {
    const heart=run!.expedition!.region===2;
    const rooms=run!.expedition!.dungeon!.rooms;
    const treasure=rooms.filter(r=>r.kind==='treasure' && (!r.reward || r.reward.choice===null)).length;
    const altar=rooms.filter(r=>r.kind==='altar' && (!r.reward || r.reward.choice===null)).length;
    const shop=rooms.filter(r=>r.kind==='shop' && (!r.shop || r.shop.slots.some(slot=>!slot.purchased && (slot.kind==='heal' || slot.relic!==null)))).length;
    html=`<div class="modal-eyebrow">${heart ? 'REGION 03 / THE RELIC HEART' : 'REGION 02 / THE CURSED CORRIDOR'}</div><h2 id="modal-title">${heart ? '유물의 심장으로' : '저주받은 회랑으로'}</h2>
      <p>체력·금화·유물과 기술 충전 상태를 이어갑니다. 이동하면 이전 지역으로 돌아올 수 없습니다.</p>
      <p>남겨 둔 기회 · 보물방 ${treasure}곳 · 제단 ${altar}곳 · 상점 ${shop}곳</p>
      <p>미수집 바닥 보상 ${currentRoom(run!)?.pickups?.length ?? 0}개는 떠나면 사라집니다.${run!.crown?.state==='reserved'&&run!.crown.a.region===run!.expedition!.region?' 이 지역의 미수령 왕관 A 보상도 포기됩니다.':''}</p>
      <p>${heart ? '궤도 감시자와 이동 위험선이 기다립니다. 최종 보스의 보호막은 빛나는 연결 기둥을 공격해 해제하세요.' : '새로운 미로와 재의 사제, 바닥 가시가 기다립니다. 가시는 예고를 확인하고 뛰어넘거나 우회하세요.'}</p>
      ${actions(button('enter-region',heart?'심장부로 이동':'회랑으로 이동',true)+button('close','돌아가기'))}`;
  }
  else if (next === 'help') html = `<div class="modal-eyebrow">HUNTER'S FIELD NOTES</div><h2 id="modal-title">유적을 탐험하는 방법</h2>
    <div class="help-grid"><p><kbd>WASD</kbd><b>시점 기준으로 이동</b>열린 문으로 걸어가면 다음 방으로 이동합니다.</p><p><kbd>마우스</kbd><b>시점 · 조준</b>마우스를 움직여 조준합니다. 화면을 클릭하면 마우스 잠금을 시도하며, 잠금이 안 되면 화면 안에서 조작합니다. 왼쪽 버튼을 누르고 있으면 사격합니다.</p><p><kbd>SHIFT</kbd><b>이동 방향 회피</b>회피 중 잠깐 무적입니다. 몬스터에 닿으면6, 보스는12 피해를 받습니다.</p><p><kbd>SPACE</kbd><b>점프</b>약 1m 높이로 뛰어오릅니다. 착지 후 다시 점프할 수 있습니다.</p><p><kbd>우클릭</kbd><b>장착한 보조 기술</b>시한 화약 또는 시간의 빚을 사용합니다. <kbd>I</kbd>에서 보유 유물을 봅니다.</p><p><kbd>TAB</kbd><b>지도 열기 · 닫기</b>전투 중 문은 잠깁니다. 유물을 고르면 바로 탐험으로 돌아갑니다.</p><p><kbd>E</kbd><b>상자 열기 · 상인과 거래</b>유물방 가운데 상자는 가까이 가서 E키로 엽니다. 방패는 정면 사격으로 부술 수 있습니다. 낮은 들쥐는 아래를 겨냥하세요.</p></div>
    <p class="modal-description">기둥·제단·상인·진열대는 이동을 막습니다. 각 지역 보스를 처치하면 다음 미로로 이동합니다. 회랑의 가시는 점프하거나 우회하고, 사제의 탄환 고리는 초록색 틈으로 피하세요. 마지막 지역의 붉은 위험선은 점프로 넘을 수 있습니다. 유물 심장의 보호막은 빛나는 기둥을 사격해 해제하세요. 심장 탄환은 반사·정지 가능하지만 레이저와 충격파는 불가능합니다.</p><p class="modal-footnote">ESC · 일시정지 / 마우스 해제. 화살표 키로도 시점을 조작할 수 있습니다.<br>3D 탐험은 별도로 저장됩니다.</p>${actions(button('close', '돌아가기', true))}`;
  else if (next === 'result') {
    const won = run!.player.hp > 0, nextRegion = canEnterNextRegion(run!), legacyNext = won && canAdvanceLegacy(run!);
    const title=won?run!.boss?run!.boss.kind==='relicheart'?'유물 심장을 정복했습니다.':'봉인이 풀렸습니다.':'석실을 돌파했습니다.':'유적은 다시 당신을 기다립니다.';
    const story=won?run!.boss?run!.boss.kind==='relicheart'?'최종 보스 유물 심장을 쓰러뜨렸습니다. 균열 지팡이가 영구 해금되었습니다. 세 지역의 탐험을 마쳤습니다. 첫 정복 목표로 성장 포인트 5P를 얻습니다.':run!.boss.kind==='chainpriest'?'사슬의 사제를 쓰러뜨렸습니다. 관측자의 쇠뇌가 영구 해금되었습니다. 유물의 심장으로 이어갈 수 있습니다.':'문지기 석상을 쓰러뜨렸습니다. 산탄 성물이 영구 해금되었습니다.':legacyNext?'다음 석실로 이어갈 수 있습니다.':'이전 탐험의 전투를 마쳤습니다. 새 탐험에서 유적의 미로를 탐험하세요.':`마지막 피해 · ${run!.lastDamage}`;
    html = `<div class="modal-eyebrow">${won ? 'SEAL BROKEN' : 'EXPEDITION ENDED'}</div><h2 id="modal-title">${title}</h2><p>${story}</p><div class="result-stats"><span>처치 <b>${run!.stats.kills}</b></span><span>유물 <b>${run!.expedition?.acquired.length??0}</b></span><span>금화 <b>${run!.gold}</b></span></div>${actions((nextRegion ? button('next-region',run!.expedition!.region===2?'세 번째 지역으로':'두 번째 지역으로',true) : legacyNext ? button('next-room','다음 석실로',true) : button('new', '새 탐험 시작', true)) + button('home', '야영지로'))}<p class="modal-footnote">달성한 영구 목표와 무기 해금은 다음 탐험에도 남습니다.</p>`;
    if(won&&(run!.expedition?.dungeon?.layoutVersion ?? 0)>=2)html+=`<p>바닥 보상 ${currentRoom(run!)?.pickups?.length ?? 0}개 · 떠나면 사라집니다.</p>${actions(button('loot-boss','방으로 돌아가 보상 줍기'))}`;
  } else if (next === 'storage-error') {
    const conflict=recovery.mode==='conflict',writing=recovery.mode==='write';
    html = `<div class="modal-eyebrow">SAVE INTERRUPTED</div><h2 id="modal-title">${conflict?'다른 창의 최신 기록이 있습니다.':writing?'탐험 기록을 저장하지 못했습니다.':'탐험 기록을 불러오지 못했습니다.'}</h2><p id="storage-message"></p>${actions(button('retry-save',conflict?'최신 기록 불러오기':writing?'저장 다시 시도':'저장 다시 읽기',true))}<p class="modal-footnote">${conflict?'현재 창의 진행을 최신 기록에 덮어쓰지 않습니다. 불러온 기록은 야영지에서 이어갈 수 있습니다.':writing?'현재 진행은 이 화면에서 유지하고 있습니다.':'기존 기록을 변경하지 않고 다시 읽습니다.'}</p>`;
  } else if (next === 'renderer-error') {
    html = `<div class="modal-eyebrow">EXPEDITION PAUSED</div><h2 id="modal-title">3D 화면이 중단되었습니다.</h2><p>탐험을 일시정지했습니다. 화면을 다시 열면 저장된 위치에서 이어갈 수 있습니다.</p>${actions((world.ready ? button('resume', '탐험 재개', true) : '') + button('reload', '저장하고 다시 열기', !world.ready))}`;
  } else if (next === 'performance-pause') {
    html = `<div class="modal-eyebrow">EXPEDITION PAUSED</div><h2 id="modal-title">프레임 저하로 탐험을 멈췄습니다.</h2><p>전투 계산이 약 2초 동안 계속 뒤처져 탐험을 일시정지했습니다. 그래픽 설정에서 효과 감소를 켜거나 다른 작업을 닫은 뒤 재개하세요.</p>${actions(button('graphics-settings', '그래픽 설정', true) + button('resume', '전투 재개'))}<p class="modal-footnote">대기 중에는 공격과 유물 시간이 흐르지 않습니다. 재개할 때 밀린 시간을 한꺼번에 처리하지 않습니다.</p>`;
  }
  $('panel').innerHTML = html;
  if(next==='bindings')$('panel').querySelector<HTMLButtonElement>('[data-action="bindings-apply"]')!.disabled=!!bindingWaiting||!!(bindingFeedback ?? bindingIssue(bindingDraft))||JSON.stringify(bindingDraft)===JSON.stringify(settings.bindings ?? DEFAULT_BINDINGS);
  if(next==='help'){
    const mapping:Record<string,BindingAction>={SHIFT:'dodge',SPACE:'jump',우클릭:'auxiliary',TAB:'map',E:'interact',I:'inventory'};
    for(const el of $('panel').querySelectorAll('kbd')){const action=mapping[el.textContent ?? ''];if(action)el.textContent=keyLabel(action);else if(el.textContent==='WASD')el.textContent=['forward','left','backward','right'].map(a=>keyLabel(a as BindingAction)).join('/');}
    $('panel').innerHTML=$('panel').innerHTML.replace('왼쪽 버튼을 누르고 있으면 사격합니다.',`${keyLabel('fire')}를 유지하면 사격합니다.`).replace('E키로 엽니다.',`${keyLabel('interact')}키로 엽니다.`).replace('화살표 키로도 시점을 조작할 수 있습니다.',`${['lookLeft','lookRight','lookUp','lookDown'].map(a=>keyLabel(a as BindingAction)).join('/')} 키로도 시점을 조작할 수 있습니다.`);
  }
  if (next === 'storage-error') $('storage-message').textContent = storageError;
  modalFocus.restore(next,$('panel'));
}
function resume() {
  if (!playable()) return;
  modal = ''; $('expedition').dataset.ui = ''; $('overlay').hidden = true; controls.clear(); clock.reset(); adaptiveQuality.resetSamples(); previousMotion = null; lastFrame = performance.now(); renderTiming.reset(lastFrame);
  audio.unlock(); controls.lock();
}
function closeCodex(){const parent=codexParent;showModal(codexReturn);closeTo=parent;}
function closeBindings(){bindingWaiting=null;const parent=bindingParent;showModal(bindingReturn);closeTo=parent;}
function captureBinding(code:string){
  const action=bindingWaiting;if(!action)return;const normalized=normalizeBindingCode(code);bindingWaiting=null;
  if(normalized){bindingDraft[action]=normalized;bindingFeedback=bindingIssue(bindingDraft);}else bindingFeedback='사용할 수 없는 키입니다. 다른 키를 선택하세요.';
  showModal('bindings');
}
window.addEventListener('keydown',e=>{
  if(modal!=='bindings'||!bindingWaiting||e.isComposing||e.keyCode===229)return;
  e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
  if(e.code==='Escape'){bindingWaiting=null;bindingFeedback=null;showModal('bindings');return;}
  const code=normalizeBindingCode(e.code);
  if(e.metaKey||e.ctrlKey&&code!=='Control'||e.altKey&&code!=='Alt'){bindingFeedback='조합키 대신 단독 키를 누르세요.';showModal('bindings');return;}
  captureBinding(e.code);
},true);
window.addEventListener('mousedown',e=>{
  if(modal!=='bindings'||!bindingWaiting||(e.target as Element).closest('button,input,select'))return;
  e.preventDefault();e.stopImmediatePropagation();captureBinding(`Mouse${e.button}`);
},true);
window.addEventListener('contextmenu',e=>{if(modal==='bindings')e.preventDefault();},true);
window.addEventListener('keydown',e=>{
  if(!modal||e.key!=='Tab'||e.ctrlKey||e.altKey||e.metaKey)return;
  if(modal==='map'&&!e.shiftKey&&(settings.bindings??DEFAULT_BINDINGS).map==='Tab'){if(e.repeat){e.preventDefault();e.stopPropagation();}return;}
  modalFocus.tab(e,$('panel'));
},true);
function keyHints(){
  const targets:[string,BindingAction][]=[['.abilities > div:first-child kbd','dodge'],['.abilities > div:nth-child(2) kbd','auxiliary'],['.abilities > p:first-of-type kbd','jump'],['#inventory-button kbd','inventory'],['#map-button','map'],['#pause-button','pause']];
  for(const [selector,action]of targets){const el=document.querySelector(selector);if(el)el.textContent=keyLabel(action);}
}
function updateCodex(){
  if(modal!=='codex')return;
  codexOptions.query=$<HTMLInputElement>('codex-search').value;
  codexOptions.status=$<HTMLSelectElement>('codex-status').value as CodexOptions['status'];
  codexOptions.rarity=$<HTMLSelectElement>('codex-rarity').value as CodexOptions['rarity'];
  const viewed=run ?? record?.run ?? null;
  $('codex-results').innerHTML=codexResultsMarkup(recordGrowth(profile,viewed),viewed,codexOptions);
}
function togglePause() {
  if(modal==='bindings'){closeBindings();return;}
  if(modal==='codex'){closeCodex();return;}
  if(run&&!modal&&cancelFirstPortal(run)){notice('미완성 공허의 문을 취소했습니다.');void persist();return;}
  if (['help','inventory','map','settings'].includes(modal) && closeTo) { showModal(closeTo); return; }
  if (!run || ['home', 'reward', 'result', 'region-transition', 'storage-error', 'renderer-error', 'performance-pause'].includes(modal)) return;
  if (['help', 'inventory', 'map'].includes(modal) && closeTo) showModal(closeTo);
  else if (modal) resume(); else { showModal('pause'); void persist(); }
}
function toggleMap() {
  if (modal&&modal!=='map') return false;
  if (!run||!['ready','combat','explore'].includes(run.phase)) return false;
  if (modal === 'map') { if (closeTo) showModal(closeTo); else resume(); } else showModal('map');
  return true;
}
function openShop() {
  if (!run || currentRoom(run)?.kind !== 'shop' || run.phase !== 'explore') return;
  refreshShop(run); showModal('shop');
}
async function interact() {
  if (!active() || busy || !run) return;
  if(lockedDoorNearby(run)){if(unlockDoor(run))await persist();notice(run.notice ?? '비밀의 열쇠가 필요합니다.');delete run.notice;return;}
  if(run.boss?.hp===0&&currentRoom(run)?.kind==='boss'){showModal('result');return;}
  if (currentRoom(run)?.kind === 'shop') { openShop(); return; }
  if (!openTreasure(run)) return;
  busy = true; showModal('reward');
  try { await persist(); } finally { busy = false; }
}
async function startNew() {
  run = createDungeonRun(crypto.getRandomValues(new Uint32Array(1))[0],3);
  run.weapon = selectedWeapon(profile); beginGrowthRun(run, profile.investment, crypto.randomUUID(), profile.rooms.length > 0, growthRelicUnlocks(profile));
  controls.yaw = -Math.PI / 2; controls.pitch = 0; lastCue = 0; combatHud.resetMap();
  run.player.lastX = 0; run.player.lastY = -1;
  if (await persist()) resume();
}
$('panel').addEventListener('click', async e => {
  const element = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!element || element.disabled || busy) return;
  const action = element.dataset.action!; busy = true;
  try {
    if (action === 'new') await startNew();
    else if (action === 'continue') {
      run = structuredClone(record!.run!); controls.yaw = run.view?.yaw ?? run.player.aim;
      if (run.growth && profile.rooms.length) run.growth.firstRoomCleared = true;
      controls.pitch = run.view?.pitch ?? 0; lastCue = run.nextId; combatHud.resetMap();
      const completed=completionModal(run);if(completed)showModal(completed);else resume();
    } else if (action === 'resume') resume();
    else if(action==='next-room'&&run&&advanceRoom(run)){controls.yaw=-Math.PI/2;controls.pitch=0;combatHud.resetMap();if(await persist())resume();}
    else if(action==='loot-boss'&&run?.boss?.hp===0){run.phase='explore';if(await persist())resume();}
    else if (action === 'next-region') { if(run && canEnterNextRegion(run)) showModal('region-transition'); }
    else if (action === 'enter-region') {
      if(run && canEnterNextRegion(run) && await persist() && enterNextRegion(run)) {
        controls.yaw=-Math.PI/2; controls.pitch=0; combatHud.resetMap();
        if(await persist()) { notice(`${regionName(run)} · 지역 ${run.expedition!.region}`); resume(); }
      }
    }
    else if (action === 'close') { if(modal==='region-transition') { showModal('result'); return; } if (['help', 'inventory', 'map', 'settings'].includes(modal) && closeTo) showModal(closeTo); else if (run && modal !== 'growth' && modal !== 'weapons' && (playable() || run.phase === 'cleared')) { const completed=completionModal(run);if(completed)showModal(completed);else resume(); } else showModal('home'); }
    else if (action === 'save-home' || action === 'home') { if (await persist()) showModal('home'); }
    else if(action==='close-codex')closeCodex();
    else if(action==='bindings'){bindingDraft={...(settings.bindings ?? DEFAULT_BINDINGS)};bindingWaiting=null;bindingFeedback=null;bindingReturn=modal;bindingParent=closeTo;showModal('bindings');}
    else if(action.startsWith('bind-')){const id=action.slice(5) as BindingAction;if(ACTIONS.some(a=>a.action===id)){bindingWaiting=id;bindingFeedback=null;showModal('bindings');}}
    else if(action==='bindings-reset'){bindingDraft={...DEFAULT_BINDINGS};bindingWaiting=null;bindingFeedback=null;showModal('bindings');}
    else if(action==='bindings-cancel')closeBindings();
    else if(action==='bindings-apply'&&!bindingWaiting&&!bindingIssue(bindingDraft)){settings.bindings={...bindingDraft};controls.clear();if(await persist(undefined,undefined,run ?? record?.run ?? null)){bindingFeedback=null;showModal('bindings');$('binding-status').textContent='키 설정을 저장했습니다.';keyHints();}}
    else if (action === 'help' || action === 'inventory' || action === 'settings'||action==='codex') showModal(action);
    else if (action === 'graphics-settings') showModal('settings');
    else if (action === 'reset-sensitivity') { setSensitivity(MOUSE_SENSITIVITY.default); await saveSettings(); }
    else if (action === 'reroll-reward') {
      if (run && modal === 'reward' && rerollReward(run)) { showModal('reward'); await persist(); }
    }
    else if(action==='crown-cancel'){const next=pendingCrown?.action==='buy'?'shop':'reward';pendingCrown=null;showModal(next);}
    else if(action==='reward-return')showModal('reward');
    else if(action==='crown-abandon'){if(chooseRelic(run!,'skip',pendingSkipRevision)&&await persist())resume();}
    else if(action==='crown-confirm'&&pendingCrown){const pending=pendingCrown;pendingCrown=null;
      if(JSON.stringify(crownPlan(run!))!==JSON.stringify(pending.plan)){showModal(pending.action==='buy'?'shop':'reward');return;}
      const okay=pending.action==='choose'?chooseRelic(run!,'R47',pending.revision):currentRoom(run!)?.shop?.slots[pending.value]?.relic==='R47'&&buyFromShop(run!,pending.value,pending.revision)==='bought';
      if(okay&&await persist())resume();else showModal(pending.action==='buy'?'shop':'reward');
    }
    else if (action.startsWith('choose-')) {
      const choice=action.slice(7) as RelicId|'skip'|'gold',revision=Number(element.dataset.revision ?? 1);
      if(choice==='R47'){const plan=crownPlan(run!);if(plan){pendingCrown={plan,action:'choose',value:0,revision};showModal('crown-confirm');}return;}
      if(choice==='skip'&&crownOwner(run!)){pendingSkipRevision=revision;showModal('crown-abandon');return;}
      if (chooseRelic(run!, choice,revision) && await persist()) { audio.play('cleared');if(run!.phase==='cleared')showModal('reward');else resume(); }
    } else if (action === 'leave-altar') { if (leaveAltar(run!) && await persist()) resume(); }
    else if(action.startsWith('energy-')){if(spendAbsorbEnergy(run!,action.slice(7) as AuxiliaryId)){await persist();showModal('inventory');}}
    else if (action.startsWith('equip-')) { if (equipAuxiliary(run!, action.slice(6) as AuxiliaryId)) { await persist(); showModal('inventory'); } }
    else if (action.startsWith('buy-')) {
      const index=Number(action.slice(4));if(currentRoom(run!)?.shop?.slots[index]?.relic==='R47'){const plan=crownPlan(run!);if(plan){pendingCrown={plan,action:'buy',value:index,revision:Number(element.dataset.revision)};showModal('crown-confirm');}return;}
      const result = buyFromShop(run!, Number(action.slice(4)), Number(element.dataset.revision));
      if (result === 'bought' && await persist()) { notice('거래 완료'); resume(); } else if (result !== 'bought') showModal('shop');
    } else if (action === 'growth') { growthDraft = { ...profile.investment }; showModal('growth'); }
    else if (action.startsWith('growth-add-') || action.startsWith('growth-sub-')) {
      growthDraft = changeInvestment(growthDraft, action.slice(11) as GrowthStat, action.startsWith('growth-add') ? 1 : -1, earnedPoints(profile)); showModal('growth');
    } else if (action === 'growth-reset') { growthDraft = emptyInvestment(); showModal('growth'); }
    else if (action === 'growth-save') { if (await persist(growthDraft, undefined, run ?? record?.run ?? null)) { notice('성장 투자 저장됨 · 다음 탐험부터 적용'); showModal('home'); } }
    else if (action === 'weapons') { weaponDraft = selectedWeapon(profile); showModal('weapons'); }
    else if (action.startsWith('weapon-pick-')) { const id = action.slice(12) as WeaponId; if (weaponUnlocked(profile, id)) weaponDraft = id; showModal('weapons'); }
    else if (action === 'weapon-save') { if (await persist(undefined, weaponDraft, run ?? record?.run ?? null)) showModal('home'); }
    else if (action === 'sound') { settings.sound = !settings.sound; audio.enabled = settings.sound; if (!settings.sound) audio.suspend(); await persist(); showModal('pause'); }
    else if (action === 'reload') { if (await persist()) location.reload(); }
    else if (action === 'retry-save') {
      try{const result=await recovery.retry(store);record=result.record;profile=recordGrowth(record?.profile??defaultProfile(),record?.run??null);storageError='';
        if(result.kind==='loaded'){run=null;settings={...defaultSettings(),...record?.settings};adaptiveQuality.setMode(settings.graphicsQuality??'auto');world.setQuality(adaptiveQuality.level);audio.enabled=settings.sound;$('save-status').textContent='기록 불러옴';showModal('home');}
        else{$('save-status').textContent='탐험 저장됨';showModal(run?completionModal(run)??'pause':'home');}
      }catch(error){storageError=error instanceof Error?error.message:String(error);showModal('storage-error');}
    }
  } finally { busy = false; }
});
function setSensitivity(value: number) {
  settings.mouseSensitivity = value;
  $<HTMLInputElement>('mouse-sensitivity').value = String(value);
  $('sensitivity-value').textContent = `${value.toFixed(2)}배`;
  $('settings-status').textContent = '저장 중';
}
async function saveSettings() {
  if (await persist(undefined, undefined, run ?? record?.run ?? null) && modal === 'settings') $('settings-status').textContent = '설정 저장됨';
}
$('panel').addEventListener('input', e => {
  const input = e.target as HTMLInputElement;
  if(input.id==='codex-search'){updateCodex();return;}
  if (input.id === 'mouse-sensitivity' && validMouseSensitivity(input.valueAsNumber)) setSensitivity(input.valueAsNumber);
});
$('panel').addEventListener('change', e => {
  const input = e.target as HTMLInputElement;
  if(input.id==='codex-status'||input.id==='codex-rarity'){updateCodex();return;}
  if (input.id === 'graphics-quality') {
    if (!validGraphicsMode(input.value)) return;
    settings.graphicsQuality = input.value;
    adaptiveQuality.setMode(input.value);
    world.setQuality(adaptiveQuality.level);
    lastQualitySample = 0;
  } else if (input.id === 'fps-limit') {
    const value = Number(input.value);
    if (![0, 30, 60, 120, 144].includes(value)) return;
    settings.fps = value; clock.reset(); previousMotion = null;
    lastFrame = performance.now(); renderTiming.reset(lastFrame);
  } else if (input.id === 'show-fps') { settings.showFps = input.checked; $('fps-counter').hidden = !input.checked; }
  else if (input.id === 'reduced-motion') settings.reducedMotion = input.checked;
  else if (input.id !== 'mouse-sensitivity') return;
  $('settings-status').textContent = '저장 중'; void saveSettings();
});
$('map-button').addEventListener('click', toggleMap);
$('pause-button').addEventListener('click', togglePause);
$('inventory-button').addEventListener('click', () => { if (run) showModal('inventory'); });
$('interact').addEventListener('click', interact);
world.renderer.domElement.addEventListener('webglcontextlost', () => { showModal('renderer-error'); if (run) void persist(); });
world.renderer.domElement.addEventListener('webglcontextrestored', () => { if (modal === 'renderer-error') showModal('renderer-error'); });
const backgroundPause = () => { if (active()) { showModal('pause'); void persist(); } };
window.addEventListener('blur', backgroundPause);
document.addEventListener('visibilitychange', () => { if (document.hidden && run && !modal) { showModal('pause'); void persist(); } });

function frame(now: number) {
  const dt = lastFrame ? now - lastFrame : 0; lastFrame = now;
  if (active()) clock.advance(dt, () => {
    if (!active()) return false;
    const s = run!, beforeRoom = s.expedition?.room??0, beforePhase = s.phase, beforeRelics = s.expedition?.relics.length??0;
    previousMotion = captureMotion(s);
    const input = controls.consume(s.player), auxId = activeAuxiliary(s), stoneUse = input.auxiliary && auxId === 'R16', puppetUse = input.auxiliary && auxId === 'R17', decoyUse = input.auxiliary && auxId === 'R18', oldStoneCooldown = s.player.auxCooldowns?.R16 ?? 0, oldPuppetCooldown = s.player.auxCooldowns?.R17 ?? 0, oldDecoyCooldown = s.player.auxCooldowns?.R18 ?? 0;
    const anchorUse = input.auxiliary && auxId === 'R26', oldAnchor = s.anchor?.id, oldAnchorCooldown = s.player.auxCooldowns?.R26 ?? 0;
    const oldPortal=s.portals?.id,oldPair=!!s.portals?.second,oldAbsorb=s.player.auxCooldowns?.R42 ?? 0;
    s.view = { yaw: controls.yaw, pitch: controls.pitch }; step(s, input);
    if (stoneUse && (s.player.auxCooldowns?.R16 ?? 0) <= oldStoneCooldown) {
      const reason = stoneWallFailure(s, { x: input.aimX, y: input.aimY }); if (reason) notice(reason);
    }
    if (puppetUse && (s.player.auxCooldowns?.R17 ?? 0) <= oldPuppetCooldown) {
      const reason = puppetFailure(s, { x: input.aimX, y: input.aimY }, input.aimPitch); if (reason) notice(reason);
    }
    if (decoyUse && (s.player.auxCooldowns?.R18 ?? 0) <= oldDecoyCooldown) {
      const reason = scarecrowFailure(s, { x: input.aimX, y: input.aimY }); if (reason) notice(reason);
    }
    if (anchorUse && s.anchor?.id === oldAnchor && (s.player.auxCooldowns?.R26 ?? 0) <= oldAnchorCooldown) { const reason = anchorFailure(s); if (reason) notice(reason); }
    if(input.auxiliary&&auxId==='R40'&&s.portals?.id===oldPortal&&!!s.portals?.second===oldPair){const reason=portalFailure(s,{x:input.aimX,y:input.aimY});if(reason)notice(reason);}
    if(input.auxiliary&&auxId==='R42'&&(s.player.auxCooldowns?.R42 ?? 0)<=oldAbsorb){const reason=absorptionFailure(s);if(reason)notice(reason);}
    for (const cue of s.cues) if (cue.id > lastCue) {
      audio.play(cue.kind === 'evade' ? 'dodge' : cue.kind); lastCue = cue.id;
      if (cue.kind === 'evade') notice(`대피의 깃털 발동 · ${(cue.amount * .04).toFixed(1)}m · 이번 방 기회 사용`);
    }
    if (beforeRelics > (s.expedition?.relics.length??0)) notice(s.revival?.tick === s.tick ? '왕의 계약 발동 · 유물을 대가로 부활했습니다' : '응급 붕대 소모 · 치명타를 버텼습니다');
    const completed=completionModal(s);if(completed){showModal(completed);void persist();}
    else if (beforeRoom !== (s.expedition?.room??0)) { notice(roomInfo(s).name); if (currentRoom(s)?.kind === 'shop') openShop(); void persist(); }
    else if (beforePhase === 'combat' && s.phase === 'explore') { audio.play('cleared'); notice((s.expedition?.dungeon?.layoutVersion ?? 0)>=2?'석실 돌파 · 바닥 보상을 확인하세요 · 문이 열렸습니다':'석실 돌파 · +8 금화 · 문이 열렸습니다'); void persist(); }
    if(s.notice){notice(s.notice);delete s.notice;void persist();}
    else if (s.tick % 300 === 0) void persist();
    return active();
  }); else clock.reset();
  if (active() && clock.shouldPause) { showModal('performance-pause'); audio.suspend(); void persist(); }
  if (renderTiming.due(now, settings.fps)) {
    const s = run ?? preview;
    if (!lastHudUpdate || now - lastHudUpdate >= 100) {
      lastHudUpdate = now;
      combatHud.update(s, { modal, yaw: controls.yaw, reducedMotion: settings.reducedMotion,bindings:settings.bindings,
        mouseCaptured: document.pointerLockElement === world.renderer.domElement, noticeUntil });
      keyHints();
    }
    world.paint(s, run ? controls.yaw : -Math.PI / 2, run ? controls.pitch : -0.04, active() && controls.moving, !!modal,
      { reducedMotion: settings.reducedMotion, motion: active() ? interpolateMotion(s, previousMotion, clock.alpha) : undefined });
    renderTiming.rendered(now);
    if (now - lastQualitySample >= 500 && renderTiming.fps > 0) {
      lastQualitySample = now;
      const level = adaptiveQuality.sample(now, renderTiming.fps, active(), settings.fps);
      world.setQuality(level);
    }
    $('fps-counter').hidden = !settings.showFps;
    $('fps-counter').textContent = renderTiming.fps ? `${renderTiming.fps} FPS` : 'FPS 측정 중';
  }
  requestAnimationFrame(frame);
}
async function boot() {
  try { record = await recovery.read(store); settings = { ...defaultSettings(), ...record?.settings }; profile = recordGrowth(record?.profile ?? defaultProfile(), record?.run ?? null); }
  catch (error) { storageError = error instanceof Error ? error.message : String(error); }
  adaptiveQuality.setMode(settings.graphicsQuality ?? 'auto'); world.setQuality(adaptiveQuality.level);
  audio.enabled = settings.sound; $('save-status').textContent = storageError ? '저장 기록 오류' : '3D 탐험 기록';
  showModal(storageError ? 'storage-error' : 'home'); requestAnimationFrame(frame);
}
void boot();
