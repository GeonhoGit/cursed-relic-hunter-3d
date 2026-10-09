# 남은 유물 추가 계획 전체 완료

기준: 승인된 `../specs/2026-10-05-remaining-relics-design.md`, 상위 폴더에서 실제 확인한 `저주받은_유물_사냥꾼_상세기획서_v1_4.md` §6.3/6.5. 목표: 기존 48종에 R28/R35/R36/R39/R40/R41/R42/R47/R48을 더해 57종의 실제 획득·효과·저장·표시를 완성한다.

## 작업과 완료 증거

- [x] 1. 공통 타입·신규 12방 지형, 구덩이/안전 착지, 잠금방/열쇠, 바닥 보상/자석/FIFO 회복품, 성장 목표 12개.
- [x] 2. 공허의 문, 잊힌 이름표, 검은 태양의 독립 규칙 및 공통 전투·타이머 통합.
- [x] 3. 봉인된 왕관의 미래 지정 보상 예약/부분 선택/새로고침/영구 포기, 거꾸로 된 지도의 공개/무보상 재전투.
- [x] 4. prototype-0.14 저장·이전 버전 호환, 실제 획득 UI/상호작용/F키/효과 렌더링.
- [x] 5. 집중 회귀·전체 단위·빌드·헤드리스 브라우저 검증, 최종 독립 검토, 문서 갱신.

## 공통 인터페이스와 소유

root가 model/simulation/전투/획득/지형/저장/UI를 소유한다. 포털 작업자는 `src/core/portal.ts`, `tests/portal-relic.test.ts`만 소유한다. 은신·흡수 작업자는 `src/core/shadow-absorb.ts`, `tests/shadow-absorb-relics.test.ts`만 소유한다. 공통 파일을 수정하지 않으며 root가 반환된 순수 규칙을 통합한다.

R40: RunState.portals = {first: Point, second?: Point, ticks: number, id: number}. cooldown은 player.auxCooldowns.R40. export placePortal/portalFailure/agePortals/cancelFirstPortal/clearPortals/portalCrossing. crossing은 {t,point,exit,portalId}로 첫 교차를 반환하고 실제 bullet 이동·충돌 처리는 root가 순서화한다. Bullet.portalTrips/portalLockUntil/portalPairId.

R41/R42: Player.quietTicks/stealthed/dodgeLock, RunState.absorption = {ticks,absorbed}, RunState.absorbEnergy. export ageShadowAbsorb/breakStealth/startAbsorption/absorptionFailure/absorbBullet/spendAbsorbEnergy. root가 공격/실제 피해 활동을 breakStealth에 연결하고 타깃 선택에서 player.stealthed를 검사한다. cooldown은 player.auxCooldowns.R42. cooldownCredits로 합법적인 활성 효과 쿨다운 단축과 저장 검증을 함께 보존한다.

## 결정 기록

Ruling: 기존 누적 변경과 사용 중인 서버를 유지하는 현재 작업 폴더에서 진행한다. 요청은 지금 게임 전체 추가 계획 완성이다. 별도 checkout/commit/push는 이번 범위에 없다.

Ruling: 긴 작업의 독립 규칙 두 모듈은 dispatching-parallel-agents로 병렬 구현한다. shared integration은 inline으로 진행하며 최종 전체 검토를 한 번 수행한다.

Ruling: R37은 이미 출시된 일반 유물 획득 경로와 예전 저장 후보를 유지한다. 신규 저주 6종은 저주 획득 경로에 넣으며 성장/무저주 승리의 저주 이력 판정은 R37까지 동일 classifier에 포함한다. R44~R46은 기존 점프 유물이므로 저주에서 제외한다.

Ruling: 새 탐험만 layoutVersion2를 쓰고 createDungeon의 기본 호환 API는 version1을 유지한다. 구 저장 지형은 확장하지 않는다. 신규 잠금방은 kind=treasure와 locked 필드로 표현해 기존 보물 상자 동작을 재사용한다.

Ruling: 마우스·창 포커스를 가져오지 않는다. 브라우저 검증은 pointer lock 차단한 headless만 사용하고 실행 중 제품 소스는 수정하지 않는다.

Ruling: createDungeonRun 기본 인수도 호환 API로 version1을 유지하고 main의 실제 새 탐험에2를 명시한다. 기존 fixture를 한꺼번에 새 금화 공급/방 구조로 변경하지 않는다.

Ruling: 추가 검증 작업자는 tests/remaining-save.test.ts만 소유한다. 제품이 먼저 구현된 후 이94개 검증은 첫 실행부터GREEN이었다. 기능 구현의 RED 증거는 각 독립 규칙/remaining-foundation/remaining-integration에서 별도로 관찰했다.

Review fix: version2의 기존 구조/팔레트 적용 누락과 마지막 빈 제단의 저장 거부를 실제 실패하는 회귀 테스트로 확인하고 수정했다. 구형 지형과 구형 제단의 정확한R38/R43 제안은 보존한다.

Review fix: R38 부활에 의한R28 상실 시 pitDodge를 즉시 정리한다. 구 지형의 원래 지도 종류 표시는 보존하고 새 숨김/R31 정보 테스트는version2를 사용한다. 낙하 피해는10으로 고정하며 반격/두 번째 대피를 발동하지 않는다. 관련 정상 경로를 각각RED→GREEN으로 확인했다. 독립 검토의 Important5건을 모두 반영했다.

Final audit fix: 남은version1 전용 함정 배치 조건을 확인했다. version2에서도 구조와구덩이를 장애물로 배치 검사하며24시드×2지역×5방×7이동시점의 겹침을RED→GREEN으로 확인했다. 작은화면 스크롤 제한은새상태가있는경우에만적용해기존14패시브의가독성을보존했다. 잠금상태glyph는정보숨김과별도라새지도기존테스트도열쇠표시를검증한다.

## 검증 기록

기존 기준: 962 단위 테스트, 66 파일; 직전 build와 관련 browser 18개 통과. 다음 검증 결과는 실제 실행 후 기록한다.

중간 증거: 전체1083/1083(71파일), build 성공(953.32KB, 기존500KB 경고), 추가 저장검증94/94, 리뷰 수정 후 remaining-integration17개 중 관련 신규2개RED→GREEN. 새 Chromium7개 첫 실행5개통과, 회복/F/작은화면 재검사통과. 전체최종결과는 마지막에 기록한다.

브라우저 증거: 최종 관련20개 실행19개통과, 재전투의 일시정지/저장 대기 후 재검사1개통과(14.3초). 신규7종 동작 흐름+보스 금화경제1개와 기존지갑/대피/이동/지도/재추첨/할인/G08 회귀를 검증했다. 640×480 재접속/부분선택/스크롤과 GPU 회수를 확인했다. OS포인터/창포커스 변경 없이 headless와pointer lock 차단을 사용했다. 숨김 Vite 서버PID20848,127.0.0.1:5199 HTTP200 확인. 커밋/푸시없음.

최종 완료 증거(13:31): 전체단위1186/1186,72파일,8.98초. tsc/vite build 성공,JS954.37KB/gzip264.52KB(기존500KB경고 유지). whitespace diff --check exit0(CRLF 안내만),숨김서버HTTP200재확인. 추가30/30,실제카탈로그57/57와각ID획득/저장경로검증 완료. 실제 하위기기FPS/장기플레이밸런스와 별도 전체기획 콘텐츠는 이번 검사 완료 주장에 포함하지 않는다.
