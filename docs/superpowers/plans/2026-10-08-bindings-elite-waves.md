# 키 변경·정예방·다중 웨이브

사용자가 세기능을 함께 구현하도록 명시했다. 기준 v1.4 §4.1/9.1/8.1이며 현재3D조작과등급/경제/기존저장은유지한다.

- [x] 키17동작(이동4/시선4/사격/보조/회피/점프/상호작용/회복/인벤토리/지도/일시정지) 변경·충돌/금지키검사·초기화·실제조작/표시/저장.
- [x] 새layoutVersion3 지역당13방(ID0~11보존,ID12선택정예방),기존v0/1/2탐험구조유지.
- [x] 결정적 encounter계획: Z1총5~10·1~2웨이브/Z2총7~10·2웨이브/Z3총8~12·2~3웨이브. 활성상한8,정예방정예1+일반5. 새웨이브48틱출현예고·피격/접촉보호,문잠금·마지막웨이브에서만클리어/보상.
- [x] 지역정예guard/chainhound/heartguard: HP1.8·피해1.2·공격후재사용0.9,예고/연속공격간격유지. R17제외,일반유물의다른판정유지. 정예방20바닥금화+일반유물선택1회,일반클리어성장/회복/R48재전투제외.
- [x] prototype0.15/DBschema1 호환·전투계획/진행/키설정 strict검증,이전/미래저장보존. 단위/빌드/집중headless/독립검토·문서.

root owns model/dungeon/expedition/simulation/save/main/HUD/world/통합검증. key worker owns core/keybindings.ts,game/keybinding-ui.ts,game/fps-controls.ts,tests/keybindings.test.ts. elite worker owns core/elite.ts,core/encounters.ts,core/enemy-special.ts,core/chain-hound.ts,core/npc-combat.ts,tests/elite-encounters.test.ts. shared파일은root만수정한다. 리뷰어는마지막에읽기전용.

키계약: KeyBindings=17동작완전Record<stringcode>. Shift/Control/Alt는양쪽키정규화. 기본값기존조작,Escape는고정비상취소/일시정지,다른동작배정금지. 키보드는코드기반,Mouse0/1/2는사격/보조만허용. FpsControls constructor 8번째getter optional,기존7인수호환. 설정은draft→검사→적용/저장,작업중OS포인터/창포커스조작없음. 공격/보조키보드전환도지원한다.

전투계약: EncounterSpec={kind:Enemy.kind,elite?:true}, DungeonRoom.encounter?:{waves:EncounterSpec[][]}. buildEncounter(seed,region,roomId,baseRoster,eliteRoom=false)는자체seed RNG로계획을만들고Run.rng를바꾸지않는다. eliteDamage(e,amount),eliteCooldown(e,base),eliteHealth(kind). root는계획전체일반목록을firstRoster로보존하고wave별spawn,후속wave의spawnTicks48로예고/보호한다. 살아있는출현대기/R17전환/증원예약도활성예산에포함한다.

Ruling: 기본createDungeon/createDungeonRun API는기존v1호환으로유지하고main새출발에3을명시한다. v2의구덩이/잠금방/바닥보상/왕관은v3에도적용한다. 선택정예방은필수왕관지정보상대상이아니어서기존A/B순서를보존한다. 실제신규정예는3종에만flag를허용한다.

Ruling: 원본Z1총5~8은사용자의기존방당5~10희망에맞춰5~10으로유지한다. 활성상한8을넘는총인원은여러웨이브로나누며삭제하지않는다. 원본가격45로기존상점24를되돌리지않는다. 연습장은이번범위가아니다.

검증: 기존1192개에서 신규68개를 추가해1260/1260(77파일), 타입/빌드와 관련 headless14개 통과.160시드 토폴로지·3지역 정예·마지막 보상·웨이브 중간 복원·재전투/사망·구 탐험 유지, 키 충돌/금지키·실제 조작·초기화·작은 창/재접속을 확인했다. 독립 읽기 검토는 중요/치명 결함 없음. UI 키 안내도 실제 매핑을 사용한다. 신규 출현/정예/키 편집 사진은graphics-review/bindings-waves에 보관하고 직접 확인했다. JS974.86KB/gzip271.95KB의 기존500KB경고와 장기 밸런스/저사양 실측은 별도다. 서버5199 HTTP200, OS포인터/창포커스 조작 없음.
