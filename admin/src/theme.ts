import type { GlobalThemeOverrides } from "naive-ui";

/**
 * 星卡 Scheme A，与小程序 `miniprogram/styles/theme.wxss` 同源。
 * B0：Naive / 壳只用这一族，勿另起色板。
 */
export const tokens = {
  colorBgPage: "#F4F5F9",
  colorBgElevated: "#FFFFFF",
  colorTextPrimary: "#1A1B1F",
  colorTextSecondary: "#667085",
  colorBrand: "#6B5CFF",
  colorBrandSoft: "#EDE9FF",
  colorBrandPressed: "#5A4BE0",
  colorSuccess: "#12B76A",
  colorWarning: "#F79009",
  colorDanger: "#F04438",
} as const;

/** B0/B1 窄屏抽屉与图鉴主路径断点（≤390px） */
export const NARROW_MAX_PX = 390;

export const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: tokens.colorBrand,
    primaryColorHover: tokens.colorBrandPressed,
    primaryColorPressed: tokens.colorBrandPressed,
    primaryColorSuppl: tokens.colorBrand,
    bodyColor: tokens.colorBgPage,
    cardColor: tokens.colorBgElevated,
    textColorBase: tokens.colorTextPrimary,
    borderRadius: "8px",
  },
  Menu: {
    itemHeight: "42px",
    borderRadius: "8px",
    itemTextColor: tokens.colorTextPrimary,
    itemTextColorHover: tokens.colorBrand,
    itemTextColorActive: tokens.colorBrand,
    itemTextColorActiveHover: tokens.colorBrand,
    itemColorHover: tokens.colorBrandSoft,
    itemColorActive: tokens.colorBrandSoft,
    itemColorActiveHover: tokens.colorBrandSoft,
    itemIconColorActive: tokens.colorBrand,
  },
  DataTable: {
    thColor: "#EEF0F6",
    tdColorStriped: "#F7F8FC",
    thTextColor: tokens.colorTextSecondary,
    borderRadius: "8px",
  },
  Pagination: {
    itemBorderRadius: "8px",
    itemColorActive: tokens.colorBrand,
    itemTextColorActive: "#FFFFFF",
    itemTextColorHover: tokens.colorBrand,
  },
  Input: {
    borderHover: `1px solid ${tokens.colorBrand}`,
    borderFocus: `1px solid ${tokens.colorBrand}`,
    boxShadowFocus: "0 0 0 2px rgba(107, 92, 255, 0.16)",
  },
  InternalSelection: {
    borderHover: `1px solid ${tokens.colorBrand}`,
    borderActive: `1px solid ${tokens.colorBrand}`,
    borderFocus: `1px solid ${tokens.colorBrand}`,
    boxShadowActive: "0 0 0 2px rgba(107, 92, 255, 0.16)",
    boxShadowFocus: "0 0 0 2px rgba(107, 92, 255, 0.16)",
  },
};
