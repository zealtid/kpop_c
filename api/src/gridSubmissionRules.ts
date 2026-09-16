/**
 * UGC-2b-Match16：宫格确认后入册规则（无 IO）。
 * 命中 published 挂拥有不计审批积分；版本在宫格路径可选。
 */
export function gridSubmissionRules(source: string, matchOwnIfDuplicate?: boolean) {
  const grid = source === "grid_page";
  return {
    matchOwn: grid || matchOwnIfDuplicate === true,
    versionRequired: !grid,
    awardPointsOnOwn: false,
  };
}
