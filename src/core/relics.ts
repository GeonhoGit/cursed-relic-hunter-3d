import type { RelicId, RelicRarity, RunState } from './model';

export const RELICS: Record<RelicId, { rarity: RelicRarity; name: string; icon: string; type: string; description: string }> = {
  R01: { rarity: 'rare', name: '거울 조각', icon: '◇', type: '탄환 변형', description: '탄환이 벽과 기둥에서 최대 2회 반사됩니다.' },
  R02: { rarity: 'epic', name: '유령 촉', icon: '⇢', type: '탄환 변형', description: '탄환이 적 3명을 관통하고, 네 번째 적중 후 사라집니다. 나갈 때와 귀환할 때 각각 같은 적을 한 번만 맞힙니다.' },
  R03: { rarity: 'rare', name: '갈라진 화살촉', icon: '⋔', type: '탄환 변형', description: '첫 적중에서 피해 35%의 작은 탄환 3개로 분열합니다. 작은 탄환은 재분열·귀환·상태 효과를 일으키지 않습니다.' },
  R04: { rarity: 'rare', name: '귀환의 고리', icon: '↶', type: '탄환 변형', description: '기본탄 수명이 끝나면 최대 1초 동안 돌아옵니다. 관통과 조합하면 0.25초 뒤 같은 적을 다시 맞힐 수 있습니다. 벽·적에 소멸한 탄환은 돌아오지 않습니다.' },
  R05: { rarity: 'rare', name: '추적자의 눈', icon: '◉', type: '탄환 유도', description: '기본탄·산탄·분열탄이 6m 안의 가장 가까운 적을 향해 초당 최대 60°로 휘어집니다. 벽 너머·이미 맞힌 적·무적 보스는 추적하지 않습니다. 귀환 중에는 플레이어를 향하며, 피해·탄속·수명은 그대로입니다.' },
  R07: { rarity: 'common', name: '잿불 심지', icon: '♨', type: '지속 피해', description: '탄환 적중 시 3초 동안 초당 2의 화상 피해. 다시 맞히면 시간이 갱신됩니다.' },
  R08: { rarity: 'common', name: '서리 결정', icon: '❄', type: '군중 제어', description: '3초 안에 서로 다른 기본 사격 4회 적중 시 0.6초 동결합니다. 보스는 이동만 20% 둔화하며, 해동 후 3초간 저항합니다.' },
  R11: { rarity: 'rare', name: '침묵의 종', icon: '♧', type: '기술 중단', description: '기본탄으로 봉인술사·균열 주술사의 기술 준비 또는 사슬의 사제의 소환 의식을 맞히면 취소합니다. 대상은 1초간 멈추고 기존 재사용 대기를 거칩니다. 전체 재사용 6초. 일반 전투방 첫 클리어로 해금됩니다.' },
  R12: { rarity: 'rare', name: '균열 렌즈', icon: '◈', type: '방패 해제', description: '기본탄이 정면 방패에 닿으면 방패 망령의 방패를 2초 비활성화하고 그 탄환부터 피해를 줍니다. 문지기의 방패 자세는 즉시 종료합니다. 대상별 재사용 5초, 내구도 보존. 단계 무적·심장 보호막은 해제 불가. 일반 전투방 첫 클리어로 해금됩니다.' },
  R13: { rarity: 'rare', name: '시한 화약', icon: '✹', type: '보조 기술 · 우클릭', description: '우클릭으로 최대 120u에 폭탄 설치. 1초 뒤 반경 52u에 피해 45를 줍니다. 재사용 8초, 자해 없음, 벽 뒤에는 닿지 않습니다.' },
  R20: { rarity: 'common', name: '응급 붕대', icon: '✚', type: '일회용 생존', description: '치명타를 한 번 막고 생명력 1로 생존합니다. 1.5초 무적 후 효과가 소모됩니다.' },
  R25: { rarity: 'legendary', name: '두 번째 발걸음', icon: '»', type: '회피 강화', description: '회피를 최대 2회까지 충전합니다. 1.6초마다 하나씩 회복하며, 획득 시 현재 잔량과 충전 시간은 유지됩니다.' },
  R30: { rarity: 'epic', name: '반격의 버클', icon: '⤴', type: '회피 반격', description: '회피 시작 0.1초 동안 진행 방향의 정면 90°에서 일반 탄환 1개를 피해 15로 반사합니다. 유물 심장의 일반 탄환은 반사 가능하며, 문지기·사제 탄환과 레이저·충격파는 제외됩니다. 회피당 1개, 추가 유물 효과 없음.' },
  R38: { rarity: 'legendary', name: '죽은 왕의 계약서', icon: '♜', type: '저주 · 일회성 부활', description: '치명타를 받으면 생명력 40으로 부활하고 2초간 무적. 대가로 보유한 일반 유물 2개를 무작위로 잃습니다. 획득에는 일반 유물 2개가 필요합니다.' },
  R43: { rarity: 'legendary', name: '시간의 빚', icon: '⌛', type: '저주 · 보조 기술', description: '우클릭으로 반경 160u 안의 일반 적과 탄환을 1.5초 멈춥니다. 유물 심장의 일반 탄환은 정지 가능하며, 사용 중 심장의 패턴 진행을 25% 늦춥니다. 문지기·사제와 그 탄환, 레이저·충격파는 정지 불가입니다. 종료 후 3초간 보조 기술 충전 중단, 재사용 18초.' },
  R44: { rarity: 'epic', name: '바람 깃털', icon: '↟', type: '점프 강화', description: '공중에서 스페이스바를 한 번 더 눌러 2단 점프합니다. 착지하면 다시 사용할 수 있으며, 점프에 무적은 없습니다.' },
  R45: { rarity: 'common', name: '도약의 장화', icon: '⇡', type: '점프 강화', description: '기본 점프 높이가 약 1m에서 1.5m로 증가합니다. 이동속도는 그대로이며, 바람 깃털과 조합하면 최대 높이는 2.5m입니다.' },
  R46: { rarity: 'rare', name: '진동의 발굽', icon: '◎', type: '착지 공격', description: '점프 후 착지하면 반경 1.5m에 피해 12의 충격파를 만듭니다. 재사용 3초, 자해 없음, 벽 뒤에는 닿지 않습니다.' },
  R49: { rarity: 'common', name: '붉은 숫돌', icon: '◆', type: '기본 공격 강화', description: '모든 무기의 기본탄 피해 +15%. 다른 공격력 유물과 증가율을 합산합니다. 폭탄·화상·착지 충격파의 고정 피해는 그대로입니다.' },
  R50: { rarity: 'epic', name: '거인의 인장', icon: '▣', type: '기본 공격 강화', description: '모든 무기의 기본탄 피해 +30%, 발사 간격 +5%. 다른 공격력 유물과 증가율을 합산합니다. 폭탄·화상·착지 충격파의 고정 피해는 그대로입니다.' },
  R51: { rarity: 'common', name: '결사의 송곳니', icon: '⋀', type: '조건부 공격 강화', description: '현재 생명력이 최대 생명력의 50% 이하일 때 기본탄 피해 +25%. 회복해 50%를 넘으면 해제됩니다. 다른 공격력 유물과 증가율을 합산하며, 고정 피해는 그대로입니다.' },
  R52: { rarity: 'common', name: '정밀 손목띠', icon: '⌁', type: '연사 강화', description: '모든 무기의 발사 간격이 10% 줄어듭니다. 거인의 인장·영구 공격속도 투자와 함께 적용되며, 이미 진행 중인 사격 대기는 그대로입니다.' },
  R53: { rarity: 'common', name: '돌가죽 부적', icon: '⬡', type: '피해 감소', description: '적의 공격·접촉·함정으로 받는 피해가 15% 줄어듭니다. 회피와 피격 무적 시간은 그대로입니다.' },
  R54: { rarity: 'rare', name: '온기의 등불', icon: '♧', type: '전투 후 회복', description: '일반 전투방을 클리어할 때 생명력 5를 회복합니다. 최대 생명력을 넘지 않으며, 재방문·안전한 방·보스 방에서는 회복하지 않습니다.' },
  R55: { rarity: 'rare', name: '바람의 화살깃', icon: '➶', type: '탄속 강화', description: '모든 무기의 기본탄 속도와 최대 이동 거리가 20% 증가합니다. 산탄·관통·귀환에도 적용되며, 분열탄·반사탄·고정 피해 기술은 그대로입니다.' },
  R56: { rarity: 'epic', name: '피의 성배', icon: '♜', type: '처치 회복', description: '몬스터와 보스를 처치할 때마다 생명력 2를 회복하며, 방당 최대 12까지 회복합니다. 화상·폭탄·착지 충격파 처치도 적용됩니다. 최대 생명력에서 낭비된 회복은 한도에서 차감하지 않으며, 이미 쓰러진 적에서는 회복하지 않습니다.' },
  R57: { rarity: 'legendary', name: '태양의 왕관', icon: '♔', type: '조건부 공격 강화', description: '현재 생명력이 최대 생명력의 80% 이상일 때 기본탄 피해 +35%. 80% 미만이면 해제되고 회복하면 다시 발동합니다. 다른 공격력 유물과 증가율을 합산하며, 고정 피해는 그대로입니다.' },
};
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
export const hasRelic = (state: RunState, id: RelicId) => state.expedition?.relics.includes(id) ?? false;
export const isCurse = (id: RelicId) => id === 'R38' || id === 'R43';
export const normalRelics = (s: RunState) => s.expedition?.relics.filter(id => !isCurse(id)) ?? [];
