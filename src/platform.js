'use strict';

// モバイル向けページ内UIを使うべき環境かどうか。OS固有判定にはしない。
const shouldUseInPageUI = () => {
  const mobile = navigator.userAgentData?.mobile;
  if (mobile === true) {
    return true;
  }
  if (mobile === false) {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '');
};
