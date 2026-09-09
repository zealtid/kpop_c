import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool, query } from "./db.js";
import { runMigrations } from "./migrate.js";
import { sid, GROUP_H2H, GROUP_BTS } from "./ids.js";
import { writePlaceholderCard } from "./placeholders.js";
import { config } from "./config.js";
import { shanghaiDayUtcRange } from "./time.js";
import { seedDefaultOpsUser } from "./opsAuth.js";

type MemberDef = { en: string; zh: string; ko: string; aliases: string; color: string };

const H2H_MEMBERS: MemberDef[] = [
  { en: "Carmen", zh: "카르멘", ko: "카르멘", aliases: "卡门", color: "#2ec4b6" },
  { en: "Jiwoo", zh: "지우", ko: "지우", aliases: "智雨", color: "#e63946" },
  { en: "Yuha", zh: "유하", ko: "유하", aliases: "有河", color: "#ffb703" },
  { en: "Stella", zh: "스텔라", ko: "스텔라", aliases: "斯特拉", color: "#9b5de5" },
  { en: "Juun", zh: "주은", ko: "주은", aliases: "主恩", color: "#00bbf9" },
  { en: "A-na", zh: "에이나", ko: "에이나", aliases: "艾娜", color: "#f15bb5" },
  { en: "Ian", zh: "이안", ko: "이안", aliases: "伊恩", color: "#00f5d4" },
  { en: "Ye-on", zh: "예온", ko: "예온", aliases: "艺温", color: "#fee440" },
];

const BTS_MEMBERS: MemberDef[] = [
  { en: "RM", zh: "RM", ko: "알엠", aliases: "南俊,金南俊", color: "#7c6cf0" },
  { en: "Jin", zh: "진", ko: "진", aliases: "金硕珍,硕珍", color: "#f4a261" },
  { en: "SUGA", zh: "슈가", ko: "슈가", aliases: "闵玧其,玧其", color: "#2a9d8f" },
  { en: "j-hope", zh: "제이홉", ko: "제이홉", aliases: "郑号锡,号锡", color: "#e9c46a" },
  { en: "Jimin", zh: "지민", ko: "지민", aliases: "朴智旻,智旻", color: "#e76f51" },
  { en: "V", zh: "뷔", ko: "뷔", aliases: "金泰亨,泰亨,泰泰", color: "#4cc9f0" },
  { en: "Jung Kook", zh: "정국", ko: "정국", aliases: "柾国,田柾国,JK", color: "#d62828" },
];

const H2H_RELEASES = [
  {
    key: "the-chase",
    title: "The Chase",
    titleZh: "The Chase",
    aliases: "追逐",
    releasedOn: "2025-02-24",
    kind: "single",
    versions: [
      { version: "Photobook A", benefit: false },
      { version: "Photobook B", benefit: false },
      { version: "特典-POB", benefit: true },
      { version: "特典-KMS", benefit: true },
    ],
  },
  {
    key: "focus",
    title: "FOCUS",
    titleZh: "FOCUS",
    aliases: "焦点",
    releasedOn: "2025-10-20",
    kind: "mini",
    versions: [
      { version: "Regular", benefit: false },
      { version: "特典-Soundwave", benefit: true },
      { version: "特典-Makestar", benefit: true },
    ],
  },
  {
    key: "lemon-tang",
    title: "Lemon Tang",
    titleZh: "Lemon Tang",
    aliases: "柠檬糖",
    releasedOn: "2026-06-22",
    kind: "mini",
    versions: [
      { version: "Lemon Sun", benefit: false },
      { version: "Lemon Beach", benefit: false },
      { version: "特典-Apple Music", benefit: true },
    ],
  },
];

const BTS_RELEASE = {
  key: "arirang",
  title: "ARIRANG",
  titleZh: "ARIRANG",
  aliases: "阿里郎",
  releasedOn: "2026-03-20",
  kind: "album",
  versions: [
    { version: "Standard", benefit: false },
    { version: "特典-Weverse", benefit: true },
    { version: "特典-JP", benefit: true },
  ],
};

export async function seed() {
  await runMigrations();

  await query(
    `INSERT INTO idol_groups (id, slug, name_zh, name_en, name_ko, aliases, logo_color, scope_note, is_pilot)
     VALUES ($1,'h2h','Hearts2Hearts','Hearts2Hearts','하츠투하츠','H2H,心心','#ff6b9d',NULL,true)
     ON CONFLICT (id) DO UPDATE SET
       name_zh = EXCLUDED.name_zh,
       name_ko = EXCLUDED.name_ko,
       aliases = EXCLUDED.aliases`,
    [GROUP_H2H],
  );
  await query(
    `INSERT INTO idol_groups (id, slug, name_zh, name_en, name_ko, aliases, logo_color, scope_note, is_pilot)
     VALUES ($1,'bts','防弹少年团','BTS','방탄소년단','防弹,邦炭','#7c9cff','当前图鉴仅含《ARIRANG》切片',true)
     ON CONFLICT (id) DO UPDATE SET
       scope_note = EXCLUDED.scope_note,
       name_ko = EXCLUDED.name_ko,
       aliases = EXCLUDED.aliases`,
    [GROUP_BTS],
  );

  const memberIds = new Map<string, string>();
  for (const [i, m] of H2H_MEMBERS.entries()) {
    const id = sid(`member:h2h:${m.en}`);
    memberIds.set(`h2h:${m.en}`, id);
    await query(
      `INSERT INTO members (id, group_id, name_zh, name_en, name_ko, aliases, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         color = EXCLUDED.color,
         name_ko = EXCLUDED.name_ko,
         aliases = EXCLUDED.aliases`,
      [id, GROUP_H2H, m.zh, m.en, m.ko, m.aliases, m.color, i],
    );
  }
  for (const [i, m] of BTS_MEMBERS.entries()) {
    const id = sid(`member:bts:${m.en}`);
    memberIds.set(`bts:${m.en}`, id);
    await query(
      `INSERT INTO members (id, group_id, name_zh, name_en, name_ko, aliases, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         color = EXCLUDED.color,
         name_ko = EXCLUDED.name_ko,
         aliases = EXCLUDED.aliases`,
      [id, GROUP_BTS, m.zh, m.en, m.ko, m.aliases, m.color, i],
    );
  }

  let published = 0;
  for (const rel of H2H_RELEASES) {
    const rid = sid(`release:h2h:${rel.key}`);
    await query(
      `INSERT INTO releases (id, group_id, title, title_zh, aliases, released_on, kind, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'published')
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         aliases = EXCLUDED.aliases`,
      [rid, GROUP_H2H, rel.title, rel.titleZh, rel.aliases, rel.releasedOn, rel.kind],
    );
    for (const m of H2H_MEMBERS) {
      for (const v of rel.versions) {
        await upsertTemplate({
          groupSlug: "h2h",
          groupName: "H2H",
          releaseId: rid,
          releaseKey: rel.key,
          releaseTitle: rel.title,
          memberId: memberIds.get(`h2h:${m.en}`)!,
          member: m,
          version: v.version,
          isBenefit: v.benefit,
        });
        published += 1;
      }
    }
  }

  const arirangId = sid("release:bts:arirang");
  await query(
    `INSERT INTO releases (id, group_id, title, title_zh, aliases, released_on, kind, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'published')
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       aliases = EXCLUDED.aliases`,
    [arirangId, GROUP_BTS, BTS_RELEASE.title, BTS_RELEASE.titleZh, BTS_RELEASE.aliases, BTS_RELEASE.releasedOn, BTS_RELEASE.kind],
  );
  for (const m of BTS_MEMBERS) {
    for (const v of BTS_RELEASE.versions) {
      await upsertTemplate({
        groupSlug: "bts",
        groupName: "BTS",
        releaseId: arirangId,
        releaseKey: "arirang",
        releaseTitle: BTS_RELEASE.title,
        memberId: memberIds.get(`bts:${m.en}`)!,
        member: m,
        version: v.version,
        isBenefit: v.benefit,
      });
      published += 1;
    }
  }

  // deprecated published card — must be excluded from progress denominator
  await upsertTemplate({
    groupSlug: "h2h",
    groupName: "H2H",
    releaseId: sid("release:h2h:the-chase"),
    releaseKey: "the-chase",
    releaseTitle: "The Chase",
    memberId: memberIds.get("h2h:Carmen")!,
    member: H2H_MEMBERS[0],
    version: "误印-废弃",
    isBenefit: false,
    isDeprecated: true,
  });

  // draft without image — cannot publish (D03)
  const draftNoImg = sid("tpl:h2h:draft-no-image");
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
     VALUES ($1,$2,$3,'H2H-DRAFT-NOIMG','Carmen Draft No Image','Draft-NoImg',false,false,'draft',NULL,'h2h:The Chase:Carmen:Draft-NoImg')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [draftNoImg, sid("release:h2h:the-chase"), memberIds.get("h2h:Carmen")],
  );

  await seedFeedAndSchedule();
  await seedDefaultOpsUser();

  console.log(`seeded M1 catalog + M2-a feed/schedule + OPS-0 ops user; published templates≈${published}; public=${config.publicBaseUrl}`);
}

async function upsertTemplate(opts: {
  groupSlug: string;
  groupName: string;
  releaseId: string;
  releaseKey: string;
  releaseTitle: string;
  memberId: string;
  member: MemberDef;
  version: string;
  isBenefit: boolean;
  isDeprecated?: boolean;
}) {
  const dedupeKey = `${opts.groupSlug}:${opts.releaseTitle}:${opts.member.en}:${opts.version}`;
  const code = `${opts.groupSlug}-${opts.releaseKey}-${slug(opts.member.en)}-${slug(opts.version)}`.toUpperCase();
  const id = sid(`tpl:${dedupeKey}`);
  const imageUrl = await writePlaceholderCard({
    code,
    color: opts.member.color,
    member: opts.member.en,
    version: opts.version,
    group: opts.groupName,
  });
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,$10)
     ON CONFLICT (dedupe_key) DO UPDATE SET
       main_image_url = EXCLUDED.main_image_url,
       is_benefit = EXCLUDED.is_benefit,
       is_deprecated = EXCLUDED.is_deprecated,
       status = 'published'`,
    [
      id,
      opts.releaseId,
      opts.memberId,
      code,
      `${opts.member.en} ${opts.releaseTitle} ${opts.version}`,
      opts.version,
      opts.isBenefit,
      !!opts.isDeprecated,
      imageUrl,
      dedupeKey,
    ],
  );
  return id;
}

/** Pilot L1 feeds + ticket_sale / live so Railway/dev can smoke without UI. */
async function seedFeedAndSchedule() {
  const h2hFeed = sid("feed:h2h:l1-sample");
  const btsFeed = sid("feed:bts:l1-sample");
  await query(
    `INSERT INTO feed_items
       (id, title, summary, body, category, trust_level, canonical_url, published_at,
        is_machine_translated, source_note, status, featured)
     VALUES
       ($1, 'H2H 《FOCUS》官方预告', 'Hearts2Hearts 官方频道发布新预告', NULL, 'official', 'L1',
        'https://weverse.io/hearts2hearts', now(), false, 'Weverse 官方', 'published', true),
       ($2, 'BTS 《ARIRANG》日程提醒', 'ARIRANG 相关官方日程整理', NULL, 'news', 'L1',
        'https://ibighit.com/bts', now(), true, '官方站点（机翻）', 'published', true)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       trust_level = EXCLUDED.trust_level,
       is_machine_translated = EXCLUDED.is_machine_translated,
       source_note = EXCLUDED.source_note,
       status = 'published',
       featured = true,
       published_at = COALESCE(feed_items.published_at, EXCLUDED.published_at),
       updated_at = now()`,
    [h2hFeed, btsFeed],
  );
  await query(
    `INSERT INTO feed_item_groups (feed_item_id, group_id) VALUES ($1, $2), ($3, $4)
     ON CONFLICT DO NOTHING`,
    [h2hFeed, GROUP_H2H, btsFeed, GROUP_BTS],
  );

  const ticketId = sid("sched:bts:ticket-sale-sample");
  const liveId = sid("sched:h2h:live-sample");
  const { start } = shanghaiDayUtcRange();
  const ticketStart = new Date(start.getTime() + 10 * 3600 * 1000); // 10:00 Asia/Shanghai
  const liveStart = new Date(start.getTime() + 21 * 3600 * 1000);
  const liveEnd = new Date(start.getTime() + 22 * 3600 * 1000);
  await query(
    `INSERT INTO schedule_events
       (id, group_id, title, start_at, end_at, timezone_note, kind, location, source_url,
        trust_level, status, release_id)
     VALUES
       ($1, $2, 'BTS ARIRANG 门票开售', $3, NULL, 'KST', 'ticket_sale', NULL,
        'https://weverse.io/bts', 'L1', 'published', NULL),
       ($4, $5, 'H2H Weverse Live', $6, $7, 'KST 21:00', 'live', 'Weverse',
        'https://weverse.io/hearts2hearts', 'L1', 'published', NULL)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       start_at = EXCLUDED.start_at,
       end_at = EXCLUDED.end_at,
       kind = EXCLUDED.kind,
       status = 'published',
       trust_level = 'L1',
       updated_at = now()`,
    [ticketId, GROUP_BTS, ticketStart, liveId, GROUP_H2H, liveStart, liveEnd],
  );
}

function slug(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  seed()
    .then(async () => {
      await pool.end();
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
