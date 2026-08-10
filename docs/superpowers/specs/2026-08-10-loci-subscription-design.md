# Loci — 클라우드 백업 유료 구독 (500MB 무료 한도)

## 배경

Loci는 현재 로그인만 하면 클라우드 백업이 완전 무료다. 수익화를 위해 iCloud 방식(일정 용량까지 무료, 초과 시 유료 구독)을 도입한다. 로컬 저장은 언제나 완전 무료·무제한이며, 이번 변경은 **클라우드 백업 용량에만** 적용된다.

## 요금제

| 티어 | 클라우드 저장 용량 | 가격 |
|---|---|---|
| 무료 | 500MB | 무료 |
| 프리미엄 | 무제한 | 월 1,900원 |

- 무료 사용자가 500MB를 넘기면: **새로 찍는 사진의 클라우드 업로드만 중단**된다. 로컬 저장은 계속 정상 동작하고, 기존에 이미 올라간 사진은 삭제되지 않는다. 구독하면 밀려있던 사진들이 다음 동기화 때 자동으로 업로드된다.
- 트라이얼(체험 기간)은 두지 않는다 — 무료 500MB 자체가 충분한 체험 기간 역할을 한다.

## 결제 수단

App Store / Play Store 정식 인앱결제(구독)를 사용한다. **RevenueCat**으로 두 스토어의 구독을 하나의 API/대시보드로 통합 관리한다 — Expo 공식 지원, 영수증 검증을 RevenueCat이 대신 처리, 무료 티어로 이 앱 규모는 충분히 커버됨.

**전제 조건**: 실제 결제가 동작하려면 Google Play Console과 Apple Developer Program 앱 등록이 먼저 승인되어야 한다(각 스토어에 상품을 만들려면 앱이 등록돼 있어야 함). 이 스펙의 구현 범위는 스토어 승인 전까지 완성 가능한 부분(DB 구조, 용량 추적, 화면, 코드 배관)까지이고, 실제 상품 연결·결제 테스트는 스토어 승인 이후 진행한다.

## 데이터 모델

**photos 테이블에 컬럼 추가**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| size_bytes | integer | 사진 파일 크기(바이트). 로컬에 저장할 때(persistPhotos) 파일 크기를 재서 채우고, 클라우드 업로드 시 같이 전송 |

**subscriptions 테이블 신설** (Supabase만, 로컬 SQLite에는 없음 — 구독 상태는 항상 서버가 진실의 원천)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| user_id | uuid PK | auth.users 참조 |
| is_premium | boolean | 프리미엄 여부 |
| updated_at | timestamptz | 마지막 갱신 시각 |

RevenueCat의 웹훅을 Supabase Edge Function이 받아서 이 테이블을 갱신한다(구독 시작/갱신/취소/만료 이벤트).

## 클라우드 저장 용량 계산

`SELECT COALESCE(SUM(size_bytes), 0) FROM photos WHERE place_id IN (SELECT id FROM places WHERE user_id = ?) AND storage_path IS NOT NULL` — 실제로 클라우드에 올라간(storage_path가 채워진) 사진들의 크기 합. 로컬에만 있고 아직 안 올라간 사진은 용량에 안 잡힌다(어차피 이 계산은 "업로드해도 되는지" 판단에 쓰이므로).

## 업로드 시 한도 확인

`runSync.ts`의 `uploadPhoto` 실행 직전에:
1. 구독 상태 확인 (`subscriptions.is_premium`, 캐시해서 매 사진마다 다시 조회하지 않음 — 한 번의 `runSync()` 호출 동안은 한 번만 조회).
2. 프리미엄이면 바로 업로드.
3. 무료면 현재 사용량 + 이 사진 크기가 500MB를 넘는지 확인. 넘으면 이 사진은 업로드를 건너뛰고(synced는 그대로 false, 에러 아님) 다음 사진으로 넘어간다. 다음 `runSync()` 호출 때 다시 시도한다(구독하면 그때 성공).

## 화면

**계정 화면(app/login.tsx, 로그인된 상태)**: 이메일/로그아웃 버튼 아래에 저장 용량 표시를 상시 추가.
- 무료: "320MB / 500MB 사용 중" + 진행바 + "무제한으로 업그레이드" 버튼
- 프리미엄: "무제한 클라우드 저장 중" (진행바 없음)

**구독 화면(신규, app/subscribe.tsx)**: "무제한으로 업그레이드" 버튼을 누르면 이동. 월 1,900원 무제한 플랜 설명 + 구독 버튼(RevenueCat SDK의 구매 플로우 호출). 스토어 상품이 아직 없는 동안은 이 화면에서 "곧 지원 예정" 안내로 대체.

## 테스트

- 용량 합계 계산 쿼리, 한도 초과 판단 로직은 순수 함수로 분리해서 Jest 테스트(예: `wouldExceedLimit(currentUsageBytes, newPhotoBytes, limitBytes, isPremium): boolean`).
- RevenueCat SDK 연동, Supabase Edge Function 웹훅은 기존 정책대로 자동화 테스트 대상 아님 — 스토어 승인 후 실기기 수동 검증.
