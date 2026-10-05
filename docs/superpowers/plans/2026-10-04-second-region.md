# 두 번째 지역과 사슬의 사제 구현 계획

> **For agentic workers:** Use superpowers:executing-plans inline, task-by-task.

**Goal:** 문지기 처치 후 저주받은 회랑의 11방 미로를 탐험하고 사슬의 사제를 처치한다.
**Architecture:** 선택적 region/previousDungeon을 기존 탐험에 추가한다. 지역 전환, 가시, 사제 보스는 별도 순수 규칙 모듈로 만들고 기존 이동·피격·유물·저장·Three.js 렌더링을 재사용한다.
**Tech Stack:** 기존 TypeScript, Three.js, Vitest, Playwright. 새 의존성 없음.
**Spec:** 상위 상세기획서 v1.4의 Z2/B02를 현재 FPS 검증판에 맞게 구현한다. 사용자 승인: 두 번째 지역과 새 보스. 이번 지역은 재의 사제와 기존 적의 혼합 구성으로 완주 가능하게 제공한다. E06~E08, Z3, W03, 추가 유물·성장 목표는 이번 범위에 포함하지 않는다.

## Global Constraints

- 원본 2D 수정 금지, 기존 저장 삭제/강제 새 탐험 금지.
- Z1 크기·피해·템포·유물/점프/감도 유지. 지역 번호에 따른 이중 HP 배율 없음.
- 신규 탐험은 region=1로 시작. region 없는 기존 탐험은 기존 단일 지역 결말 유지.
- Z2 전투방은 총 7~10마리, 재의 사제 HP65·피해12의 3발 사격·예고42틱·대기144틱.
- 가시: 예고60틱·활성48틱·휴지120틱·피해10. 점프 및 회피 회피 가능. 안전한 우회 경로 유지, 보스방 가시 없음.
- 보스 HP2600, 60%에서 2단계. 사슬2/3개 피해16 예고60틱, 10슬롯 중 인접2슬롯을 비운 고리 피해14 예고54틱, 의식90틱·사제2명·전투당 시도2회. 휴식72틱, 단계 전환60틱.
- 직전 지역의 미수령 보상은 이동 전 화면에 안내. 이전 지역 복귀 없음. HP/금화/유물/획득 이력/무기/성장/쿨다운 유지.

## Review Focus

- Z1 보스 처치 저장 후 재접속해도 Z2로 갈 수 있어야 한다.
- 지역 이동 실패 저장에서 탐험을 잃거나 Z1 목표/해금을 놓치지 않아야 한다.
- 이전 유물·상점 이력도 보존해 새 지역의 acquired 검증을 통과해야 한다.
- 보스 단계 전환으로 소환 시도 수가 초기화되거나 탄막이 남지 않아야 한다.
- 지역 전환/재방문에서 GPU 자원이 누적되지 않아야 한다.

## Task 1 — 지역 전환과 보상/저장 이력

Files: core/model.ts, region.ts, simulation.ts, expedition.ts, growth.ts, persistence/save.ts; tests/regions.test.ts.
Interfaces: canEnterNextRegion(s): boolean, enterNextRegion(s): boolean, regionName(s): string.
- [x] 이전 지역 미로를 previousDungeon에 보관하고 새 미로 생성. 이후 전환 재요청은 거부.
- [x] HP/골드/유물/투자/충전 보존, 위치·방 상태·위험 개체 초기화.
- [x] 두 지역의 보상/거래 이력, region 없는 저장, 지역별 목표 중복 방지 검증.
- [x] focused tests RED→GREEN, 타입 검사.

## Task 2 — 회랑 지형·재의 사제·가시

Files: core/room-layout.ts, traps.ts, enemy-balance.ts, enemy-ai.ts, simulation.ts, fps-geometry.ts; tests/regions.test.ts.
Interfaces: spikeTraps(s): Box[], trapStage(s,index): warning|active|rest, trapHits(s,before,height): Hit[].
- [x] 별도 3지형, 지역2 생성 위치/7~10마리·사제 포함.
- [x] 가시 위상과 높이·스쳐 지나간 이동·회피/피격 무적, 사제의 3탄과 조준 고정 검증.
- [x] focused tests RED→GREEN.

## Task 3 — 사슬의 사제

Files: core/priest-boss.ts, boss.ts, combat.ts, dodge.ts, time-debt.ts, persistence/save.ts; tests/priest-boss.test.ts.
Interfaces: createPriest(s): Boss, startPriestPattern(s,pattern): void, advancePriest(s): Hit[].
- [x] 사슬/고리/의식, 이동·단계 전환·두 시도 예약/해제·최종 사망 구현.
- [x] 고정 예고·틈2칸·사슬 피해/점프·소환 상한·단계 취소·저장 결정성 테스트 RED→GREEN.
- [x] 모든 보스에 기존 입체 판정/유물/접촉·예산·정리 적용.

## Task 4 — 화면과 실제 완주

Files: game/world.ts, main.ts, README.md, IMPLEMENTATION.md; tests/browser/fps.spec.ts.
- [x] 지역 안내/전환 확인/미수령 보상, HUD 보스 이름과 패턴, 지역2 재질·사제 모델·가시와 사슬/고리/소환 예고.
- [x] 첫 보스→Z2 전환→전투/유물→사제 처치→결과/재접속 브라우저 테스트.
- [x] 전체 단위, 관련 브라우저, 타입 검사/빌드 통과. 화면 직접 검수.
- [x] 최종 검토, 문서와 검증 기록 갱신.

## Ledger

작업 폴더는 Git 저장소가 아니므로 현재 폴더에서 구현하며 커밋/브랜치를 생성하지 않는다. 사용자가 실행과 지역2를 명시적으로 승인했으므로 추가 승인 질문 없이 진행한다.

Task 1: complete — regions.test.ts 4/4 RED→GREEN. 기존/새 저장, 보상 이력, 성장 지역 키와 12개 시드의 전투방 생성 검증.
Task 2: complete — corridor.test.ts 5/5 RED→GREEN. 지형3종, 가시 위상·수직/이동 판정·피격 우선순위·3발 사격 검증.
Task 3: complete — priest-boss.test.ts 11/11. 최초6개 RED→GREEN, 각 패턴 저장 후480틱 결정성·소환 상한·반사/정지·사망 정리 추가 검증. 손상된 소환 위치 목록의 validator 예외는 재현 RED→GREEN으로 해결.
Task 4: browser regions 4/4 통과 — 첫 승리 재접속/전환, 실제 문 이동, 저장 실패 재시도, 사제 처치/최종 결과. 전체 브라우저 회귀·GPU 자원 검사 및 최종 리뷰 진행 중.

가시 첫 입장 오프셋의 예고 생략을 재현하고 RED→GREEN으로 수정. 모든 가시는 각자의 첫 경고60틱 후 활성화한다. 전체 단위352/352, 타입 검사/빌드 통과. 전체 Chromium32/32 통과(가시 마지막 수정 전); 지역/GPU6개 집중 재검증 진행. 첫 지역·회랑·사제 화면을 직접 확인했다. 최종 독립 리뷰 진행 중.

Task 4: complete — 최종 지역/GPU 집중6/6 통과(52초). 전체 Chromium32/32, 전체 단위352/352, 타입 검사·빌드 통과. 서버5199 HTTP200 확인. 독립 gpt-6-astra 리뷰: Critical/Important/Minor 0, 판단 유보 0; 관련21단위 직접 확인. 문서 갱신 완료. Git 없는 폴더이므로 계획/검증 기록을 보존하고 직접 구현된 상태로 인계한다. 별도 scratch workspace 없음.
