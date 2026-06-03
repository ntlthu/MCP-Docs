import { z } from "zod";

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }] });
const text = (s) => ({ content: [{ type: "text", text: s }] });

const TOOLS = [
  {
    name: "login",
    description: "Log in to the Pimlus API with user_id and password. MUST be called before any other data tool — all data tools require a valid token.",
    schema: { user_id: z.string(), password: z.string() },
    handler: async (client, { user_id, password }) => {
      const { expiresIn } = await client.login(user_id, password);
      return text(`Logged in as "${user_id}". Token expires in ${expiresIn ?? "?"}s.`);
    },
  },
  {
    name: "logout",
    description: "Call POST /api/logout to invalidate the token server-side, then clear the local session.",
    schema: {},
    handler: async (client) => {
      await client.logout();
      return text("Logged out.");
    },
  },
  {
    name: "get_category_tree",
    description: "事前に `login` が必要です。階層情報付きのカテゴリツリーを取得します。`child_flag`（1=子カテゴリあり、0=子カテゴリなし）を含むカテゴリ一覧を返します。結果はページネーションされます。\n\n使用する場合:\n- 'カテゴリツリー全体' → フィルタを指定しない\n- 'X の子カテゴリ' → `oya_t_ctg_head_id=X` を指定する\n- 'ルートカテゴリ' → `root_only=1` を指定する\n- 'カテゴリ X に子カテゴリがあるか' → `t_ctg_head_id=X` を指定し、`child_flag` を確認する\n- '2ページ目' / '次のページ' →該当する `page` を指定する\n\n使用しない場合: ユーザーが多言語カテゴリ名のみを必要とする場合（get_category_lang を使用）、または 項目の詳細のみを必要とする場合（get_category_sections を使用）。\n\nフィルタ優先順位: t_ctg_head_id > oya_t_ctg_head_id > root_only。フィルタ未指定の場合は、すべての有効なカテゴリを返します。\n\n戻り値: { ok, categories: [{ t_ctg_head_id, ctg_id, oya_t_ctg_head_id, disp_seq, ctg_name, child_flag }], page, max_page, total }.",
    schema: {
      t_ctg_head_id: z.number().int().optional().describe("特定のカテゴリで絞り込みます。"),
      oya_t_ctg_head_id: z.number().int().optional().describe("親IDで絞り込みます。この親カテゴリの子カテゴリを取得します。"),
      root_only: z.union([z.literal(0), z.literal(1)]).optional().describe("1 = ルートカテゴリのみ取得します。0 または未指定（無視） = ルートカテゴリで絞り込みません。"),
      m_lang_id: z.number().int().optional().describe("表示名の言語（1=日本語、2=英語、3=中国語）。デフォルトは 1 です。"),
      page: z.number().int().min(1).optional().describe("取得したいページ番号（1から開始）。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_category_tree(args)),
  },

  // ===== SPEC #1: /api/getctginfo — t_ctg_head =====
  {
    name: "get_category_info",
    description: "事前に `login` が必要です。`t_ctg_head` テーブルからカテゴリ情報を取得します。PK、ctg_id（完全一致/LIKE）、または ctg_name（t_ctg_lang と JOIN）による絞り込みをサポートしています。\n\n使用する場合:\n- 'カテゴリコードが A01 のカテゴリ' → `ctg_id='A01'`（デフォルトは完全一致）\n- 'コードに A を含むカテゴリ' → `ctg_id='A'` + `ctg_id_like=1`\n- 't_ctg_head_id=42 のカテゴリ' → `t_ctg_head_id=42`\n- 'カテゴリ名が カタログ商品 のカテゴリ' → `ctg_name='カタログ商品'` + `m_lang_id=1`（デフォルトは完全一致）\n- 'カテゴリ名に カタログ を含むカテゴリ' → `ctg_name='カタログ'` + `ctg_name_like=1` + `m_lang_id=1`\n\n使用しない場合: ユーザーが1つのカテゴリに対する全言語のカテゴリ名を必要とする場合（get_category_lang を使用）、またはカテゴリツリー階層を必要とする場合（get_category_tree を使用）。\n\n注意事項: `ctg_name` または `m_lang_id` を指定した場合、レスポンスには `ctg_name` と `m_lang_id` の2項目が追加されます（t_ctg_lang との JOIN による）。すべての *_like のデフォルト値は 0（完全一致）です。完全一致で結果が取得できない場合は、*_like=1 で再試行してください（instructions を参照）。\n\n戻り値: { ok, categories: [{ t_ctg_head_id, ctg_id, ctg_name?, m_lang_id? }], page, max_page, limit, total, page_size }.",
    schema: {
      t_ctg_head_id: z.number().int().optional().describe("t_ctg_head の主キー（PK）です。完全一致で検索します。"),
      ctg_id: z.string().optional().describe("カテゴリコード（例: 'A01'）です。デフォルトは完全一致で検索します。LIKE検索を行う場合は `ctg_id_like=1` を使用します。"),
      ctg_id_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %ctg_id%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      ctg_name: z.string().optional().describe("カテゴリ名（t_ctg_lang と JOIN）。デフォルトは完全一致です。LIKE検索を行う場合は `ctg_name_like=1` を指定します。"),
      ctg_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %ctg_name%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      m_lang_id: z.number().int().optional().describe("ctg_name を使用する場合、言語で絞り込みます（1=日本語、2=英語、3=中国語）"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_category_info(args)),
  },

  // ===== SPEC #2: /api/getctglang — t_ctg_lang =====
  {
    name: "get_category_lang",
    description: "事前に `login` が必要です。`t_ctg_lang` テーブルから多言語のカテゴリ名を取得します。PK、head_id、lang_id、ctg_name（LIKE/完全一致）、または ctg_id（t_ctg_head と JOIN）による絞り込みをサポートしています。\n\n使用する場合:\n- 't_ctg_head_id=10 のカテゴリの日本語/英語/中国語名' → `t_ctg_head_id=10` + `m_lang_id=1/2/3`\n- 'カテゴリ 10 の名前を3言語すべて取得' → `t_ctg_head_id=10`\n- 'カテゴリ名に カタログ を含むカテゴリ' → `ctg_name='カタログ'`\n- 'カテゴリコード A01 のカテゴリ名' → `ctg_id='A01'`\n\n使用しない場合: `ctg_id` のみが必要な場合（get_category_info を使用）、またはカテゴリツリーが必要な場合（get_category_tree を使用）。\n\n注意事項: `ctg_id` を指定した場合、レスポンスには `ctg_id` フィールドが追加されます（t_ctg_head と JOIN）。\n\n戻り値: { ok, ctg_langs: [{ t_ctg_lang_id, t_ctg_head_id, m_lang_id, ctg_name, ctg_id? }], page, max_page, total }.",
    schema: {
      t_ctg_lang_id: z.number().int().optional().describe("t_ctg_lang の主キー（PK）です。完全一致で検索します。"),
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head."),
      m_lang_id: z.number().int().optional().describe("言語：1=日本語、2=英語、3=中国語。未指定の場合は、3言語すべてを返します。"),
      ctg_name: z.string().optional().describe("カテゴリ名です。デフォルトは完全一致です。LIKE検索を行う場合は `ctg_name_like=1` を指定します。"),
      ctg_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %ctg_name%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      ctg_id: z.string().optional().describe("カテゴリコードです（t_ctg_head と JOIN）。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_category_lang(args)),
  },

  // ===== SPEC #3: /api/getctgsections — t_ctg_section =====
  {
    name: "get_category_sections",
    description: "事前に `login` が必要です。`t_ctg_section` テーブルからカテゴリの項目一覧を取得します。PK、head_id、各種フラグ、タイプショートカット、section_name（LIKE/完全一致）、または section_code（m_section の db_column に対応、JOIN は自動実行）による絞り込みをサポートしています。\n\n使用する場合:\n- 'カテゴリ 10 の項目一覧' → `t_ctg_head_id=10`\n- 'カテゴリ 10 の基本項目' → `t_ctg_head_id=10` + `section_type='basic'`\n- 'カテゴリ 10 の共通項目' → `section_type='common'`\n- 'カテゴリ 10 のカスタム項目' → `section_type='custom'`\n- '項目名が 価格 の項目' → `section_name='価格'`\n- 'db_column=price の項目' → `section_code='price'`\n\n使用しない場合: 項目名の多言語情報が必要な場合（get_section_translations を使用）、または data_share_flg が必要な場合（get_data_share_flags を使用）。\n\n⚠️ 注意事項（section_type のマッピングは新仕様に変更済み）:\n- `basic` = base_flg = 1\n- `common` = base_flg = 2（m_section_id IS NOT NULL はもう使用しません）\n- `custom` = base_flg <> 1 AND base_flg <> 2\n→ `section_type` と `base_flg` を同時に指定した場合は、`section_type` が優先されます。\n\n戻り値: { ok, sections: [{ t_ctg_section_id, t_ctg_head_id, m_section_id, data_kbn, section_name, raw_section_name, section_kbn, base_flg, require_flg, relation_flg, reference_flg, m_common_spec_id, help_img_flg, multi_flg, enable_flg, disp_seq_eff, tot_child, tot_par, row_child }], page, max_page, limit, total, page_size }.",
    schema: {
      t_ctg_section_id: z.number().int().optional().describe("t_ctg_section の主キー（PK）です。完全一致で検索します。"),
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head."),
      enable_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("1=enabled, 0=disabled."),
      base_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("1=base section, 0=custom/common."),
      section_type: z.enum(["basic", "common", "custom"]).optional().describe("Shortcut filter, override base_flg."),
      section_name: z.string().optional().describe("項目名です。デフォルトは完全一致です。LIKE検索を行う場合は `section_name_like=1` を指定します。"),
      section_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_name%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      section_code: z.string().optional().describe("m_section の `db_column` です（JOIN）。 デフォルトは完全一致です。"),
      section_code_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_code%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_category_sections(args)),
  },

  // ===== SPEC #5: /api/getctgdatashare — t_ctg_data_share_init =====
  {
    name: "get_data_share_flags",
    description: "事前に `login` が必要です。`t_ctg_data_share_init` テーブルから、各言語ごとの項目の `data_share_flg`（新規データ作成時の初期値）を取得します。\n\n使用する場合:\n- 'カテゴリ 10 のデータ共有フラグ' → `t_ctg_head_id=10`（t_ctg_section と JOIN）\n- '項目 55 のデータ共有フラグ' → `t_ctg_section_id=55`\n\n使用しない場合: 項目の一般的な情報が必要な場合（get_category_sections を使用）。\n\n戻り値: { ok, data_share: [{ t_ctg_data_share_init_id, t_ctg_section_id, m_lang_id, data_share_flg }], page, max_page, total }.",
    schema: {
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head (JOIN t_ctg_section)."),
      t_ctg_section_id: z.number().int().optional().describe("FK → t_ctg_section."),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_data_share_flags(args)),
  },

  // ===== SPEC #8: /api/getsectiontrans — t_section_trans =====
  {
    name: "get_section_translations",
    description: "事前に `login` が必要です。`t_section_trans` テーブルから項目名の翻訳情報を取得します。PK、t_ctg_section_id、m_section_id、m_lang_id、section_name（LIKE/完全一致）、または section_code（= db_column、m_section と JOIN）による絞り込みをサポートしています。\n\n使用する場合:\n- '項目 55 の英語名' → `t_ctg_section_id=55` + `m_lang_id=2`\n- '項目 55 の3言語名' → `t_ctg_section_id=55`\n- 'マスター項目 X の英語名' → `m_section_id=X` + `m_lang_id=2`\n- 'Price を含む翻訳名' → `section_name='Price'` + `m_lang_id=2`\n- 'db_column=price の翻訳名' → `section_code='price'`\n\n使用しない場合: 項目のフラグや構造情報が必要な場合（get_category_sections を使用）。\n\n注意事項: カテゴリによって上書きされた項目の場合は `t_ctg_section_id` で絞り込みます。マスター項目がまだ上書きされていない場合は `m_section_id` で絞り込みます。\n\n戻り値: { ok, section_trans: [{ t_section_trans_id, t_ctg_section_id, m_section_id, m_lang_id, section_name }], page, max_page, total }.",
    schema: {
      t_section_trans_id: z.number().int().optional().describe("t_section_trans の主キー（PK）です。完全一致で検索します。"),
      t_ctg_section_id: z.number().int().optional().describe("FK → t_ctg_section (上書き済みの項目)."),
      m_section_id: z.number().int().optional().describe("FK → m_section (まだ上書きされていない項目マスター)."),
      m_lang_id: z.number().int().optional().describe("言語：1=日本語、2=英語、3=中国語。未指定の場合は、3言語すべてを返します。"),
      section_name: z.string().optional().describe("翻訳済みの項目名です。デフォルトは完全一致です。LIKE検索を行う場合は `section_name_like=1` を指定します。"),
      section_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_name%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      section_code: z.string().optional().describe("m_section の `db_column` です（JOIN）。 デフォルトは完全一致です。"),
      section_code_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_code%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_section_translations(args)),
  },

  // ===== SPEC #9: /api/getseriesinfo — t_series_head =====
  {
    name: "get_series_info",
    description: "事前に `login` が必要です。`t_series_head` テーブルからシリーズ情報を取得します。PK、series_id（完全一致/LIKE）、t_ctg_head_id、series_name（t_series_lang と JOIN）による絞り込みをサポートしています。\n\n使用する場合:\n- 'カテゴリ 10 内のシリーズ' → `t_ctg_head_id=10`\n- 'シリーズコードが SER001 のシリーズ' → `series_id='SER001'`\n- 'SER で始まる／SER を含むシリーズ' → `series_id='SER'` + `series_id_like=1`\n- '日本語のシリーズ名に カタログ を含むシリーズ' → `series_name='カタログ'` + `m_lang_id=1`\n- 't_series_head_id=99 のシリーズ' → `t_series_head_id=99`\n\n使用しない場合: ユーザーがカテゴリ情報を問い合わせている場合（get_category_info を使用）。\n\n注意事項: `series_name` または `m_lang_id` を指定した場合、レスポンスには `series_name` と `m_lang_id` が追加されます（t_series_lang と JOIN）。\n\n戻り値: { ok, series: [{ t_series_head_id, series_id, t_ctg_head_id, series_name?, m_lang_id? }], page, max_page, total }.",
    schema: {
      t_series_head_id: z.number().int().optional().describe("t_series_head の主キー（PK）です。完全一致で検索します。"),
      series_id: z.string().optional().describe("シリーズコード。 デフォルトは完全一致です。"),
      series_id_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %series_id%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head (親カテゴリ)."),
      series_name: z.string().optional().describe("シリーズ名です（t_series_lang と JOIN）。 デフォルトは完全一致です。LIKE検索を行う場合は `series_name_like=1` を指定します。"),
      series_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %series_name%. LIKE検索を行う場合は、明示的に 1 を指定します。"),
      m_lang_id: z.number().int().optional().describe("series_name を使用する場合の言語です（1=日本語、2=英語、3=中国語）。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_series_info(args)),
  },

  // ==========================================================================
  // ===== ITEMINFO endpoints (from api-iteminfo.md) ==========================
  // ==========================================================================

  // ===== /api/getlanglist — m_lang =====
  {
    name: "get_lang_list",
    description: "事前に `login` が必要です。システムで有効な言語一覧を取得します。\n\n使用する場合:\n- 'システムにはどのような言語があるか'\n- '有効な言語一覧'\n- m_lang_id を言語名へ変換する必要がある場合\n\n戻り値: { ok, langs: [{ m_lang_id, lang_kbn, lang_name, disp_seq }], page, max_page, limit, total, page_size }。例: [{1,'ja','日本語',1}, ...]。",
    schema: {},
    handler: async (client) => json(await client.get_lang_list()),
  },

  // ===== /api/getseriesstatus — ⭐ CORE: 「シリーズ状況」タブの全ステータス情報 =====
  {
    name: "get_series_status",
    description: "事前に `login` が必要です。⭐ 商品情報画面向けの CORE API です。1回の呼び出しで、1シリーズのすべてのステータスおよびメタデータを取得します。「シリーズ状況」タブで使用します。\n\n使用する場合:\n- 'LDM-W のシリーズ詳細情報'（t_series_head_id が分かっている場合）\n- 'シリーズの approval_status / translate_status'\n- 'シリーズがロックされているか' → top-level の `is_locked` を確認する\n- 'シリーズ内の品番数' → `item_no_use_del.count_use` を確認する\n- 'ロック解除コメントがあるか' → `approval_comment` を確認する\n- 'シリーズの kyoyu/syuyaku/relation/info' → top-level の各 `*_list` を確認する\n- 'cad_url_kbn / no_reflect_price_flg' → `series_info` 内を確認する\n\n使用しない場合: PK の参照のみが必要な場合（get_series_info を使用）、またはバージョン一覧のみが必要な場合（get_series_version_list を使用）。\n\n⚠️ レスポンス構造（再構成済み）:\n- ほとんどの core 項目は `series_info` 内にあります（flat な top-level ではありません）。\n- `approval_users`（kbn_0=校正、kbn_1=承認）は、旧 `series_approval_rows` の代わりです。\n- `is_locked` と `locked_sections` は TOP-LEVEL にあります（series_info 内ではありません）。\n- `t_item_price.item_count` は 'N 件' 形式の STRING です（int ではありません）。\n- `relation_list/info_list/kyoyu_list/syuyaku_list` 内の `series_name` 項目は、実際には `series_id` コードです（日本語名ではありません）。\n- `info_list` には `relation_ship: 1` が追加されています。`kyoyu_list` には `link_t_series_lang_id, t_ctg_head_id` が追加されています。`syuyaku_list` には `t_series_lang_id` が追加されています。\n- `series_info.approval_status_other_lang`: 他言語の 'lang_id_approval_status,...' 形式の CSV です。\n- `series_info.key_lang_flg=1`: 元言語（日本語）であり、translate_status_name は '-' を返します。\n\napproval_status: 0=未承認, 1=修正中, 2=PM承認中, 3=PM承認済, 4=MK確認済, 5=予約反映済.\ntranslate_status: 1=不要, 2=未, 3=中, 4=済, 5=先行.\n\n戻り値: { ok, series_info: { t_series_head_id, t_ctg_head_id, series_id, series_name, data_kbn, syuyaku_flg, kyoyu_flg, cad_url_kbn, no_reflect_price_flg, t_series_lang_id, m_lang_id, lang_name, stop_flg, key_lang_flg, memo, upd_datetime, add_datetime, add_user_name, upd_user_name, t_series_ver_id, major_ver, minor_ver, approval_status, approval_status_name, translate_status, translate_status_name, translate_base_*, t_series_mei_id, kou_no, kou_no_name, typeset_ver, typeset_ver_lookup, tb_lang_name, is_ctg_user, cnt_header, approval_status_other_lang, object_storage_flg }, is_locked, locked_sections: [{ t_ctg_section_id, add_user_id, t_export_history_id, add_datetime }], approval_users: { kbn_0: [], kbn_1: [{ approval_status, approval_user_kbn, approval_user_id, user_name, approval_status_name }] }, approval_comment: { main_comment, free_comment, t_approval_comment_id }, item_no_use_del: { count_use, count_del }, t_item_price: { item_count: 'N 件', create_date }, relation_list, info_list, kyoyu_list, syuyaku_list }.",
    schema: {
      t_series_head_id: z.number().int().describe("PK series head. 必須です。"),
      m_lang_id: z.number().int().describe("言語（1=日本語、2=英語、3=中国語）。必須です。"),
    },
    handler: async (client, args) => json(await client.get_series_status(args)),
  },

  // ===== /api/getseriesversionlist — kou_noの履歴 =====
  {
    name: "get_series_version_list",
    description: "事前に `login` が必要です。1シリーズのすべてのバージョン履歴（kou_no）を取得します。レンダリングのドロップダウンメニューを使用してバージョンを選択します。\n\n使用する場合:\n- 'シリーズ 101 の各バージョン'\n- '改訂履歴'\n- '全言語のすべてのバージョン' → m_lang_id を未指定にする\n- '日本語のバージョンのみ' → m_lang_id=1\n\n使用しない場合: 現在のバージョンのみが必要な場合（get_series_status に含まれています）。\n\n注意事項:\n- `m_lang_id` は任意です。未指定の場合はすべての言語を取得します。\n- 各 kou_no は、同一 major version 内の1つの改訂を表します。\n- t_series_mei_id は get_series_data の入力として使用します。\n- kou_no_name のマッピング: 0='-', 1='初校', 2='再校', 999='校了', N='N校'\n- ソート順: m_lang_id ASC, major_ver DESC, minor_ver DESC, kou_no DESC\n\n戻り値: { ok, versions: [{ t_series_mei_id, t_series_ver_id, series_name, major_ver, minor_ver, kou_no, kou_no_name, approval_status, m_lang_id, upd_datetime }], page, max_page, limit, total, page_size }.",
    schema: {
      t_series_head_id: z.number().int().describe("PK series head. 必須です。"),
      m_lang_id: z.number().int().optional().describe("言語（1=日本語、2=英語、3=中国語）。任意です。未指定の場合はすべてを対象とします。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_series_version_list(args)),
  },

  // ===== /api/getlockinfo — exclusive edit lock =====
  {
    name: "get_lock_info",
    description: "事前に `login` が必要です。シリーズまたは各項目がロック中（排他編集中）かどうかを確認します。\n\n使用する場合:\n- 'シリーズ 101 はロックされているか'\n- 'どの項目がロックされているか'\n- '誰がシリーズを編集中か'\n\n注意事項: ロックはエクスポート中に存在され、エクスポート完了後に自動的にロック解除されます。`t_series_exclusive` に `t_ctg_section_id` が NULL のレコードが存在する場合、`is_locked=true` となります。\n\n戻り値: { ok, series_locked: bool, locked_sections: [{ t_ctg_section_id, add_user_id, t_export_history_id, add_datetime }] }.",
    schema: {
      t_series_head_id: z.number().int().describe("PK series head. 必須です。"),
      m_lang_id: z.number().int().describe("言語。必須です。"),
    },
    handler: async (client, args) => json(await client.get_lock_info(args)),
  },

  // ===== /api/getseriesdata — ⭐ CORE: リビジョンの項目内容 =====
  {
    name: "get_series_data",
    description: "事前に `login` が必要です。⭐ 商品情報画面向けの CORE API です。1シリーズのリビジョンにおけるすべての項目の内容を取得します。基本項目 / 共通項目 / フリー項目タブで使用します。\n\n使用する場合:\n- 'リビジョン 401 の項目内容'\n- '基本項目タブのデータ' → `data_kbn=1`（base_flg=1）\n- '共通項目タブのデータ' → `data_kbn=2`（base_flg=2）\n- 'フリー項目タブのデータ' → `data_kbn=3`（t_section から取得、free_section_flg=1）\n- 'すべてのタブ' → `data_kbn` を未指定にする（シリーズ種別に応じた項目を取得）\n\n使用しない場合:\n- データ未作成のテンプレート項目が必要な場合 → get_category_sections を使用\n- cad_url_kbn / no_reflect_price_flg が必要な場合 → get_series_status にあります（ここにはありません）\n- コメント一覧が必要な場合 → ⚠️ レスポンスには含まれていません。Web AJAX 側の別機能です。\n\n⚠️ 重要な注意事項:\n- 配列キーは `section_data` です（`data` ではありません）\n- t_ctg_section_id は TEXT です（int ではありません）\n- data_id は sequence xml_data_tag_id_seq から採番される business key です（TEXT）\n- 含まれていない項目: comment_list, help_t_ctg_section_id, open_flg, checkdis, list_media（Web AJAX のみに存在）\n- `data_kbn=3` の場合は `t_section` から取得し、レスポンスには `t_section_id` 項目が追加されます\n- データ未作成の項目は `section_data: []` になります\n- 項目は `section_disp_seq`、データは `data_disp_seq` の順にソートされます\n\nsection_kbn: 1=text, 2=image, 3=excel, 4=textarea, 5=checkbox, 6=header_excel, 99=mix.\n\n戻り値: { ok, sections: [{ t_ctg_section_id, section_name, disp_section_name, section_kbn, base_flg, require_flg, relation_flg, multi_flg, m_common_spec_id, free_section_flg, section_disp_seq, pre, suf, t_section_id, section_data: [{ t_section_data_id, data_id, text_data, filename, org_filename, header_filename, org_header_filename, title, alt, note, unit, link_url, target, table_type, table_page, data_disp_seq, mei_share, fixedrowheight, data_add_datetime }] }], total_sections, total, page, max_page, limit, page_size }.",
    schema: {
      t_series_mei_id: z.number().int().describe("リビジョンIDです（get_series_status または get_series_version_list から取得します）。必須です。"),
      t_ctg_head_id: z.number().int().describe("PK category. 必須です。"),
      m_lang_id: z.number().int().describe("言語。必須です。"),
      data_kbn: z.number().int().optional().describe("Filter tab: 1=基本項目 (base_flg=1), 2=共通項目 (base_flg=2), 3=フリー項目 (free_section_flg=1, t_section から取得)。シリーズ種別に応じた項目を取得します。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("1ページあたりの項目数です。デフォルトは 50 です。"),
    },
    handler: async (client, args) => json(await client.get_series_data(args)),
  },

  // ===== /api/getiteminfolist — 品番のリスト =====
  {
    name: "get_item_info_list",
    description: "事前に `login` が必要です。1つのシリーズリビジョンに属する品番一覧を取得します。各品番にはスペック値（1品番につき複数の スペックカラムを持つ可能性があります）が含まれます。\n\n使用する場合:\n- 'リビジョン401 の品番一覧' → `t_series_mei_id=401`\n- '有効な品番' → `del_flg=0`\n- '削除済み品番' → `del_flg=1`\n- 'LDM-W を含む品番を検索' → `item_item_no='ldm-w'`（ILIKE 部分一致）\n- 'D1、D2、最高回転数のみ取得' → `spec_names='D1,D2,最高回転数'`（トークン数増加防止のため必須）\n\n⚠️ トークン数制限に関する注意:\n- 1シリーズあたり 50～100 以上のスペックカラムを持つ場合があります。デフォルトではすべて返却されるため、レスポンスが非常に大きくなり、AI のトークン制限を超える可能性があります。\n- 以下の場合は `spec_names` の指定を必須としてください:\n  - シリーズに多数のスペックが存在する場合（10カラム超）\n  - ユーザーが特定のスペックのみを質問している場合（例: 'この品番の D1 は何ですか'）\n  - 判断に迷う場合は、安全のため `spec_names` を優先して指定してください\n- ユーザーが明確に 'すべてのスペック' や 'フルデータ' を要求している場合のみ、`spec_names` は不要です。\n\n注意事項:\n- `spec_names` はカンマ区切りのラベル名です（`m_item_header.spec_value` に対して ILIKE 検索を行います）\n- 例: `spec_names='D1,D2'` → その2つのスペックカラムのみ返却します\n- `spec_names='最高'` → ILIKE 検索となり、名称に '最高' を含むすべてのスペックを返却します\n- t_series_mei_id から `series_item_no` と `m_lang_id` は自動的に解決されます\n- 価格情報は含まれません。価格が必要な場合は `get_item_info_detail` を使用してください\n\n戻り値: { ok, items: [{ t_item_info_id, series_item_no, catalog_item_no, item_item_no, i7_item_no, cadenas_item_no, del_flg, m_lang_id, specs: {...} }], count_use, count_del, total, page, max_page, limit, page_size }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. 必須です。"),
      item_item_no: z.string().optional().describe("品番でフィルタします（ILIKE）。デフォルトは部分一致 '%value%'; 完全一致検索を行う場合は、`exact=1` を指定します（大文字・小文字は区別しません）。"),
      del_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("0=active, 1=deleted. 未指定 = すべて"),
      spec_names: z.string().optional().describe("⚠️ Comma-separated spec label names (ILIKE match m_item_header.spec_value). 例: 'D1,D2,最高回転数'。すべてのスペックが不要な場合は、トークン数の増加を避けるため必ず指定します。未指定の場合はすべてのスペックを返します（非常に大きくなる可能性があります）。マッチモードは `exact` を参照します。spec_id が分かっている場合は、このパラメータではなく spec_ids を使用します。"),
      spec_ids: z.string().optional().describe("⚠️ Comma-separated spec_id values (例: 'spec0002,spec0025')。get_item_header から spec_id が分かっている場合に使用します。spec_names より高速かつ正確です。spec_names と併用した場合は union（OR）条件になります。不正な spec_id（spec\\d+ 形式ではないもの）は自動的に無視されます。"),
      col_values: z.string().optional().describe("🎯 スペックセルの実際の値で行を絞り込む場合に使用します。形式は、カンマ区切りの 'specXXXX:value' ペアです（例: 'spec0092:M5' または 'spec0092:M5,spec0094:正目'）。AND 条件で判定され、すべての条件に一致する必要があります。マッチモードは `exact` に従います（0=部分一致、1=完全一致）。不正な spec_id は無視されます。"),
      exact: z.union([z.literal(0), z.literal(1)]).optional().describe("item_item_no、spec_names、および col_values のすべてに適用されます。0=部分一致 ILIKE '%value%'（デフォルト）、1=完全一致 ILIKE 'value'（大文字・小文字を区別しない、ワイルドカードなし）。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_item_info_list(args)),
  },

  // ===== /api/getiteminfospeclistbyctg — カテゴリ別の品番およびSPEC =====
  {
    name: "get_item_info_spec_list_by_ctg",
    description: "事前に `login` が必要です。1つのカテゴリ内のすべてのシリーズに属する品番と SPEC 値（ワイド形式）を取得します。 get_item_info_list と同様ですが、t_series_mei_id ではなく t_ctg_head_id で絞り込むため、複数シリーズの品番が返却されます。\n\n⚠️ トークン数制限に関する注意（get_item_info_list より重要）:\n- 1カテゴリに 100 以上のシリーズ × 1000 以上の品番 × 500 以上の SPEC カラムが存在する可能性があり、レスポンスが極めて大きくなる場合があります。\n- ほとんどのケースで `spec_names` の指定が必須です。\n- ユーザーが明確に 'すべての SPEC' を要求している場合を除き、常に `spec_names` を指定してください。\n- 品番検索時は limit を 100 より大きくしないでください。デフォルトは limit=50 です。\n\n⚠️ SPEC 値フィルタについて — API は SPEC 値による絞り込みをサポートしていません:\n- 'spec0002=M5 の品番のみ取得' のような言われません。API はすべての品番を返却するため、取得後にコード側でフィルタリングする必要があります。\n- 推奨ワークフロー: 1) get_item_header で正しいラベルを取得 → 2) spec_names + limit=50 を指定して本 API を呼び出す → 3) レスポンス内の SPEC 値でフィルタリングする。\n- 1ページ目に目的の値が存在しない場合は、ページ送り（page=2,3...）または別の SPEC カラムを試してください。\n\n使用する場合:\n- 'カテゴリ X 内の全品番の D1、D2 を取得' → t_ctg_head_id=X + spec_names='D1,D2'\n- 'カテゴリ Y 内の品番 LDM-W-10 を検索' → t_ctg_head_id=Y + item_item_no='LDM-W-10'\n- 'カテゴリ X 内のシリーズ間で D1 を比較' → t_ctg_head_id=X + spec_names='D1'\n\n使用しない場合:\n- t_series_mei_id が分かっている場合 → get_item_info_list を使用（より高速でデータ量も少ない）\n- カテゴリが不明な状態でグローバル検索したい場合 → get_item_info_search を使用\n- spec_names を指定せず、かつカテゴリ内に多数のシリーズが存在する場合 → タイムアウトやトークン超過の可能性があります\n- 正しい SPEC カラムが分からない場合 → 先に get_item_header を使用してください\n\n注意事項:\n- m_lang_id は必須です（t_ctg_head_id から自動解決されません）\n- 各 item の series_item_no はシリーズコードです（例: 'LDM-W'）。どのシリーズに属する品番かを判別できます\n- headers は spec_id → ラベルの対応表です。カラム表示時に使用してください\n- 結果は series_item_no、item_item_no の順でソートされます\n\n戻り値: { ok, headers: { spec_id: label }, items: [{ t_item_info_id, series_item_no, catalog_item_no, item_item_no, i7_item_no, cadenas_item_no, del_flg, shitsuryo, item_sort, add_datetime, upd_datetime, spec0XXX: '...' }], total, page, limit, max_page, page_size }.",
    schema: {
      t_ctg_head_id: z.number().int().describe("ID category (t_ctg_head_id). 必須です。"),
      m_lang_id: z.number().int().describe("言語（1=日本語、2=英語、3=中国語）。必須です。"),
      item_item_no: z.string().optional().describe("品番でフィルタします（ILIKE）。デフォルトは部分一致 '%value%'; 完全一致検索を行う場合は、`exact=1` を指定します（大文字・小文字は区別しません）。"),
      del_flg: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("0=active (default), 1=deleted, 2=discontinued."),
      spec_names: z.string().optional().describe("⚠️ Comma-separated spec label names. トークン数の増加を避けるため、原則として常に指定してください。未指定の場合はすべての SPEC を返します（カテゴリが大きい場合は非常に危険です）。マッチモードは `exact` を参照します。spec_id が分かっている場合は、このパラメータではなく spec_ids を使用してください（より高速かつ正確です）。"),
      spec_ids: z.string().optional().describe("⚠️ Comma-separated spec_id values (例： 'spec0002,spec0025'). get_item_header で spec_id が分かっている場合に使用します。spec_names より高速かつ正確です。spec_names と併用した場合は union（OR）条件になります。不正な spec_id（spec\\d+ 形式ではないもの）は自動的に無視されます。"),
      col_values: z.string().optional().describe("🎯 SPEC セル内の実際の値で行を絞り込みます。形式はカンマ区切りの 'specXXXX:value' ペアです（例: 'spec0092:M5' または 'spec0092:M5,spec0094:正目'）。AND 条件で判定され、すべての条件に一致する必要があります。マッチモードは `exact` に従います（0=部分一致、1=完全一致）。不正な spec_id は自動的に無視されます。推奨ワークフロー：get_item_header(spec_value='M5') → spec0092 がわかる → spec_ids='spec0092' と col_values='spec0092:M5' を指定して正確に絞り込みます。"),
      exact: z.union([z.literal(0), z.literal(1)]).optional().describe("item_item_no、spec_names、および col_values のすべてに適用されます。0=部分一致 ILIKE '%value%'（デフォルト）、1=完全一致 ILIKE 'value'（大文字・小文字を区別しない、ワイルドカードなし）です。例: exact=1 + col_values='spec0092:M5' の場合、spec0092='M5' に完全一致する行のみを取得します。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_item_info_spec_list_by_ctg(args)),
  },

  // ===== /api/getitemheader — spec_id ↔ spec_value（m_item_header）の照会 =====
  {
    name: "get_item_header",
    description: "事前に `login` が必要です。`m_item_header` テーブルを参照し、spec_id ↔ spec_value（SPECコラムラベル）の対応関係を取得します。SPEC 名から spec_id を調べる場合や、その逆の変換を行う場合に使用します。\n\n⭐ get_item_info_list / get_item_info_spec_list_by_ctg を spec_names 付きで呼び出す前に、必ず本ツールを使用してください。正しい列名を特定することで、誤った検索による空レスポンスや、不要に巨大なレスポンスの取得を防ぐことができます。\n\n使用する場合:\n- 'ねじの呼び の spec_id は何か' → `spec_value='ねじの呼び'` + `spec_value_like=1` + `m_lang_id=1`\n- 'spec0002 のラベルは何か' → `spec_id='spec0002'` + `m_lang_id=1`\n- '名前に D を含むすべての SPEC' → `spec_value='D'` + `spec_value_like=1` + `m_lang_id=2`\n- 'spec00 で始まる SPEC は何か' → `spec_id='spec00'` + `spec_id_like=1`\n- '品番検索前に適切な SPEC 列を特定したい' → 広めのキーワードで検索（例: 'ねじ', '呼び', 'L'）\n\n使用しない場合:\n- 各品番の SPEC 値が必要な場合 → get_item_info_list または get_item_info_spec_list_by_ctg を使用します。\n\n推奨ワークフロー（SPEC 値で品番を検索する場合。例: M5 の品番を検索）:\n1. get_item_header(spec_value='M5', spec_value_like=1, m_lang_id=1) → 'M5' を含む spec_id と spec_value の一覧を取得\n   結果が空の場合 → 'ねじ'、'呼び'、'Nominal' など、より広いキーワードで再検索\n   複数の候補列が見つかる場合があります（例: spec0002='ねじの呼び'、spec0187='ねじ'、spec0276='呼び'）→ ユーザーにすべて提示して確認します\n2. get_item_info_spec_list_by_ctg(spec_names='<手順1で取得したラベル>', exact=1, limit=50) → 品番データを取得\n   品番検索時は limit を 100 より大きくしないでください\n3. レスポンス内の品番を目的の SPEC 値で絞り込みます（例: spec0002 == 'M5'）\n   1ページ目に結果がない場合 → page=2、3... を試す、または別の SPEC 列を試します\n\n注意事項:\n- `spec_value_like=1` は ILIKE `%value%` を使用します。キーワード検索（例: 'ねじ'）を行う場合に推奨します\n- `spec_value_like=0`（デフォルト）は ILIKE 完全一致を使用し、ラベル全体が一致するもののみ取得します\n- `spec_id_like=1` は ILIKE `%spec_id%` を使用し、列名のプレフィックスやサフィックス検索に利用できます\n- `m_lang_id` を指定しない場合は、3言語すべて（日本語・英語・中国語）を返します\n- 結果は m_lang_id、spec_id の順でソートされます\n\n戻り値: { ok, headers: [{ m_item_header_id, spec_id, spec_value, m_lang_id }], total, page, limit, max_page, page_size }.",
    schema: {
      spec_id: z.string().optional().describe("spec_id（例: 'spec0002'）で絞り込みます。デフォルトは完全一致 ILIKE です。部分一致検索を行う場合は spec_id_like=1 を指定します。"),
      spec_id_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=ILIKE %spec_id%."),
      spec_value: z.string().optional().describe("SPEC ラベル（例: 'ねじの呼び'、'D1'）で絞り込みます。デフォルトは ILIKE 完全一致です。部分一致検索を行う場合は `spec_value_like=1` を指定します。"),
      spec_value_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=ILIKE %spec_value%. キーワード検索を行う場合に推奨します。"),
      m_lang_id: z.number().int().optional().describe("言語：1=日本語、2=英語、3=中国語。未指定の場合は、3言語すべてを返します。"),
      del_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("0=active (default), 1=deleted."),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_item_header(args)),
  },

  // ===== /api/getiteminfodetail — 1品番の詳細および価格情報 =====
  {
    name: "get_item_info_detail",
    description: "事前に `login` が必要です。1品番の完全な情報を取得します。t_item_info_price と JOIN し、価格情報（tanka、tani）も含めて返します。\n\n使用する場合:\n- '品番 LDM-W-10 の詳細情報'\n- '品番 X の価格'\n- '品番の JP/EN/CN 出力フラグ'\n\n注意事項:\n- `item_item_no` は完全一致です\n- `t_series_mei_id` から `m_lang_id` は自動的に解決されます（m_lang_id も同時に指定された場合は、series_mei_id を優先します）\n- t_item_info_price に該当レコードが見つからない場合、`price` は `null` になります\n- 含まれていない項目: tanka_en, tani_en, shitsuryo, slide_price, cad_url（仕様から除外済み）\n- output_jpn/eng/cn フラグは `price` オブジェクト内にあります（top-level item ではありません）\n\n戻り値: { ok, item: { t_item_info_id, series_item_no, catalog_item_no, item_item_no, i7_item_no, cadenas_item_no, del_flg, m_lang_id, add_datetime, upd_datetime, price: { t_item_info_price_id, tanka, tani, output_jpn, output_eng, output_cn, add_datetime, upd_datetime } | null } }.",
    schema: {
      item_item_no: z.string().describe("Mã 品番 EXACT (vd: 'LDM-W-10'). 必須です。"),
      t_series_mei_id: z.number().int().optional().describe("リビジョンで絞り込みます。m_lang_id は自動的に解決されます。"),
      m_lang_id: z.number().int().optional().describe("言語で絞り込みます。t_series_mei_id が指定されている場合は無視されます。"),
    },
    handler: async (client, args) => json(await client.get_item_info_detail(args)),
  },

  // ===== /api/getiteminfocount — 有効品番数・廃番品番数集計（削除済み除外） =====
  {
    name: "get_item_info_count",
    description: "事前に `login` が必要です。1つのシリーズリビジョンにおける品番数（有効品番 + 廃番品番、`del_flg=1` は除外）と、最新の品番作成日時を集計します。\n\n使用する場合:\n- 'リビジョン 401 に品番はいくつあるか' → `item_count` を確認します\n- '最後に品番が新規作成された日時はいつか' → `latest_add_datetime` を確認します\n\n使用しない場合:\n- 有効品番 / 廃番 / 削除済みの内訳が必要な場合 → get_item_info_status_count を使用します\n- 品番一覧が必要な場合 → get_item_info_list を使用します\n\n注意事項: `del_flg=1`（削除済み）の品番は集計対象外です。削除済みも含めて確認する場合は get_item_info_status_count を使用してください。\n\n戻り値: { ok, series_id, m_lang_id, item_count: int, latest_add_datetime: string|null }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. 必須です。"),
    },
    handler: async (client, args) => json(await client.get_item_info_count(args)),
  },

  // ===== /api/getiteminfostatuscount — del_flg ごとの件数内訳 =====
  {
    name: "get_item_info_status_count",
    description: "事前に `login` が必要です。1つの改訂における品番数の内訳（del_flg別）を取得します（総数 / 有効品番 / 廃番品番 / 削除済み品番）。\n\n使用する場合:\n- '有効品番・廃番品番・削除済み品番の内訳'\n- '削除済み品番はいくつあるか'\n- ステータスごとの比率を確認したい場合\n\n使用しない場合:\n- 削除済みを除いた総数のみが必要な場合 → get_item_info_count を使用します（より高速です）\n- 品番一覧が必要な場合 → get_item_info_list を使用します\n\n注意事項: `all_count` には削除済み（del_flg=1）も含まれます。`active_count` + `stop_count` + `deleted_count` = `all_count` になります。\n\n戻り値: { ok, series_id, m_lang_id, all_count, active_count, stop_count, deleted_count }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. 必須です。"),
    },
    handler: async (client, args) => json(await client.get_item_info_status_count(args)),
  },

  // ===== /api/getiteminfopricestatuscount — 価格が設定済みかどうかの報告 =====
  {
    name: "get_item_info_price_status",
    description: "事前に `login` が必要です。言語ごとに、1つのリビジョンにおける価格設定済み品番数と未設定品番数をレポートします。価格未設定の品番コード一覧を返却します。\n\n使用する場合:\n- 'どの品番に価格が設定されていないか' → `missing_price_items` を参照\n- '価格設定の進捗状況レポート'\n- '価格未設定の品番があと何件あるか'\n- 'シリーズの価格カバレッジ率（%）'\n\n使用しない場合: 各品番の価格詳細が必要な場合（`get_item_price` または `get_item_info_detail` を使用）。\n\n注意事項: m_lang_id のデフォルトは 1=日本語 です。価格ステータスは言語ごとにチェックされます（日本語/英語/中国語ごとに価格が異なる可能性があるため）。\n\n戻り値: { ok, series_id, m_lang_id, total_items, items_with_price, items_without_price, missing_price_items: [item_item_no, ...] }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. 必須です。"),
      m_lang_id: z.number().int().optional().describe("言語（1=日本語、2=英語、3=中国語）。デフォルトは 1=日本語 です。"),
    },
    handler: async (client, args) => json(await client.get_item_info_price_status(args)),
  },

  // ===== /api/getiteminfosearch — キーワード＋カテゴリ名／シリーズ名で品番を検索 =====
  {
    name: "get_item_info_search",
    description: "事前に `login` が必要です。⭐ カテゴリ名、シリーズ名、ステータスによる絞り込みオプションで、品番コード／品番名のキーワードで GLOBAL に品番検索を行います。特定のシリーズには限定されません。\n\n使用する場合:\n- 'システム全体で LDM を含む品番を検索' → `keyword='LDM'`\n- 'クランプのカテゴリの品番を検索' → `ctg_name='クランプ'`\n- 'シリーズ LDM-W の品番を検索' → `series_name='LDM-W'`\n- 'カテゴリ クランプ 内で LDM の品番を検索' → `keyword='LDM'` + `ctg_name='クランプ'`\n- 'active 品番を検索' → `del_flg=0`; '削除済み品番を検索' → `del_flg=1`; '廃番品番を検索' → `del_flg=2`\n\n使用しない場合: `t_series_mei_id` が既知で一覧のみが必要な場合（`get_item_info_list` を使用 — より高速です）。\n\n注意事項: `m_lang_id` は必須です。`keyword`、`ctg_name`、`series_name` のいずれか1つ以上を指定する必要があります。\n\n戻り値: { ok, total, page, limit, max_page, page_size, items: [{ t_item_info_id, item_item_no, catalog_item_no, i7_item_no, del_flg, m_lang_id, series_id, t_ctg_head_id, ctg_id, ctg_name }] }.",
    schema: {
      m_lang_id: z.number().int().describe("言語（1=日本語、2=英語、3=中国語）。必須です。"),
      keyword: z.string().optional().describe("キーワードは品番コード／品名を対象に検索します"),
      ctg_name: z.string().optional().describe("カテゴリ名でフィルタします。"),
      series_name: z.string().optional().describe("シリーズ名でフィルタします。"),
      del_flg: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("0=active, 1=deleted, 2=廃番. 未指定 = すべて"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_item_info_search(args)),
  },

  // ===== /api/getitemprice — giá 品番 đa ngôn ngữ + source =====
  {
    name: "get_item_price",
    description: "事前に `login` が必要です。事前に login が必要です。1つの品番の価格詳細を取得します（JP/EN/CN の3言語すべて、output_jpn/eng/cn フラグ、source manual/sftp、timestamps を含む）。\n\n使用する場合:\n- '品番 LDM-W-10 の価格' → `item_item_no='LDM-W-10'` + `series_item_no='LDM-W'`\n- '日本語（JP）のみの品番価格' → `m_lang_id=1`を追加してフィルタ\n- '価格アップロード履歴 / manual vs sftpの価格元'\n\n使用しない場合:\n- 詳細情報（品名 + meta + 価格サマリ）が必要な場合 → get_item_info_detail を使用\n- 価格カバレッジレポートが必要な場合 → get_item_info_price_status を使用\n\n注意事項:\n- `item_item_no` + `series_item_no` はどちらも必須です（品番を正確に特定するため、両方が必要です）\n- `prices`配列は複数のエントリになる場合があります（m_lang_id ごとに1件）\n- `source: 'manual'` = 手動入力, `'sftp'` = SFTP からのインポート\n- `tanka`, `tani`は文字列です（数値ではありません）\n\n戻り値: { ok, item_item_no, series_item_no, prices: [{ t_item_info_price_id, m_lang_id, tanka, tani, output_jpn, output_eng, output_cn, source, t_itemno_price_upload_id, add_datetime, upd_datetime }] }.",
    schema: {
      item_item_no: z.string().describe("品番コード (例：'LDM-W-10'). 必須です。"),
      series_item_no: z.string().describe("シリーズコード (例：'LDM-W'). 必須です。"),
      m_lang_id: z.number().int().optional().describe("特定の言語でフィルタします（1=JP、2=EN、3=CN）。未指定の場合は3言語すべてを返却します。"),
    },
    handler: async (client, args) => json(await client.get_item_price(args)),
  },

  // ===== /api/getitempricebylist — リビジョン内の全品番の一括価格 =====
  {
    name: "get_item_price_by_list",
    description: "事前に `login` が必要です。1回の呼び出し（bulk）で、1つのシリーズリビジョン内のすべての品番の価格を取得します。 LEFT JOIN を使用しているため、価格が存在しない品番も has_price=false として返却されます。\n\n⚠️ トークン: 大規模シリーズ（150+ 品番）の場合、5万文字以上を返却する可能性があります。補助項目（output_*、source、datetime）が必要な場合を除き、常に compact=1（デフォルト）を使用してください。\n\n使用する場合:\n- 'リビジョン401の全価格' → `t_series_mei_id=401`\n- 'シリーズの一括価格一覧' → これは唯一のツールです(このツールのみを使用)\n- 'どの品番に価格が未設定か確認し、現在の価格も見たい' → 結果の `has_price` でフィルタ\n- 'リビジョン401の品番 LDM-W-10 の価格' → `item_item_no='LDM-W-10'`を追加で指定\n- 'リビジョン内の active 品番の価格' → `del_flg=0`\n\n使用しない場合:\n- 特定の1品番のみが必要な場合 → `get_item_price`を使用（より高速）\n- 価格カバレッジレポート（価格が設定されている品番数など）のみが必要な場合 → `get_item_info_price_status`を使用\n- 品番の完全な詳細情報（名称、meta）と価格が必要な場合 → `get_item_info_detail`を使用\n\n注意事項:\n-  `has_price=true` は `t_item_info_price` にレコードが存在することの意味; `false` = 価格未設定\n- `source='manual'` = 手動入力; `'sftp'` = SFTPインポート; `null` = 価格未設定（compact=0 の場合のみ）\n- `has_price=false` の場合、`tanka`、`tani` はともに `null` になります\n- ページネーション: シリーズに多数の品番がある場合は`page`/`limit`を使用してください\n\n戻り値（compact=1、デフォルト）: { ok, items: [{ item_item_no, tanka, tani, has_price }], total, page, limit, max_page, page_size }.\nR戻り値 (compact=0): { ok, items: [{ item_item_no, series_item_no, m_lang_id, tanka, tani, output_jpn, output_eng, output_cn, has_price, source, price_add_datetime, price_upd_datetime }], total, page, limit, max_page, page_size }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. 必須です。"),
      item_item_no: z.string().optional().describe("Filter 品番 (ILIKE partial, case-insensitive). 未指定 = すべて"),
      del_flg: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("0=active（デフォルト）、1=deleted、2=廃番。未指定= active のみ（del_flg=0）"),
      compact: z.union([z.literal(0), z.literal(1)]).optional().describe("1=compact (default) — item_item_no、tanka、tani、has_price のみ返却し、トークンを約5x削減します。0=full の場合は、series_item_no、m_lang_id、output_jpn/eng/cn、source、price_add_datetime、price_upd_datetime を追加で返却します。"),
      page: z.number().int().min(1).optional().describe("ページ番号です。デフォルトは 1 です。"),
      limit: z.number().int().min(1).optional().describe("レコード／ページの件数です。デフォルトは 50 件です。"),
    },
    handler: async (client, args) => json(await client.get_item_price_by_list(args)),
  },

  // ===== /api/getapprovedseries — 日付範囲＋Missing-Lang（言語不足）フィルターで承認済みのシリーズ =====
  {
    name: "get_approved_series",
    description: "事前に `login` が必要です。⭐ 指定した期間内の `approval_status=4`（MK確認済み ― 最終承認済み）のシリーズを返します。また、他言語にデータ不足があるシリーズを絞り込むオプションも付きます（利用ケース: 「日本語は承認済みだが英語データが存在しない」）。\n\n使用する場合:\n- '先月に日本語で承認済みだが英語データが未登録のシリーズ' → パラメータ未指定（デフォルト: 先月、日本語、英語不足）\n- '昨日承認されたシリーズ' → `date_from='YYYY-MM-DD'` + `date_to='YYYY-MM-DD'`（同日指定）\n- '2025年4月に承認されたシリーズ' → `year_month='202504'`（省略指定）\n- '2025年3月に日本語で承認されたシリーズで、英語データがあるかどうかも含めて確認したい' → `year_month='202503'` + `filter_missing_lang=0`\n- '今週英語で承認され、中国語データが未登録のシリーズ' → `m_lang_id=2` + `missing_lang_id=3` + 日付範囲指定\n\n使用しない場合:\n- ステータスで絞り込まずにシリーズ一覧を取得したい場合（get_series_info を使用）\n- 特定のシリーズの承認ステータスを確認したい場合（get_series_status を使用）\n\n注意事項:\n- デフォルトは「先月・日本語承認済み・英語不足で絞り込み」です\n- `year_month` の優先度は低く、date_from/date_to が指定されていない場合のみ使用されます\n- `filter_missing_lang=1`（デフォルト）= missing_lang_id のデータが不足しているシリーズのみ返します。`=0` = 指定期間内の承認済みシリーズをすべて返します\n- approval_status=4 は MK確認済み（最終承認済み）を意味し、PM承認ではありません\n\n戻り値: { ok, シリーズ: [...] } — 条件に一致する承認済みシリーズの一覧。",
    schema: {
      date_from: z.string().optional().describe("Date format YYYY-MM-DD, inclusive. Default: first day of previous month."),
      date_to: z.string().optional().describe("Date format YYYY-MM-DD, inclusive. Default: last day of previous month."),
      year_month: z.string().optional().describe("YYYYMM 形式です。月全体を指定するための省略指定（後方互換性対応）です。date_from/date_to より優先度は低くなります。"),
      m_lang_id: z.number().int().optional().describe("承認済みの言語です（1=日本語［デフォルト］、2=英語、3=中国語）。"),
      filter_missing_lang: z.union([z.literal(0), z.literal(1)]).optional().describe("1=missing_lang_id が不足しているシリーズのみ（デフォルト）、0=承認済みのすべてのシリーズ。"),
      missing_lang_id: z.number().int().optional().describe("不足データを確認する対象言語です（デフォルトは 2=英語）。filter_missing_lang=1 の場合のみ使用されます。"),
    },
    handler: async (client, args) => json(await client.get_approved_series(args)),
  },

];

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

export function registerTools(server, client) {
  for (const t of TOOLS) {
    server.tool(t.name, t.description, t.schema, (args) => t.handler(client, args));
  }
}
