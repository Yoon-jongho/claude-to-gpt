# Claude-to-GPT MCP Server

Claude Code에서 OpenAI GPT를 MCP(Model Context Protocol) 서버로 사용하는 Agent-to-Agent 통합 프로젝트

## 🎯 프로젝트 목적

- **Claude Code**: 메인 AI (일반 코딩, 디버깅, 파일 생성/수정)
- **GPT**: 서브 AI (독립 검증, 추론 깊이 제어, 구조화된 데이터 추출, UI 목업 이미지)

### 3개 서브 에이전트 역할 분담

| 서버 | 강점 | 언제 부르나 |
| --- | --- | --- |
| `claude-to-gemini` | 1M 컨텍스트 코드베이스 분석, 이미지 6종 | 파일 30개 이상 전체 훑기, 아키텍처 설계 |
| `claude-to-grok` | 실시간 웹/X 데이터, 영상 생성 | 최신 동향, 브레인스토밍, 영상 |
| **`claude-to-gpt`** | **추론 깊이 제어, 독립 검증, strict JSON** | **되돌리기 어려운 결정 재검토, 파이프라인 JSON** |

`claude-to-gpt`의 핵심 차별점은 **`gpt_second_opinion`** 입니다. Claude가 자기 결론을
자기가 검토하면 같은 사각지대에 빠지지만, 모델 계열이 다르면 서로 다른 걸 놓칩니다.

## ✨ 제공 도구

### 1. `ask_gpt` - 일반 질의

- **용도**: 어려운 알고리즘, 수학적 로직, 깊게 생각해야 하는 문제
- **파라미터**:
  - `prompt`: 질문/작업
  - `context`: 코드나 문서 (선택)
  - `model`: `luna` | `terra` (기본) | `sol`
  - `reasoning_effort`: `none` | `low` | `medium` (기본) | `high` | `xhigh` | `max`
- **특징**: 컨텍스트 약 1M 토큰, 추론 깊이를 직접 조절

### 2. `gpt_second_opinion` - 독립 검증 ⭐

- **용도**: Claude가 내린 결론을 GPT가 독립적으로 반박/검증
- **파라미터**:
  - `subject`: 검토 대상 (코드, 설계안, 버그 진단, 마이그레이션 계획)
  - `claude_conclusion`: Claude의 결론과 근거
  - `mode`: `critique` (결함 찾기) | `verify` (단계별 검증) | `alternatives` (대안 제시)
  - `reasoning_effort`: 기본 `high`
- **출력**: 판정 한 줄 → `[Critical]`/`[Major]`/`[Minor]` 태그된 지적 → 대안 → 판단 불가 항목
- **언제**: 배포 직전, 롤백 비싼 변경, 부사수 코드 머지 전

### 3. `gpt_structured_extract` - 구조화 JSON 추출

- **용도**: 로그·문서·코드를 스키마에 맞는 JSON으로 변환
- **파라미터**:
  - `content`: 원본 텍스트
  - `instruction`: 무엇을 어떻게 뽑을지
  - `json_schema`: 원하는 출력 스키마 (느슨하게 써도 됨)
  - `schema_name`: 스키마 이름 (선택)
  - `model`: 기본 `luna` (저렴)
- **특징**: OpenAI structured outputs라 **형태가 보장**됨. 마크다운 펜스나 파싱 실패 없음.
  strict 모드가 요구하는 `additionalProperties: false`와 `required`는 **자동으로 채워줌**

### 4. `gpt_web_research` - 웹 리서치

- **용도**: 최신 문서, 라이브러리 버전, 변경 이력처럼 금방 낡는 정보
- **파라미터**: `query`, `context` (선택), `model`, `reasoning_effort`
- **특징**: 내장 `web_search` 도구 사용, 답변 + 출처 URL 목록 반환

### 5. `generate_image` - 이미지 생성

- **모델**: GPT Image 2 (`gpt-image-2`)
- **파라미터**:
  - `prompt`: 이미지 설명 (영문 권장)
  - `size`: `1024x1024` (기본) ~ `3840x2160` (4K)
  - `quality`: `low` | `medium` (기본) | `high` | `auto`
  - `format`: `png` (기본) | `jpeg` | `webp`
  - `n`: 생성 개수 (1-4)
- **특징**: **이미지 안 텍스트 렌더링이 강함** → UI 목업, 대시보드, 라벨 있는 다이어그램에 적합
- **제약**: 투명 배경 미지원

### 6. `edit_image` - 이미지 편집/합성

- **모델**: GPT Image 2
- **파라미터**:
  - `prompt`: 편집 지시
  - `image_paths`: 원본 이미지 로컬 경로 1-4개
  - `mask_path`: 마스크 PNG 경로 (선택, 알파 채널 필수)
  - `size`, `quality`
- **특징**: 참조 이미지 여러 장으로 새 이미지 합성 가능

생성된 이미지는 `generated_images/`에 저장되고 파일 경로가 반환됩니다.

## 🛠 기술 스택

- **Runtime**: Node.js 18+
- **MCP SDK**: @modelcontextprotocol/sdk ^1.30.0
- **AI API**: OpenAI Responses API (openai ^7.4.0)
- **IDE**: Claude Code (CLI + VSCode 확장)

## 📦 설치 방법

### 1. 사전 준비

- Node.js 18 이상
- Claude Pro/Max 플랜
- OpenAI API 키 ([platform.openai.com/api-keys](https://platform.openai.com/api-keys))
- 이미지 도구를 쓰려면 **API Organization Verification** 필요
  ([설정 페이지](https://platform.openai.com/settings/organization/general)에서 진행)

### 2. 프로젝트 클론

```bash
git clone https://github.com/Yoon-jongho/claude-to-gpt.git
cd claude-to-gpt
```

### 3. 의존성 설치

```bash
npm install
```

### 4. 동작 확인

```bash
OPENAI_API_KEY="sk-..." node index.js
# "GPT MCP server running" 출력되면 정상. Ctrl+C로 종료
```

### 5. MCP 서버 등록

```bash
claude mcp add gpt \
  --env OPENAI_API_KEY=YOUR_API_KEY_HERE \
  -- node /ABSOLUTE_PATH/claude-to-gpt/index.js
```

**주의**:

- `YOUR_API_KEY_HERE`를 실제 OpenAI API 키로 교체
- `/ABSOLUTE_PATH/`를 실제 경로로 교체

### 6. 확인

```bash
claude mcp list
```

출력 예시:

```
gpt - node /Users/username/projects/claude-to-gpt/index.js
```

## 🚀 사용 방법

### 기본 질의

```
ask_gpt 도구로 "이 정렬 알고리즘의 최악 시간복잡도를 증명해줘" 물어봐줘
```

### 깊은 추론이 필요할 때

```
ask_gpt 도구로 model을 "sol", reasoning_effort를 "high"로 설정하고
"이 동시성 버그의 근본 원인을 찾아줘" 물어봐줘
```

### 독립 검증 (핵심 기능)

```
gpt_second_opinion 도구로 방금 네가 제안한 Pinia 스토어 구조를 검증해줘.
mode는 "critique"로.
```

```
gpt_second_opinion 도구로 mode를 "alternatives"로 설정해서
이 마이그레이션 전략 말고 다른 접근법이 있는지 봐줘
```

### 구조화 추출

```
gpt_structured_extract 도구로 이 에러 로그에서
{errors: [{timestamp, level, message, file}], summary} 형태로 뽑아줘
```

### 웹 리서치

```
gpt_web_research 도구로 "Vite 8 breaking changes" 조사해줘
```

### 이미지 생성

```
generate_image 도구로 size를 "1536x1024", quality를 "high"로 설정하고
"Airport self check-in kiosk UI, large touch targets, Korean and English labels,
departure board on the right, clean flat design" 목업 만들어줘
```

## 💡 사용 시나리오

### 시나리오 1: 부사수 코드 리뷰 (매일 아침)

```
1. Claude Code: 부사수 PR 읽고 리뷰 초안 작성
2. gpt_second_opinion: 그 리뷰를 GPT가 재검토 (놓친 지적 발견)
3. Claude Code: 최종 리뷰를 Linear 코멘트로 정리
```

### 시나리오 2: 되돌리기 어려운 결정

```
1. Claude Code: DB 스키마 마이그레이션 계획 수립
2. gpt_second_opinion (mode: verify): 단계별로 검증
3. gpt_second_opinion (mode: alternatives): 다른 접근법 확인
4. Claude Code: 최종안 확정 후 실행
```

### 시나리오 3: 대규모 코드베이스 → 실행 계획

```
1. gemini_analyze_codebase: 전체 구조 파악 (Gemini의 1M 컨텍스트)
2. gpt_structured_extract: 분석 결과를 작업 티켓 JSON으로 변환
3. Claude Code: 티켓별 구현
```

## 📚 실전 가이드

**실무에서 어떻게 활용하나요?**

더 자세한 실전 활용법은 [**📖 실전 활용 가이드 (USECASES.md)**](./USECASES.md)를 참고하세요!

**주요 내용:**

- 🎯 도구별 실전 프롬프트 (6개 전부)
- 🛡️ 부사수 코드 리뷰 2차 필터 (리뷰어의 리뷰)
- 🔍 DB 마이그레이션 계획 단계별 검증
- 🔗 Gemini 분석 → GPT JSON 변환 → Linear 이슈 자동 생성
- 🤝 Gemini / GPT / Grok 3개 서브 에이전트 조합 전략
- 💰 비용 감각과 모델 선택 기준
- 💡 팁과 트릭 (`reasoning_effort` 고르는 법, 자주 하는 실수)

## 📊 모델 비교

| 별칭 | 모델 ID | 입력 | 출력 | 추천 용도 |
| --- | --- | --- | --- | --- |
| `luna` | `gpt-5.6-luna` | $0.20 / 1M | $1.20 / 1M | 구조화 추출, 대량 단순 작업 |
| `terra` (기본) | `gpt-5.6-terra` | $2 / 1M | $12 / 1M | 대부분의 작업 |
| `sol` | `gpt-5.6-sol` | $5 / 1M | $30 / 1M | 가장 어려운 추론, 최종 검증 |

셋 다 컨텍스트 1.05M 토큰, 최대 출력 128K 토큰, 지식 컷오프 2026-02-16입니다.

### reasoning_effort 고르기

| 값 | 체감 속도 | 쓰는 곳 |
| --- | --- | --- |
| `none` / `low` | 즉답 | 추출, 포맷 변환, 단순 질의 |
| `medium` (기본) | 수 초 | 일반 코딩 질문 |
| `high` | 수십 초 | 코드 리뷰, 설계 검증 |
| `xhigh` / `max` | 수 분 | 진짜 어려운 문제만 |

> ⚠️ `xhigh`/`max`는 MCP 클라이언트 타임아웃을 넘길 수 있습니다.

## 💰 비용 최적화

```
- 기본은 terra + medium
- 구조화 추출처럼 기계적인 작업은 luna + low
- sol + high는 "틀리면 진짜 아픈" 것에만
- reasoning_effort가 비용에 직결됨 (추론 토큰도 출력 토큰으로 과금)
```

응답 헤더에 `tokens: in ... / out ... / reasoning ...`이 찍히니 실제 사용량을 보면서 조절하세요.

## ⚠️ 보안 주의사항

### API 키 보호

**절대 금지**:

- ❌ GitHub에 API 키 업로드
- ❌ 코드에 API 키 하드코딩
- ❌ 공개 장소에 API 키 공유

**권장 사항**:

- ✅ 환경변수로만 관리
- ✅ `.gitignore`에 `.env`, `.claude.json` 포함
- ✅ API 키 유출 시 즉시 재발급
- ✅ OpenAI 대시보드에서 **spend limit** 설정 (Gemini Flash와 달리 무료 티어 없음)

## 🔧 트러블슈팅

### `OPENAI_API_KEY environment variable is required`

`claude mcp add` 할 때 `--env OPENAI_API_KEY=...`를 빠뜨렸는지 확인하세요.

### `Response incomplete (reason: max_output_tokens)`

추론 토큰이 출력 예산을 다 쓴 경우입니다. `reasoning_effort`를 낮추세요.

### 이미지 도구가 403/`organization_verification_required`

이미지 모델은 조직 인증이 필요합니다.
[조직 설정 페이지](https://platform.openai.com/settings/organization/general)에서 인증하세요.

### MCP 클라이언트 타임아웃

`reasoning_effort`가 `xhigh`/`max`이거나 이미지 `quality: high`일 때 발생합니다.
효율을 낮추거나 이미지 품질을 `medium`으로 내리세요.

### 구조화 추출에서 스키마 에러

`normalizeSchemaForStrict`가 `additionalProperties`와 `required`를 자동으로 채우지만,
strict 모드가 지원하지 않는 키워드(`minLength`, `pattern`, `format` 등)는 여전히 거부됩니다.
스키마를 단순하게 유지하고 제약은 `instruction`에 문장으로 쓰세요.

## 🤝 기여 방법

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일 참조

## 🔗 참고 자료

- [MCP 공식 문서](https://modelcontextprotocol.io)
- [OpenAI 모델 카탈로그](https://developers.openai.com/api/docs/models)
- [Responses API](https://developers.openai.com/api/docs/api-reference/responses)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Image generation](https://developers.openai.com/api/docs/guides/image-generation)
- [Claude Code 문서](https://docs.claude.com/en/docs/claude-code)

## 📧 문의

프로젝트 관련 문의: [GitHub Issues](https://github.com/Yoon-jongho/claude-to-gpt/issues)

---

**Made with ❤️ by [Yoon Jong-ho](https://github.com/Yoon-jongho)**
