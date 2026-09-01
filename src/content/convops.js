// gpt-term — 대화 조작. 원본 사이드바의 "..." 메뉴에 해당한다.
//
// 원본 메뉴를 클릭하는 대신 백엔드를 직접 부른다. 우리 목록도 API 에서 오고,
// 원본 사이드바는 창이 좁으면 DOM 에 아예 없기 때문이다.
//
// 실측으로 확인한 것 (2026-09-01, 내가 만든 테스트 대화에서 왕복 확인):
//   이름 바꾸기  PATCH /backend-api/conversation/<id>  {title}         → {success:true}
//   보관         PATCH …                               {is_archived}   → 목록에서 사라짐/복귀
//   고정         PATCH …                               {is_starred}    → pinned_time 설정/해제
//
// 삭제는 되돌릴 수 없어 실행 검증을 하지 않았다. `[미검증]` 표시를 달고,
// 호출부에서 확인 절차를 거치게 한다.
GT.convops = (function () {
  'use strict';

  const url = (id) => `/backend-api/conversation/${encodeURIComponent(id)}`;

  async function patch(id, body) {
    const j = await GT.oai.patch(url(id), body);
    return !!(j && j.success);
  }

  return {
    rename: (id, title) => patch(id, { title: String(title) }),
    pin: (id, on) => patch(id, { is_starred: !!on }),
    archive: (id, on) => patch(id, { is_archived: !!on }),

    // `[미검증]` 되돌릴 수 없어 실행해 확인하지 않았다.
    // 원본 UI 의 '삭제'와 같은 소프트 삭제로 보이지만 확인된 바 없다.
    remove: (id) => patch(id, { is_visible: false }),

    // 원본 메뉴에는 있지만 여기서는 다루지 않는 것:
    //   공유하기      — 대화를 공개 링크로 만든다. 공개는 원본의 확인 절차를 거치는 게 맞다
    //   프로젝트로 이동 — 프로젝트 선택 UI 와 미검증 엔드포인트가 필요하다
    unsupported: ['공유하기', '프로젝트로 이동']
  };
})();
