# 모델 원본과 검토 자료

캐릭터·보스 15종과 투사체 16종의 Blender 원본, 애니메이션 검토 자료, 제작 스크립트를 보관합니다. **이 캐릭터·투사체 검토본은 현재 게임에 적용하지 않았습니다.** 각 manifest의 `game_applied: false`도 이 상태를 나타냅니다.

| 위치 | 내용 |
| --- | --- |
| `monster-review/monsters-combat-edge-fixed.blend` | 캐릭터·보스 15종의 대기·이동·공격·피격 모션과 칼날 방향 수정본 |
| `monster-review/monsters-combat-review.blend` | 칼날 방향 수정 전 공격·피격 검토본 |
| `monster-review/monsters-motion-review.blend` | 이동 모션 검토본 |
| `monster-review/monsters-review.blend` | 모델 구성 검토본 |
| `monster-review/swords-edge-fixed.gif` | 수정된 검 베기 모션 미리보기 |
| `monster-review/sword-edge-verification.json` | 검의 칼날 방향 검증 결과 |
| `projectile-review/projectiles-review.blend` | 투사체 16종과 효과·움직임 검토본 |
| `projectile-review/projectiles-motion.gif` | 투사체 모션 미리보기 |
| `weapon-models.blend` | 현재 게임에서 사용하는 무기 4종의 Blender 원본 |
| `../public/models/weapons/` | 현재 실행판에 포함하는 무기 GLB 4개 |
| `../scripts/` | 모델 제작·모션·검토·검증 스크립트 |

현재 캐릭터와 투사체는 게임의 기존 코드로 표시됩니다. 새 검토본을 적용할 때는 최종 모델과 모션을 웹용으로 내보내고, 해당 모델을 게임의 표시 코드에 연결해야 합니다. 원본을 업로드하는 것만으로 실행판의 캐릭터나 투사체는 바뀌지 않습니다.

렌더링 중간 프레임과 Blender 자동 백업은 제외하고, `.blend` 원본·manifest·PNG·GIF 검토 결과를 보관합니다. Blender 파일에는 카메라, 조명, 검토용 배열과 실제 모델이 함께 들어 있습니다.
