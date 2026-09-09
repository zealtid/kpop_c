#!/usr/bin/env python3
"""Regenerate api/assets/fonts/NotoSansSC-Share.otf from Noto Sans SC Regular.

Source (SubsetOTF SC Regular, SIL OFL 1.1):
  https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf

Requires: pip install fonttools
"""

from __future__ import annotations

import pathlib
import urllib.request

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "fonts" / "NotoSansSC-Share.otf"
SRC_URL = (
    "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/"
    "Sans/SubsetOTF/SC/NotoSansSC-Regular.otf"
)

EXTRAS = """
星卡卡册长图微信扫码打开小程序小卡图鉴分享含水印与码含全部已拥有卡片暂无自定义审核中
当前图鉴仅含切片进度不重复模板数范围内已发布含特典不含已废弃
防弹少年团心心追逐焦点柠檬糖阿里郎卡门智雨有河斯特拉主恩艾娜伊恩艺温
南俊金南俊金硕珍硕珍闵玧其玧其郑号锡号锡朴智旻智旻金泰亨泰亨泰泰柾国田柾国
限定小卡我的卡册关注情报图鉴
"""


def charset() -> str:
    chars = {chr(i) for i in range(0x20, 0x7F)}
    chars.update("·•—–…、。《》「」『』（）【】，。！？：；、★☆●○■□▲△")
    chars.update(EXTRAS)
    for qh in range(16, 88):
        for wh in range(1, 95):
            try:
                chars.add(bytes([qh + 0xA0, wh + 0xA0]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return "".join(sorted(chars, key=ord))


def main() -> None:
    src = pathlib.Path("/tmp/NotoSansSC-Regular.otf")
    if not src.exists():
        print("downloading", SRC_URL)
        urllib.request.urlretrieve(SRC_URL, src)
    text = charset()
    opt = Options()
    opt.name_IDs = ["*"]
    opt.name_legacy = True
    opt.notdef_outline = True
    opt.recommended_glyphs = True
    opt.drop_tables += ["DSIG"]
    font = TTFont(src)
    subsetter = Subsetter(options=opt)
    subsetter.populate(text=text)
    subsetter.subset(font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUT)
    print("wrote", OUT, "bytes", OUT.stat().st_size, "chars", len(text))


if __name__ == "__main__":
    main()
