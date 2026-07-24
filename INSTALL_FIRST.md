# MayAMC Clean Install

## 저장소 전체 교체

1. GitHub 저장소의 기존 파일과 폴더를 모두 삭제합니다.
2. 이 ZIP을 압축 해제합니다.
3. 압축 해제한 폴더 안의 모든 파일과 폴더를 저장소 최상위에 업로드합니다.
4. `.github` 폴더는 숨김 폴더이므로 반드시 함께 업로드합니다.
5. GitHub Secret `OPENAI_API_KEY`는 기존 설정을 유지할 수 있습니다.
6. Settings → Pages에서 `main / (root)`를 선택합니다.
7. Actions → Update Korean paper summaries → Run workflow를 실행합니다.
8. Action 실행 중에는 저장소 파일을 수정하지 않습니다.

## 정상 파일 구조

.github/workflows/update-summaries.yml
data/papers.json
data/korean-summaries.json
scripts/update-summaries.mjs
index.html
research.html
package.json
README.md
