// gpt-term — 대화 조작. 원본 사이드바의 "..." 메뉴에 해당한다.
//
// 원본 메뉴를 클릭하는 대신 백엔드를 직접 부른다. 우리 목록도 API 에서 오고,
// 원본 사이드바는 창이 좁으면 DOM 에 아예 없기 때문이다.
//
// 실측으로 확인한 것 (2026-09-01, 내가 만든 테스트 대화에서 왕복 확인):
//   이름 바꾸기  PATCH /backend-api/conversation/<id>  {title}         → {success:true}
//   보관         PATCH …                               {is_archived}   → 목록에서 사라짐/복귀
//   고정         PATCH …                               {is_starred}    → pinned_time 설정/해제
//   삭제         PATCH …                               {is_visible:false}
//
// 삭제는 버릴 대화를 만들어 실제로 확인했다. **되돌릴 수 없다.**
//   삭제 후 목록에서 사라지고, GET 은 404 를 준다.
//   {is_visible:true} 로 복구를 시도하면 역시 404 다 — 그 id 로는 더 이상 닿을 수 없다.
// 그래서 호출부는 반드시 확인 절차를 거친다.
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

    // 되돌릴 수 없다. 복구 경로가 없음을 실측으로 확인했다.
    remove: (id) => patch(id, { is_visible: false }),

    // 여러 개를 지운다. 하나가 실패해도 멈추지 않고 끝까지 간 뒤 요약을 돌려준다.
    // 순차로 부른다 — 병렬로 쏘면 어디까지 지워졌는지 말할 수 없게 된다.
    async removeMany(ids, onStep) {
      const done = [];
      const failed = [];
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        try {
          const ok = await patch(id, { is_visible: false });
          (ok ? done : failed).push(ok ? id : { id, error: 'success=false' });
        } catch (e) {
          failed.push({ id, error: (e && e.message) || String(e) });
        }
        if (onStep) onStep(i + 1, ids.length);
      }
      return { done, failed };
    },

    // 원본 메뉴에는 있지만 여기서는 다루지 않는 것:
    //   공유하기      — 대화를 공개 링크로 만든다. 공개는 원본의 확인 절차를 거치는 게 맞다
    //   프로젝트로 이동 — 프로젝트 선택 UI 와 미검증 엔드포인트가 필요하다
    unsupported: ['공유하기', '프로젝트로 이동']
  };
})();
