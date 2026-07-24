# MayAMC Research Page

메이동물의료센터 최신 수의학 논문 페이지입니다.

## 주요 기능

- PubMed 최신 논문 자동 조회
- 분야 필터: 전체, 심장, 내과, 종양, 외과, 신경, 피부
- 저널·검색·정렬 필터
- 논문 찜 기능
- 영문 제목 아래 한글 핵심 요약 표시
- 한글 상세 요약과 영문 초록 펼쳐보기
- GitHub Actions를 통한 매일 자동 요약
- 모바일 반응형 화면

## 1. GitHub Pages 배포

1. GitHub에서 `MayAMC` 계정 또는 Organization을 만듭니다.
2. 저장소 이름을 정확히 `mayamc.github.io`로 만듭니다.
3. 압축을 풀고 폴더 안의 파일과 숨김 폴더 `.github`까지 저장소 최상위에 업로드합니다.
4. **Settings → Pages → Deploy from a branch**를 선택합니다.
5. Branch는 `main`, 폴더는 `/ (root)`를 선택합니다.

배포 주소:

- `https://mayamc.github.io/`
- `https://mayamc.github.io/research.html`

## 2. OpenAI API 키 등록

API 키를 HTML이나 코드에 직접 입력하면 안 됩니다.

1. OpenAI API 플랫폼에서 API 키를 생성합니다.
2. GitHub 저장소의 **Settings → Secrets and variables → Actions**로 이동합니다.
3. **New repository secret**을 누릅니다.
4. 이름은 정확히 `OPENAI_API_KEY`로 입력합니다.
5. 값에는 발급받은 API 키를 입력합니다.

선택적으로 **Variables** 탭에 `OPENAI_MODEL`을 추가할 수 있습니다.
설정하지 않으면 스크립트의 기본 모델 `gpt-5-mini`가 사용됩니다.

## 3. 첫 한글 요약 생성

1. 저장소의 **Actions** 탭을 엽니다.
2. `Update Korean paper summaries`를 선택합니다.
3. **Run workflow**를 누릅니다.
4. 작업이 끝나면 `data/korean-summaries.json`이 자동으로 갱신됩니다.
5. GitHub Pages가 다시 배포되면 한글 요약이 표시됩니다.

이후에는 매일 한국시간 오전 6시 20분경 자동 실행됩니다.

## 4. 비용 제한

기본 설정은 최근 21일 논문을 확인하고, 실행 1회당 신규 논문을 최대 30편까지만 요약합니다.

변경 위치:

- `.github/workflows/update-summaries.yml`
- `DAYS_BACK`
- `MAX_NEW_SUMMARIES`

이미 요약된 PMID는 다시 API를 호출하지 않습니다.

## 5. 파일 구조

```text
index.html
research.html
package.json
data/
  korean-summaries.json
scripts/
  update-summaries.mjs
.github/
  workflows/
    update-summaries.yml
```

## 주의사항

- 한글 요약은 AI가 생성하므로 중요한 임상 판단 전에는 반드시 영문 초록과 원문을 확인해야 합니다.
- 초록이 PubMed에 등록되지 않은 논문은 자동 요약되지 않습니다.
- 찜 목록은 브라우저에 저장되며 기기 간 동기화되지 않습니다.
