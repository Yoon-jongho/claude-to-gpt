# GPT MCP 실전 활용 가이드

## 📋 목차

1. [GPT의 핵심 강점](#gpt의-핵심-강점)
2. [실전 워크플로우](#실전-워크플로우)
3. [도구 1: ask_gpt - 깊은 추론](#도구-1-ask_gpt---깊은-추론)
4. [도구 2: gpt_second_opinion - 독립 검증](#도구-2-gpt_second_opinion---독립-검증)
5. [도구 3: gpt_structured_extract - 구조화 추출](#도구-3-gpt_structured_extract---구조화-추출)
6. [도구 4: gpt_web_research - 웹 리서치](#도구-4-gpt_web_research---웹-리서치)
7. [도구 5-6: generate_image / edit_image](#도구-5-6-generate_image--edit_image)
8. [3개 서브 에이전트 조합 전략](#3개-서브-에이전트-조합-전략)
9. [일일 루틴 예시](#일일-루틴-예시)
10. [팁과 트릭](#팁과-트릭)
11. [실전 체크리스트](#실전-체크리스트)

---

## GPT의 핵심 강점

### 🎯 **다른 모델 계열이라는 것 자체**

이게 가장 큰 자산입니다. Claude가 자기 결론을 자기가 검토하면 **같은 사각지대에 갇힙니다.**
훈련 데이터도, 아키텍처도, 실패 패턴도 다른 모델이 보면 다른 걸 놓칩니다.

```
Claude가 놓치는 것 ∩ GPT가 놓치는 것 << Claude가 놓치는 것
```

Gemini는 "더 넓게 보는" 도구, Grok은 "더 새로운 걸 보는" 도구라면,
GPT는 **"다르게 보는"** 도구입니다.

### 🧠 **추론 깊이 직접 제어 (`reasoning_effort`)**

`none` → `low` → `medium` → `high` → `xhigh` → `max`

같은 모델에 "얼마나 오래 생각할지"를 지시할 수 있습니다.
즉답이 필요한 추출 작업과 30분 붙잡고 있어야 할 동시성 버그를
**같은 도구로 다르게** 다룰 수 있습니다.

### 🔒 **형태가 보장되는 JSON (Structured Outputs)**

"JSON으로 줘"라고 부탁하는 게 아니라 스키마를 강제합니다.
파싱 실패, 마크다운 펜스, 필드 누락이 원천적으로 없어서
**파이프라인 중간 단계**로 믿고 쓸 수 있습니다.

### 🖼️ **이미지 안 텍스트 렌더링**

GPT Image 2는 이미지 내부 글자를 제대로 씁니다.
키오스크 UI 목업, 라벨 달린 다이어그램, 대시보드 시안에 적합합니다.

### 언제 GPT를 사용하나?

#### ✅ GPT 사용

- 되돌리기 비싼 결정을 내리기 직전
- Claude의 결론을 한 번 더 거르고 싶을 때
- 어려운 알고리즘 / 동시성 / 수학적 검증
- 다음 단계가 파싱할 JSON이 필요할 때
- 글자가 들어가는 UI 목업

#### ⏭️ 다른 걸 사용

- 파일 30개+ 통째로 분석 → **Gemini** (1M 컨텍스트, 무료 티어)
- X/개발자 커뮤니티 여론 → **Grok**
- 영상 생성 → **Grok**
- 단순 코딩, 디버깅, 파일 수정 → **Claude 단독**

---

## 실전 워크플로우

### 기본 패턴: Claude → GPT → Claude

```
1. Claude가 작업 수행 (코드 작성 / 진단 / 계획 수립)
   ↓
2. "이거 틀리면 아픈가?" 판단
   ↓
3. GPT 호출 (독립 검증 또는 깊은 추론)
   ↓
4. Claude가 지적 사항 반영 후 최종 정리
```

### 검증 필요성 판단 기준

| 상황 | GPT 호출 | 이유 |
| --- | --- | --- |
| 로컬에서 바로 확인 가능 | ❌ | 그냥 돌려보면 됨 |
| 되돌리기 쉬움 (커밋 revert) | ❌ | 틀려도 싸다 |
| **DB 스키마 변경** | ✅ | 되돌리기 비쌈 |
| **결제/인증 로직** | ✅ | 틀리면 사고 |
| **부사수 코드 머지 직전** | ✅ | 내 리뷰도 틀릴 수 있음 |
| **프로덕션 배포 직전** | ✅ | 마지막 필터 |
| **아키텍처 확정** | ✅ | 6개월 후에 후회 |

---

## 도구 1: `ask_gpt` - 깊은 추론

### 언제 쓰나

- 알고리즘 복잡도 증명, 최적화
- 동시성 / 경쟁 상태(race condition) 진단
- 상태 머신 설계 및 누락 전이 찾기
- "왜 이게 가끔만 실패하지?" 류의 재현 어려운 버그

Gemini와 겹쳐 보이지만 축이 다릅니다.
**Gemini는 넓이(1M 컨텍스트), GPT는 깊이(reasoning effort)** 입니다.
파일 50개를 훑는 건 Gemini, 파일 1개를 30분 노려보는 건 GPT입니다.

### 실전 예시 1: 키오스크 타임아웃 상태 머신

```
ask_gpt 도구 사용:
model은 "sol", reasoning_effort는 "high"로

인천공항 키오스크 - 세션 타임아웃 상태 머신 설계

상황:
- Vue 3 Composition API + Pinia
- 사용자가 3분간 조작 없으면 초기 화면 복귀
- 단, 결제 진행 중에는 타임아웃 금지
- 결제 완료 후 영수증 화면은 30초 후 자동 복귀
- 뒤로가기 버튼으로 결제 화면 이탈 가능

현재 구현:
[composables/useSessionTimeout.js 내용]

질문:
1. 상태 전이 중 누락된 케이스가 있나?
2. 결제 API 응답 대기 중에 타임아웃이 걸리면 어떻게 되나?
3. 타이머 정리(cleanup)가 안 되는 경로가 있나?
4. 동시에 두 개의 타이머가 도는 시나리오가 가능한가?

각 문제마다 재현 시나리오를 단계별로 써줘.
```

**얻는 것**: "결제 API 호출 → 네트워크 지연 → 사용자가 뒤로가기 → 타임아웃 타이머
재시작 → 결제 응답 도착" 같은, 코드만 봐서는 안 보이는 경로.

### 실전 예시 2: 성능 병목 추론

```
ask_gpt 도구로 reasoning_effort를 "high"로 설정하고

이 컴포넌트가 항목 200개 넘어가면 스크롤이 끊긴다.
프로파일러 없이 코드만 보고 병목 후보를 우선순위대로 짚어줘.
각각에 대해 "이게 원인이라면 어떤 증상이 같이 나타나야 하는지"도 써줘.

[ProductList.vue 내용]
```

> 💡 마지막 문장이 핵심입니다. "이게 원인이면 X도 관찰돼야 한다"를 받으면
> 실제로 X를 확인해서 가설을 빠르게 걸러낼 수 있습니다.

### 모델 / effort 조합

| 상황 | model | reasoning_effort |
| --- | --- | --- |
| 일반 코딩 질문 | `terra` | `medium` |
| 알고리즘 증명 | `sol` | `high` |
| 재현 안 되는 버그 | `sol` | `xhigh` |
| 문서 요약, 번역 | `luna` | `low` |

### ⚠️ 주의점

- 컨텍스트를 크게 넣을 거면 비용을 먼저 보세요. 파일 30개면 Gemini Flash가 압도적으로 쌉니다.
- `xhigh` / `max`는 응답까지 몇 분 걸릴 수 있고 MCP 타임아웃에 걸립니다.
- 추론 토큰도 **출력 토큰으로 과금**됩니다. 응답 헤더의 `reasoning N`을 확인하세요.

---

## 도구 2: `gpt_second_opinion` - 독립 검증

> ⭐ **이 서버의 핵심 도구입니다.**

### 왜 필요한가

Claude에게 "네가 방금 쓴 코드 리뷰해줘"라고 하면 리뷰는 해줍니다.
그런데 **애초에 그 코드를 그렇게 쓴 이유가 되는 가정**은 잘 안 건드립니다.
자기가 옳다고 생각한 전제를 자기가 의심하기는 어렵습니다.

GPT는 그 전제를 모릅니다. 그래서 묻습니다.

### 3가지 모드

| mode | 하는 일 | 언제 |
| --- | --- | --- |
| `critique` | 결함·취약점·누락 찾기 | 코드/설계 리뷰 (기본값) |
| `verify` | 단계별로 논리 검증, 처음 깨지는 지점 특정 | 마이그레이션 계획, 진단 |
| `alternatives` | 근본적으로 다른 접근법 제시 | 아키텍처 확정 전 |

### 실전 예시 1: 부사수 코드 리뷰 2차 필터 (매일 아침)

기존 루틴이 `Gemini 분석 → Claude 정리 → Linear 코멘트`였다면,
Linear에 올리기 **직전에** 한 단계를 넣습니다.

```
Step 1-2: (기존과 동일) 파일 수집 → Gemini 분석 → Claude가 리뷰 초안 작성

Step 3: GPT 2차 필터
────────────────────
"gpt_second_opinion 도구 사용:
mode는 "critique", reasoning_effort는 "high"

subject:
인천공항 키오스크 결제 모듈 PR (Vue 3 + Pinia, 15개 파일 850줄)
[변경된 코드]

claude_conclusion:
내가 작성한 리뷰 초안이야. 이대로 부사수에게 전달할 예정.

🚨 Critical
1. src/api/payment.js:45 - 카드 정보 console.log 노출
⚠️ High
2. src/components/ProductList.vue:78 - v-for 내부 computed 호출
💡 Medium
3. 터치 버튼 44px 미만

이 리뷰 자체를 검토해줘:
- 내가 놓친 심각한 문제가 있나?
- 내가 Critical로 잡은 게 과한가?
- 리뷰 톤이 2년차 주니어에게 적절한가?"

Step 4: 반영 후 Linear 코멘트 (Claude)
```

**실제로 잡히는 것들:**
- "console.log 지적은 맞는데, 그 아래 45-52줄에서 카드번호가 **Pinia store에 그대로 저장**되고 있다.
  이게 더 심각하다. store는 devtools에 다 보인다."
- "터치 버튼 44px은 iOS HIG 기준이다. 이 키오스크는 32인치 세로 디스플레이라
  손가락 각도가 달라서 실측 기준이 따로 필요하다. Medium이 아니라 별도 확인 항목이다."

> 💡 리뷰어의 리뷰를 받는 셈입니다. 부사수에게 전달되기 전에 한 번 걸러지니
> 리뷰 신뢰도가 올라가고, 과한 지적으로 주니어 기죽이는 일도 줄어듭니다.

### 실전 예시 2: DB 마이그레이션 계획 검증

```
gpt_second_opinion 도구 사용:
mode는 "verify", model은 "sol", reasoning_effort는 "high"

subject:
운영 중인 키오스크 주문 테이블에 결제수단 컬럼 추가 마이그레이션.
- orders 테이블 약 240만 행
- 무중단 요구 (키오스크는 05:00-23:00 운영)
- MySQL 8.0

claude_conclusion:
내 계획:
1. payment_method 컬럼 NULL 허용으로 추가 (ALTER TABLE)
2. 애플리케이션 배포 (새 주문은 값 채움, 읽을 때 NULL 허용)
3. 배치로 과거 데이터 백필 (1만 건씩)
4. NOT NULL 제약 추가
5. 구 컬럼 제거

근거: 컬럼 추가는 MySQL 8.0에서 INSTANT DDL이라 락이 없다.

각 단계가 실제로 안전한지 검증해줘.
```

**얻는 것**: "1번의 INSTANT DDL 가정이 조건부다. `ALTER TABLE ... ADD COLUMN`이
INSTANT가 되려면 컬럼이 **맨 뒤**에 추가되어야 하고 ROW_FORMAT 제약이 있다.
`AFTER some_column`을 쓰면 즉시 테이블 리빌드로 떨어진다" 같은,
**전제 자체의 균열**.

### 실전 예시 3: 아키텍처 대안 탐색

```
gpt_second_opinion 도구 사용:
mode는 "alternatives"

subject:
모노레포 packages/ 아래 인천공항, 동성로, 광주 키오스크 3개 프로젝트.
공통 컴포넌트를 packages/shared로 뽑는 중.

claude_conclusion:
shared에 공통 컴포넌트를 두고 각 프로젝트가 import.
프로젝트별 차이는 props로 흡수.

다른 접근법이 있나? 각각 어떤 상황에서 내 방식보다 나은지 알려줘.
```

**얻는 것**: props 폭발 문제, slot 기반 구성, 프로젝트별 theme 토큰 주입,
"공통화하지 않고 의도적으로 복제(rule of three 미달)" 같은 선택지.

### ⚠️ 주의점

**`claude_conclusion`을 요약하지 마세요.** 이 도구의 가치는 GPT가 Claude의
**실제 추론 과정**을 공격하는 데 있습니다. "Pinia 구조를 제안했음"이라고 줄이면
검증할 게 없습니다. 근거와 가정을 그대로 넘기세요.

**컨텍스트가 부족하면 "판단 불가"만 돌아옵니다.** 출력 4번 항목
("판단할 수 없었던 것")이 길면 정보를 덜 준 겁니다.

**반대로, 무조건 수용하지도 마세요.** GPT가 지적한 게 이 프로젝트 맥락에서
틀릴 수도 있습니다. 판정을 받는 게 아니라 **후보를 받는 것**입니다.

---

## 도구 3: `gpt_structured_extract` - 구조화 추출

### 언제 쓰나

**다음 단계가 기계라면** 이 도구를 씁니다.
사람이 읽을 거면 그냥 텍스트로 받으면 됩니다.

- Gemini 분석 결과 → Linear 이슈 배열
- 에러 로그 → 분류된 JSON
- 디자인 스펙 문서 → 컴포넌트 props 정의
- git diff → 변경 유형별 분류

### 실전 예시 1: Gemini 분석 → Linear 이슈 자동 생성

A2A 파이프라인의 접착제 역할입니다.

```
Step 1: Gemini가 코드베이스 분석 (긴 마크다운 텍스트 반환)
────────────────────
"gemini_analyze_codebase 도구로 focus를 'duplications'로 설정해서
packages/shared 중복 코드 찾아줘"

Step 2: GPT가 그 결과를 JSON으로 변환
────────────────────
"gpt_structured_extract 도구 사용:

content: [Gemini 분석 결과 전문]

instruction:
각 중복 코드 발견 항목을 Linear 이슈로 만들 수 있게 추출해줘.
estimate는 1(30분 이내) / 2(반나절) / 3(하루 이상) 중 하나.
priority는 Gemini가 매긴 우선순위를 따라가되, 
테스트 없는 파일을 건드리는 작업은 한 단계 낮춰.

json_schema:
{
  \"type\": \"object\",
  \"properties\": {
    \"issues\": {
      \"type\": \"array\",
      \"items\": {
        \"type\": \"object\",
        \"properties\": {
          \"title\": {\"type\": \"string\"},
          \"description\": {\"type\": \"string\"},
          \"files\": {\"type\": \"array\", \"items\": {\"type\": \"string\"}},
          \"priority\": {\"type\": \"string\", \"enum\": [\"urgent\", \"high\", \"medium\", \"low\"]},
          \"estimate\": {\"type\": \"integer\"}
        }
      }
    },
    \"summary\": {\"type\": \"string\"}
  }
}

schema_name: linear_issues"

Step 3: Claude가 Linear MCP로 일괄 생성
────────────────────
"방금 JSON의 issues 배열을 linear MCP로 이슈 생성해줘.
팀은 Frontend, 프로젝트는 '키오스크 리팩토링'"
```

**이게 왜 중요한가**: Gemini 출력은 매번 형식이 조금씩 다릅니다.
Claude가 그걸 읽고 Linear API 호출을 만들 수는 있지만, 항목이 20개면
누락되거나 필드가 어긋납니다. 중간에 스키마를 강제하면 그 실패가 사라집니다.

### 실전 예시 2: 에러 로그 분류

```
gpt_structured_extract 도구 사용:
model은 "luna", reasoning_effort는 "low"

content: [프로덕션 에러 로그 500줄]

instruction:
에러를 원인별로 그룹핑해줘. 같은 근본 원인이면 하나로 묶고 count를 세.
first_seen / last_seen은 로그의 타임스탬프 그대로.

json_schema:
{
  "type": "object",
  "properties": {
    "groups": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "root_cause": {"type": "string"},
          "count": {"type": "integer"},
          "first_seen": {"type": "string"},
          "last_seen": {"type": "string"},
          "sample_message": {"type": "string"},
          "affected_files": {"type": "array", "items": {"type": "string"}}
        }
      }
    }
  }
}
```

> 💡 이런 기계적인 작업엔 `luna` + `low`면 충분합니다. 입력 500줄 기준
> 몇 센트 수준이라 매일 돌려도 부담이 없습니다.

### 실전 예시 3: 디자인 스펙 → 컴포넌트 정의

```
gpt_structured_extract 도구로

content: [피그마 스펙 문서 텍스트 / 기획서]

instruction:
각 UI 컴포넌트의 Vue props 정의를 뽑아줘.
type은 Vue prop 타입 이름(String, Number, Boolean, Array, Object, Function).
컴포넌트명은 PascalCase, props명은 camelCase.

json_schema:
{
  "type": "object",
  "properties": {
    "components": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "props": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string"},
                "type": {"type": "string"},
                "required": {"type": "boolean"},
                "default": {"type": "string"},
                "description": {"type": "string"}
              }
            }
          }
        }
      }
    }
  }
}
```

### ⚠️ 주의점

**스키마를 느슨하게 써도 됩니다.** strict 모드가 요구하는
`additionalProperties: false`와 `required` 전체 나열은 서버가 자동으로 채웁니다.

**단, strict가 지원 안 하는 키워드는 여전히 거부됩니다.**
`minLength`, `maxLength`, `pattern`, `format`, `minimum` 등은 빼세요.
제약은 스키마가 아니라 `instruction`에 문장으로 쓰면 됩니다.

```
❌ "estimate": {"type": "integer", "minimum": 1, "maximum": 3}
✅ "estimate": {"type": "integer"}  + instruction에 "estimate는 1~3"
```

**모든 필드가 required가 됩니다.** 선택적 필드가 필요하면 타입에 null을 허용하세요.

```json
{"assignee": {"type": ["string", "null"]}}
```

---

## 도구 4: `gpt_web_research` - 웹 리서치

### Grok과 뭐가 다른가

| | `ask_grok` | `gpt_web_research` |
| --- | --- | --- |
| 데이터 | 웹 + X/Twitter | 웹 |
| 강점 | 개발자 **여론**, 실사용 후기, 트렌드 감지 | 공식 문서 정리, **출처 URL 명시** |
| 답의 성격 | "요즘 다들 이렇게 한다더라" | "공식 문서 X조에 이렇게 쓰여 있다" |
| 언제 | 도입 여부 고민, 분위기 파악 | 도입 확정 후 정확한 스펙 확인 |

**둘 다 쓰는 게 정석입니다.** Grok으로 분위기를 보고, GPT로 사실을 확인하세요.

### 실전 예시 1: 라이브러리 업그레이드 조사

```
Step 1: 분위기 파악 (Grok)
────────────────────
"ask_grok 도구로 'Vite 8 마이그레이션 실제 후기' 검색해줘.
X에서 개발자들이 뭐라고 하는지 궁금해."

→ "플러그인 생태계가 아직 못 따라온다", "CSS 처리에서 깨진다는 얘기 많음"

Step 2: 사실 확인 (GPT)
────────────────────
"gpt_web_research 도구 사용:

query: Vite 8 breaking changes 공식 목록, 특히 CSS 처리와 플러그인 API 변경

context:
현재 Vite 7 사용 중. Vue 3 + 모노레포 (packages 3개).
쓰는 플러그인: @vitejs/plugin-vue, vite-plugin-svg-icons, unplugin-auto-import

각 breaking change가 우리 구성에 영향 있는지 판단해줘."

→ 공식 마이그레이션 가이드 기반 답변 + 출처 URL

Step 3: 판단 (Claude)
────────────────────
"두 결과 종합해서 지금 올릴지 말지 결정 도와줘"
```

### 실전 예시 2: 에러 메시지 조사

```
gpt_web_research 도구 사용:

query: 
"[vite] Pre-transform error: Failed to load url" 
모노레포 workspace 패키지에서 발생하는 원인

context:
pnpm workspace, packages/shared를 packages/incheon에서 import.
dev 서버에서만 발생하고 build는 성공함.
```

> 💡 `context`에 "dev에서만 / build는 성공"처럼 **증상의 경계**를 적으면
> 답변 품질이 크게 올라갑니다. 같은 에러 메시지도 원인이 여러 개니까요.

### ⚠️ 주의점

- 지식 컷오프(2026-02) 이후 정보는 반드시 검색을 거칩니다. 그 전 것은 검색 없이 답할 수도 있으니, 최신성이 중요하면 query에 연도를 넣으세요.
- 출처 URL이 반환되면 **한 번은 직접 열어보세요.** 특히 버전 번호와 API 시그니처는.
- 검색은 토큰을 많이 씁니다. 단순 조회에 `sol` + `high`는 낭비입니다.

---

## 도구 5-6: `generate_image` / `edit_image`

### Gemini 이미지 도구와의 분담

Gemini 서버에 이미지 도구가 6개나 있으니 겹칩니다. 기준은 하나입니다.

> **이미지 안에 글자가 들어가나?**

| 상황 | 도구 | 이유 |
| --- | --- | --- |
| **UI 목업, 대시보드 시안** | `generate_image` (GPT) | 화면 안 라벨/버튼 텍스트가 읽힘 |
| **라벨 달린 다이어그램** | `generate_image` (GPT) | 텍스트 렌더링 |
| 로고 | `generate_logo` (Gemini) | 전문 에셋 특화 |
| 컨셉 삽화, 프로토타입 | `generate_illustration` (Gemini) | **무료**, 빠른 반복 |
| 인포그래픽 | `generate_infographic` (Gemini) | 세로 긴 레이아웃 지원 |
| 사실적 사진 | `generate_photo` (Gemini/Imagen 4) | 4K 포토리얼 |

**비용상 컨셉 탐색은 Gemini 무료 도구로 하고, 최종 UI 목업만 GPT로** 가는 게 합리적입니다.

### 실전 예시 1: 키오스크 UI 목업

```
generate_image 도구 사용:
size는 "1024x1536" (세로 키오스크), quality는 "high"

prompt:
Airport self check-in kiosk touchscreen UI, vertical portrait layout.
Top: airline logo area and step indicator "1 Search / 2 Select / 3 Confirm".
Center: large flight list with columns for flight number, destination, 
departure time, and gate. Each row is a large touch-friendly card.
Bottom: two big buttons labeled "Previous" and "Next" in Korean and English.
Clean flat design, high contrast, white background with blue accent color,
sans-serif typography, generous spacing for touch targets.
```

**왜 유용한가**: "여기 버튼 두 개 있고 위에 스텝 인디케이터"를 말로 설명하는 것보다
이미지 하나가 빠릅니다. 기획자·디자이너와 초기 방향 합의할 때 씁니다.

> ⚠️ 목업은 **커뮤니케이션용**입니다. 여기서 픽셀을 재서 구현하지 마세요.
> 생성 이미지의 간격과 정렬은 정확하지 않습니다.

### 실전 예시 2: 아키텍처 다이어그램

```
generate_image 도구로 size를 "1536x1024"로 설정하고

prompt:
Technical architecture diagram, clean flat style.
Left box labeled "Claude Code (Main Agent)".
Three arrows pointing right to three boxes stacked vertically:
"Gemini MCP - 1M context analysis",
"GPT MCP - independent verification",
"Grok MCP - realtime web data".
Arrows labeled "MCP Protocol".
Below, a single box "Local Project Files" connected upward.
Minimal color palette, white background, thin lines, readable labels.
```

### 실전 예시 3: 시안 수정

```
edit_image 도구 사용:

prompt: 
Change the accent color from blue to dark green, 
and make the bottom buttons noticeably larger.

image_paths: ["/Users/yoonjongho/.../generated_images/gpt_2026-08-15_1.png"]
```

여러 장을 참조로 넣어 합성할 수도 있습니다.

```
edit_image 도구로
image_paths에 [로고.png, 목업.png] 넣고
prompt: "Place the logo from the first image into the header area of the second image"
```

### ⚠️ 주의점

- **투명 배경 미지원.** 로고처럼 배경 빼야 하는 건 Gemini 쪽을 쓰세요.
- **조직 인증 필요.** 처음 호출 시 403이면 [조직 설정](https://platform.openai.com/settings/organization/general)에서 API Organization Verification 진행.
- `quality: "high"` + 복잡한 프롬프트는 최대 2분. MCP 타임아웃 주의.
- 마스크는 **알파 채널이 있는 PNG**여야 하고 첫 번째 이미지와 크기가 같아야 합니다.

---

## 3개 서브 에이전트 조합 전략

### 역할 요약

```
Claude Code (메인, 95%)
    ├── Gemini  : 넓이  — 1M 컨텍스트, 코드베이스 전체
    ├── GPT     : 깊이  — 독립 검증, 추론, 구조화
    └── Grok    : 신선도 — 실시간 웹/X, 영상
```

### 조합 패턴 1: 대규모 리팩토링 (풀 파이프라인)

```
1. gemini_analyze_codebase   → 전체 구조 파악 (무료, 넓게)
2. gpt_structured_extract     → 분석 결과를 작업 티켓 JSON으로 (싸게, 정확하게)
3. Claude Code                → 티켓별 구현
4. gpt_second_opinion         → 계획/결과 독립 검증 (깊게)
5. Claude Code                → 반영 및 마무리
```

### 조합 패턴 2: 기술 도입 결정

```
1. ask_grok                   → 커뮤니티 여론, 실사용 후기
2. gpt_web_research           → 공식 문서 사실 확인
3. Claude Code                → 우리 코드베이스에 맞춰 판단
4. gpt_second_opinion (alternatives) → 다른 선택지 확인
```

### 조합 패턴 3: 매일 아침 코드 리뷰

```
1. local-search-mcp           → 변경 파일 수집
2. gemini_analyze_codebase    → 대규모면 Gemini (무료)
3. Claude Code                → 리뷰 초안 작성
4. gpt_second_opinion         → 리뷰의 리뷰 ⭐
5. linear MCP                 → 이슈 코멘트
```

### 비용 감각

| 서버 | 대략적 비용 |
| --- | --- |
| Gemini Flash | 무료 (일 6,000 요청) |
| Grok | 사용량 기반 |
| **GPT luna** | $0.20 / $1.20 per 1M — 거의 무시 가능 |
| **GPT terra** | $2 / $12 per 1M — 일상 사용 |
| **GPT sol** | $5 / $30 per 1M — 아껴 쓰기 |

> 💡 **넓게 훑는 건 Gemini(무료), 깊게 파는 것만 GPT.**
> 이 원칙만 지키면 GPT 월 비용은 커피 몇 잔 수준으로 유지됩니다.

---

## 일일 루틴 예시

### 아침 루틴 (09:00-10:30) - 코드 리뷰

```bash
$ claude

"오늘 아침 루틴: 부사수 코드 리뷰

1. git log --since='yesterday' 확인
2. 변경 규모 판단
   - 500줄+ 또는 15파일+ → Gemini 먼저
   - 그 이하 → 바로 리뷰
3. 리뷰 초안 작성
4. gpt_second_opinion으로 내 리뷰 검증  ← 추가된 단계
5. 반영해서 Linear 코멘트"
```

### 실제 시나리오

```
[변경 규모] 18개 파일, 850줄 (결제 모듈)

[실행]
1. local-search-mcp 파일 수집               ~2분
2. gemini_analyze_codebase                  ~3분
3. Claude 리뷰 초안                          ~5분
4. gpt_second_opinion (critique, high)      ~2분  ← 추가
5. Linear 코멘트                             ~3분

[결과]
⏱️ 총 15분 (기존 대비 +2분)
✅ Gemini 발견 8건 + GPT 추가 발견 2건
   → 그중 1건이 Critical (store에 카드번호 잔류)
```

**2분 더 써서 Critical 하나를 더 잡으면 남는 장사입니다.**

### 오후 루틴 (11:00-18:00) - 개인 프로젝트

```
[설계 단계]
- gpt_second_opinion (alternatives)로 접근법 3개 비교
- 하나 골라서 Claude로 구현

[구현 단계]
- Claude 단독 (GPT 호출 불필요)

[막힐 때]
- ask_gpt (sol + high)로 깊게 파기
- gpt_web_research로 최신 스펙 확인

[커밋 전]
- 되돌리기 비싼 변경이면 gpt_second_opinion (verify)
```

---

## 팁과 트릭

### 1. `reasoning_effort` 고르는 법

**"내가 이 문제를 직접 푼다면 몇 분 걸릴까?"** 로 잡으면 대체로 맞습니다.

| 내 예상 시간 | effort | 응답 시간 |
| --- | --- | --- |
| 즉시 안다 | `none` / `low` | 즉답 |
| 1-5분 | `medium` | 수 초 |
| 15-30분 | `high` | 수십 초 |
| 몇 시간 | `xhigh` / `max` | 수 분 ⚠️ |

`none`은 추론을 아예 끕니다. 형식 변환이나 번역처럼 생각할 게 없는 작업에 쓰면
`luna`와 조합해 거의 공짜로 돌아갑니다.

### 2. 좋은 `gpt_second_opinion` 프롬프트

#### ❌ 나쁜 예

```
subject: 내 코드
claude_conclusion: 잘 짠 것 같아
```

#### ✅ 좋은 예

```
subject: 
[실제 코드 전문 + 기술 스택 + 제약조건]

claude_conclusion:
[결론 + 그렇게 판단한 근거 + 내가 가정한 것들 + 검토했지만 버린 대안]

특히 이 부분이 걱정된다: [구체적 우려]
```

**"검토했지만 버린 대안"을 적는 게 효과가 큽니다.** GPT가 이미 검토한 걸
다시 제안하는 낭비가 사라지고, 버린 이유가 타당한지를 대신 검증합니다.

### 3. 사용량 모니터링

모든 응답 헤더에 실제 토큰이 찍힙니다.

```
[GPT-5.6 sol | effort: high | tokens: in 12043 / out 3891 / reasoning 3102]
```

`reasoning`이 `out`의 대부분을 차지하면 effort를 낮출 여지가 있습니다.
위 예시는 출력 3891 중 3102가 추론이라 실제 답변은 789 토큰뿐입니다.
답변 품질이 충분했다면 `medium`으로 내려도 됩니다.

### 4. 자주 하는 실수

#### ❌ 검증할 필요 없는 걸 검증

```
"이 유틸 함수 3줄 짜리 gpt_second_opinion 돌려줘"
→ 그냥 테스트 돌리는 게 빠르고 정확함
```

#### ✅ 되돌리기 비싼 것만

```
"운영 DB 마이그레이션 계획 verify 해줘"
```

#### ❌ Gemini가 할 일을 GPT에게

```
"ask_gpt로 이 프로젝트 파일 40개 전부 분석해줘"
→ 비쌈. gemini_analyze_codebase가 무료고 컨텍스트도 충분
```

#### ✅ 넓이는 Gemini, 깊이는 GPT

```
"gemini_analyze_codebase로 전체 훑고,
 거기서 나온 Critical 항목만 ask_gpt (sol, high)로 깊게 봐줘"
```

#### ❌ 사람이 읽을 걸 structured_extract로

```
"이 문서 요약해서 JSON으로 줘" → 왜? 그냥 텍스트로 받으면 됨
```

#### ✅ 다음 단계가 기계일 때만

```
"Linear API로 넘길 거니까 JSON으로" ✓
```

### 5. `.clinerules`에 추가할 내용

```markdown
## A2A 서브 에이전트 선택 기준

### 규모 기준 (기존)
- 🟢 작은: ~200줄, ~5파일 → Claude만
- 🟡 중간: 200-500줄, 5-15파일 → Claude 주의
- 🔴 큰: 500줄+ 또는 15+파일 → Gemini → Claude

### 위험도 기준 (GPT 추가)
되돌리기 비싼 변경은 규모와 무관하게 gpt_second_opinion 필수:
- DB 스키마 변경
- 결제 / 인증 로직
- 프로덕션 배포 직전
- 부사수 코드 머지 직전
- 외부 API 계약 변경

### 축별 정리
- 넓이가 필요하면 → Gemini
- 깊이가 필요하면 → GPT (ask_gpt)
- 확신이 필요하면 → GPT (gpt_second_opinion)
- 최신성이 필요하면 → Grok + GPT
```

---

## 실전 체크리스트

### 매일 아침 (코드 리뷰)

- [ ] `git log --since="yesterday"` 확인
- [ ] 변경 규모 판단
- [ ] 규모 크면 Gemini 분석
- [ ] 리뷰 초안 작성
- [ ] **`gpt_second_opinion`으로 리뷰 검증**
- [ ] Linear 이슈 코멘트

### 되돌리기 비싼 변경 전

- [ ] 계획을 글로 정리 (근거와 가정 포함)
- [ ] `gpt_second_opinion` mode `verify`
- [ ] 지적된 항목 중 실제 해당되는 것 선별
- [ ] 롤백 절차 확인
- [ ] 실행

### 아키텍처 결정 전

- [ ] 요구사항과 제약 명시
- [ ] Claude로 1안 도출
- [ ] `gpt_second_opinion` mode `alternatives`
- [ ] 대안별 트레이드오프 비교
- [ ] 결정 근거를 문서로 남기기

### 새 라이브러리 도입 전

- [ ] `ask_grok`으로 커뮤니티 여론
- [ ] `gpt_web_research`로 공식 스펙 확인
- [ ] 출처 URL 직접 열어서 버전 확인
- [ ] 우리 스택과의 충돌 검토

### 파이프라인 구축 시

- [ ] 다음 단계가 기계인지 사람인지 확인
- [ ] 기계면 `gpt_structured_extract`로 스키마 강제
- [ ] 스키마는 느슨하게 (strict 미지원 키워드 제외)
- [ ] `luna` + `low`로 비용 최소화

---

## 마치며

### 핵심 원칙

1. **다름을 활용한다**: 같은 모델의 자기 검토는 사각지대를 못 넘는다
2. **깊이와 넓이를 구분한다**: 넓게는 Gemini, 깊게는 GPT
3. **위험도로 판단한다**: 규모가 아니라 "틀리면 얼마나 아픈가"
4. **기계에게 넘길 땐 스키마를 강제한다**

### 기대 효과

- 🎯 **리뷰 신뢰도**: 리뷰어의 리뷰로 놓치는 Critical 감소
- 🛡️ **사고 예방**: 되돌리기 비싼 결정의 전제 검증
- 🔗 **파이프라인 안정성**: JSON 파싱 실패 제거
- 🧠 **판단력 향상**: 반박을 읽으면서 내 사고 패턴의 빈틈이 보임

### 다음 단계

1. `gpt_second_opinion`을 아침 루틴에 먼저 넣어보기
2. 2주 정도 쓰면서 "실제로 도움된 지적"만 기록
3. 그 패턴을 `.clinerules`에 반영
4. 나머지 도구는 필요할 때 하나씩

---

**Happy Coding with Claude & GPT! 🚀**
