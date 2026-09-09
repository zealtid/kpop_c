import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import sharp from "sharp";
import { config } from "./config.js";
import { query } from "./db.js";
import { getGroup } from "./catalog.js";
import { track } from "./analytics.js";
import { PROGRESS_COPY, progressForGroups } from "./collection.js";
import { listShareableCustomCards } from "./customCards.js";
import { readCustomImage } from "./storage.js";

const COLS = 3;
const CARD_W = 210;
const CARD_H = 324;
const GAP = 16;
const PAD = 32;
const HEADER_H = 168;
const FOOTER_H = 220;

type ShareCard = {
  id: string;
  code: string;
  name: string;
  version: string;
  member_name_en: string | null;
  member_color: string | null;
  main_image_url: string | null;
  kind: "official" | "custom";
  moderation_status?: string;
};

export async function createShareImage(userId: string, groupKey: string) {
  const group = await getGroup(groupKey);
  const owned = await query<ShareCard>(
    `SELECT t.id, t.code, t.name, t.version, m.name_en AS member_name_en,
            m.color AS member_color, t.main_image_url
     FROM user_cards uc
     JOIN templates t ON t.id = uc.template_id
     JOIN releases r ON r.id = t.release_id
     LEFT JOIN members m ON m.id = t.member_id
     WHERE uc.user_id = $1 AND r.group_id = $2
     ORDER BY m.sort_order NULLS LAST, t.version`,
    [userId, group.id],
  );
  const custom = await listShareableCustomCards(userId, group.id as string);
  // P8 + PC06: 官方已拥有 + 自定义（approved/pending），全量拼接，禁止截断；rejected 不入图
  const cards: ShareCard[] = [
    ...owned.rows.map((c) => ({ ...c, kind: "official" as const })),
    ...custom.map((c) => ({
      id: String(c.id),
      code: "CUSTOM",
      name: c.title || "自定义",
      version: c.moderationStatus === "pending" ? "审核中" : "自定义",
      member_name_en: c.memberNameEn || c.title || "自定义",
      member_color: c.memberColor || "#8a8494",
      main_image_url: String(c.imageFront),
      kind: "custom" as const,
      moderation_status: c.moderationStatus,
    })),
  ];
  const [prog] = await progressForGroups(userId, [group.id as string]);
  const ownedDistinct = prog?.owned_distinct ?? 0;
  const published = prog?.published_count ?? 0;
  const pct = published ? Math.round((ownedDistinct / published) * 100) : 0;

  fs.mkdirSync(path.join(config.dataDir, "shares"), { recursive: true });
  const id = randomUUID();
  const fileName = `${id}.png`;
  const filePath = path.join(config.dataDir, "shares", fileName);
  const rows = Math.max(1, Math.ceil(cards.length / COLS));
  const gridH = cards.length === 0 ? 80 : rows * CARD_H + (rows - 1) * GAP;
  const width = PAD * 2 + COLS * CARD_W + (COLS - 1) * GAP;
  const height = HEADER_H + gridH + FOOTER_H + PAD;

  const qrUrl = `${config.publicBaseUrl}/share/landing?g=${group.slug}`;
  const qrPng = await QRCode.toBuffer(qrUrl, { width: 160, margin: 1, errorCorrectionLevel: "M" });

  const svg = shareSvg({
    width,
    height,
    headerH: HEADER_H,
    footerH: FOOTER_H,
    pad: PAD,
    groupName: String(group.nameZh),
    scopeNote: group.scopeNote ? String(group.scopeNote) : "",
    ownedDistinct,
    published,
    pct,
    cards,
    cardW: CARD_W,
    cardH: CARD_H,
    gap: GAP,
    cols: COLS,
  });

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(svg), top: 0, left: 0 },
    { input: qrPng, top: height - FOOTER_H + 30, left: PAD + 8 },
  ];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (card.kind !== "custom" || !card.main_image_url) continue;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (CARD_W + GAP);
    const y = HEADER_H + row * (CARD_H + GAP);
    const img = await loadShareCardImage(card.main_image_url);
    if (!img) continue;
    const fitted = await sharp(img)
      .resize(CARD_W, CARD_H - 48, { fit: "cover" })
      .png()
      .toBuffer();
    composites.push({ input: fitted, top: y, left: x });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 18, g: 16, b: 22 },
    },
  })
    .composite(composites)
    .png()
    .toFile(filePath);

  const publicPath = `/media/shares/${fileName}`;
  const publicUrl = `${config.publicBaseUrl}${publicPath}`;
  const templateIds = owned.rows.map((c) => c.id);
  const customCardIds = custom.map((c) => String(c.id));
  await query(
    `INSERT INTO share_images (id, user_id, group_id, file_path, public_url, template_ids, custom_card_ids, has_qr, has_watermark)
     VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7::uuid[], true, true)`,
    [id, userId, group.id, filePath, publicUrl, templateIds, customCardIds],
  );
  await track(
    "share_cardbook_save",
    { groupId: group.id, cardCount: cards.length, customCount: customCardIds.length, truncated: false },
    userId,
  );

  return {
    id,
    url: publicPath,
    absoluteUrl: publicUrl,
    cardCount: cards.length,
    templateIds,
    customCardIds,
    truncated: false,
    hasQr: true,
    hasWatermark: true,
    width,
    height,
    progressCopy: PROGRESS_COPY,
  };
}

async function loadShareCardImage(publicPath: string): Promise<Buffer | null> {
  const custom = await readCustomImage(publicPath);
  if (custom) return custom.body;
  if (publicPath.startsWith("/media/cards/")) {
    const dest = path.join(config.dataDir, "cards", path.basename(publicPath));
    if (fs.existsSync(dest)) return fs.readFileSync(dest);
  }
  return null;
}

function shareSvg(opts: {
  width: number;
  height: number;
  headerH: number;
  footerH: number;
  pad: number;
  groupName: string;
  scopeNote: string;
  ownedDistinct: number;
  published: number;
  pct: number;
  cards: ShareCard[];
  cardW: number;
  cardH: number;
  gap: number;
  cols: number;
}) {
  const cardsXml = opts.cards
    .map((c, i) => {
      const col = i % opts.cols;
      const row = Math.floor(i / opts.cols);
      const x = opts.pad + col * (opts.cardW + opts.gap);
      const y = opts.headerH + row * (opts.cardH + opts.gap);
      const fill = c.member_color || "#ff6b9d";
      const member = escapeXml(c.member_name_en || "Member");
      const ver = escapeXml(c.version);
      const code = escapeXml(c.code);
      const customMark =
        c.kind === "custom"
          ? `<text x="${x + 12}" y="${y + opts.cardH - 14}" fill="#ffe8f0" font-size="13" font-family="sans-serif">自定义${c.moderation_status === "pending" ? " · 审核中" : ""}</text>`
          : "";
      return `<g data-card-code="${code}" data-kind="${c.kind}">
        <rect x="${x}" y="${y}" width="${opts.cardW}" height="${opts.cardH}" rx="14" fill="${fill}"/>
        <text x="${x + opts.cardW / 2}" y="${y + 150}" fill="#fff" font-size="22" font-family="sans-serif" text-anchor="middle">${member}</text>
        <text x="${x + opts.cardW / 2}" y="${y + 184}" fill="#fff" font-size="16" font-family="sans-serif" text-anchor="middle">${ver}</text>
        <text x="${x + opts.cardW / 2}" y="${y + 214}" fill="#ffe8f0" font-size="11" font-family="sans-serif" text-anchor="middle">${code}</text>
        ${customMark}
      </g>`;
    })
    .join("\n");

  const empty =
    opts.cards.length === 0
      ? `<text x="${opts.width / 2}" y="${opts.headerH + 40}" fill="#aaa" font-size="18" text-anchor="middle" font-family="sans-serif">暂无已拥有卡片</text>`
      : "";

  const note = opts.scopeNote
    ? `<text x="${opts.pad}" y="148" fill="#f5c36b" font-size="14" font-family="sans-serif">${escapeXml(opts.scopeNote)}</text>`
    : "";

  return `<svg width="${opts.width}" height="${opts.height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${opts.width}" height="${opts.height}" fill="#121016"/>
    <text x="${opts.pad}" y="48" fill="#ff8fb8" font-size="18" font-family="sans-serif" font-weight="700">星卡 · 卡册长图</text>
    <text x="${opts.pad}" y="92" fill="#ffffff" font-size="36" font-family="sans-serif" font-weight="700">${escapeXml(opts.groupName)}</text>
    <text x="${opts.pad}" y="126" fill="#d7d4de" font-size="18" font-family="sans-serif">${opts.ownedDistinct}/${opts.published} · ${opts.pct}%</text>
    ${note}
    ${empty}
    ${cardsXml}
    <rect x="0" y="${opts.height - opts.footerH}" width="${opts.width}" height="${opts.footerH}" fill="#1c1822"/>
    <text x="${opts.pad + 188}" y="${opts.height - opts.footerH + 88}" fill="#ffffff" font-size="20" font-family="sans-serif">微信扫码打开小程序</text>
    <text x="${opts.pad + 188}" y="${opts.height - opts.footerH + 122}" fill="#ff8fb8" font-size="16" font-family="sans-serif">星卡 · 小卡图鉴</text>
    <text data-watermark="1" x="${opts.pad + 188}" y="${opts.height - opts.footerH + 156}" fill="#8a8494" font-size="13" font-family="sans-serif">分享图含水印与小程序码 · 含全部已拥有卡片</text>
  </svg>`;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
