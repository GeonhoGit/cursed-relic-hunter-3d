# 세 번째 지역과 유물 심장

> Use superpowers:executing-plans inline, with one independent final review.

**Goal:** 사슬의 사제 처치 후 Z3 유물의 심장에 진입해 최종 보스를 처치한다.
**Architecture:** 기존 지역 전환/저장/피격/Three.js를 확장하고 심장 전투를 별도 순수 모듈로 구현한다.
**Tech:** TypeScript, Three.js, Vitest, Playwright. 새 의존성 없음.
**Spec:** 상위 상세기획서 v1.4 §9 Z3/E10/위험선, §10 B03, G05. 아래 범위가 이번 구현의 구체적인 계약이다.

## Global constraints

- 기존 2D, Z1/Z2 밸런스, 들쥐 추격/접촉, 점프·회피·유물·상자 상호작용 보존.
- Z3 11방 미로, 새 지형 3종, 일반방 8~10마리와 궤도 감시자(E10 HP90, 6방향 피해14, 예고54틱, 대기180틱). 다른 Z3 적 3종과 전체 48유물은 이후 확장 범위.
- 위험선 예고72틱/활성36틱/휴지150틱/피해15. 고정된 안전 통로와 점프 회피, 보스방 비활성.
- B03 HP3600. 1단계 탄환8방향(15/48틱)→고정 조준 레이저(22/72틱)→확장 고리 충격파(18/60틱). 공격 사이60틱 휴식.
- 65%에서 2단계, 동일 순환 및 활성 기둥 HP100 보호막. 기둥 ID순0/1, 최대2연결. 첫 파괴 후480시뮬레이션틱과 진행 공격 완료 후 재연결 준비60틱. 파괴는 진행 공격을 취소하지 않는다.
- 30%에서 3단계 레이저→탄환. 임계치 건너뛰기 허용, 단계 전환 위험 개체 정리, 보호막/재연결 취소. 추가 보스/회복 없음.
- 일반 심장 탄환은 반사·시간정지 가능. 레이저/충격파는 불가. 시간의 빚은 심장 패턴만25% 지연. 점프로 낮은 충격파 회피 가능.
- 활성 기둥은 모든 무기의 사격으로 파괴 가능. 본체 보호막은 총탄/화약/착지/화상 피해를 모두 막는다. 다른 기둥은 기존 이동/탄환 장애물로 유지.
- 지역별 이력은 previousDungeon(Z2)과 earlierDungeon(Z1)에 보존, region 없는 기존 저장은 기존 결말. HP/금화/획득/쿨다운 보존. G05 첫 처치+5P 한 번.

## Tasks and interfaces

1. 지역/이력/지형/E10/위험선: model.ts, region.ts, growth.ts, room-layout.ts, enemy-balance.ts, enemy-ai.ts, simulation.ts, expedition.ts, fps-geometry.ts, save.ts. 지역3 생성/전환/저장/변조/위험선/일반탄 RED→GREEN.
2. 최종 보스: heart-boss.ts exports createHeart/startHeartPattern/advanceHeart/checkHeartTransition/damageHeartPillar/clearHeartShield. Boss optional shieldLinks/pillarIndex/pillarHp/relinkTicks/shockRadius/shockHit; modes include wave. boss.ts delegates, combat.ts absorbs active pillar shots and blocks all shield damage; dodge/time-debt distinguish ordinary heart bullets. Tests cover cycle, locked aim, swept annulus, shields twice, skip, pause/deterministic saves and fatal cleanup RED→GREEN.
3. UI/graphics: world.ts and main.ts display third maze, heart model, six-way watcher, full warnings, pillar link/HP and shield hint, final result and G05. Browser first→second→third, pillar shooting, third boss victory/reload; preserve old first region transition and no auto chest choices.
4. Focused→full unit/build and browser checks; independent read-only final review; docs/ledger updated. No product edits while browser tests run.

## Review focus

Check shield damage from non-bullets, same-tick transitions/fatality, pillar aim reachable with default weapon, both archived acquisition histories validated, corruption doesn't throw, shield re-link cannot softlock, phase3/death cleanup, GPU entity disposal. Ensure older saves and user rat AI remain supported.

## Ledger

Ruling: No Git repository; execute in the user's authorized folder and retain this ledger instead of Git worktree/commit scripts. Scope retains the existing 11-room/10-enemy cap, introduces E10 first; remaining Z3 enemies and all-relic expansion are future work.
Pre-flight: region/model/save share region and archives; boss/combat/save/render share optional pillar/shock fields and new stage/mode; stabilize those interfaces before integrations.

Task 1: complete — third-region.test.ts 5 RED→GREEN: archives/acquisitions, 8~10 mobs across 12 seeds/five rooms, three terrains, full 72-tick warnings and moving danger lanes, E10 timing and final growth goal.
Task 2: complete — heart-boss.test.ts first 8 RED→GREEN, 14 final tests: three phases, full locked warnings, expanding swept ring/jump, ordinary bullets/time debt, shields from all damage sources, 480 ticks/two links, exact save resume, malformed snapshots and same-tick victory/death/revival. Full units 379/379, build passed.
Task 3: browser core flow passed; regional map title and transition notice corrected from old Z2 labels following actual UI failure. Pillar label inside solid mesh removed and HP bar placed outside pillar for visible aim feedback. Browser rerun pending.

Task 3: complete — regional9/9 browser flows passed, all three original GPU checks passed; new third-region GPU check also passed after correcting the test's overly narrow z-only assertion to the actual solid pillar bounds. Heart/pillar/laser/wave/watcher screenshots visually inspected.
Final independent review: heart_final_review (gpt-6-astra), two Important findings: fractional pillar HP rejected by integer validator; malformed expedition bomb validation throws before structure validation. Both reproduced RED. Minor item descriptions still exclude all boss bullets; re-graded Important because this misleads the player's relic/tactics choice. Inventory contract test reproduced RED. One final fix pass waits for full browser run to end, preventing HMR interference.
Final: Ruling: review exclusions of remaining Z3 enemies/all-relic expansion and larger original room/wave budgets are accepted under this bounded contract — E10,11 rooms and8~10 mobs provide this playable stage; additional content remains future work.

Final: fixed fractional pillar HP — actual attack-invested projectile plus split damage save round-trip RED→GREEN; invalid0/negative/over100/NaN/Infinity still rejected.
Final: fixed malformed expedition/bomb ordering — null relic/current/archive arrays with valid live bomb RED→GREEN by structure validation before geometry access.
Final: fixed item description mismatch — actual inventory markup RED→GREEN for heart ordinary bullet reflection/stop and25% pattern delay. No deferred minors.
Final fix pass: full units382/382 and type/build passed, bundle719.13KB (existing500KB warning). Full Chromium45/45 passed before final validator/text changes; final focused8 tests including real fractional-pillar save/reload running. No second reviewer dispatch.

Task 4: complete — final focused Chromium8/8 passed (1.9m), including actual invested W01 shot→fractional pillar HP92.965→pause/save→reload, both regional transitions, pillar break/relink state, final boss goal, chest interaction, auxiliary and GPU resource release. Full unit382/382, full browser45/45 before final fixes, focused8/8 after them, type/build passed. HTTP5199 returned200. All review findings fixed; no deferred minors or further required work. Documentation updated. No Git integration/cleanup actions apply to this non-Git project; retained source and ledger in authorized folder.
