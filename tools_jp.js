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
    description: "Requires prior `login`. Lấy thông tin category từ bảng `t_ctg_head`. Hỗ trợ filter theo PK, ctg_id (exact/LIKE), hoặc ctg_name (JOIN t_ctg_lang).\n\nWHEN TO USE:\n- 'category đúng A01' → `ctg_id='A01'` (default exact)\n- 'category chứa A trong code' → `ctg_id='A'` + `ctg_id_like=1`\n- 'category t_ctg_head_id=42' → `t_ctg_head_id=42`\n- 'category tên đúng カタログ商品' → `ctg_name='カタログ商品'` + `m_lang_id=1` (default exact)\n- 'category tên chứa カタログ' → `ctg_name='カタログ'` + `ctg_name_like=1` + `m_lang_id=1`\n\nDO NOT USE: Khi user cần TẤT CẢ tên đa ngôn ngữ của 1 category (dùng get_category_lang), hoặc tree hierarchy (dùng get_category_tree).\n\nNOTES: Khi truyền `ctg_name` hoặc `m_lang_id`, response có thêm 2 field `ctg_name` + `m_lang_id` (từ JOIN t_ctg_lang). Default mọi *_like = 0 (exact). Nếu exact return rỗng → tự retry với *_like=1 (xem instructions).\n\nRETURNS: { ok, categories: [{ t_ctg_head_id, ctg_id, ctg_name?, m_lang_id? }], page, max_page, limit, total, page_size }.",
    schema: {
      t_ctg_head_id: z.number().int().optional().describe("PK của t_ctg_head, exact match."),
      ctg_id: z.string().optional().describe("Mã category (vd: 'A01'). Mặc định exact, dùng ctg_id_like=1 để LIKE."),
      ctg_id_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %ctg_id%. Truyền 1 explicitly để LIKE match."),
      ctg_name: z.string().optional().describe("Tên category (JOIN t_ctg_lang). Default exact. Truyền ctg_name_like=1 để LIKE."),
      ctg_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %ctg_name%. Truyền 1 explicitly để LIKE match."),
      m_lang_id: z.number().int().optional().describe("Lọc theo ngôn ngữ khi dùng ctg_name (1=JP, 2=EN, 3=CN)."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_category_info(args)),
  },

  // ===== SPEC #2: /api/getctglang — t_ctg_lang =====
  {
    name: "get_category_lang",
    description: "Requires prior `login`. Lấy tên category đa ngôn ngữ từ bảng `t_ctg_lang`. Hỗ trợ filter theo PK, head_id, lang_id, ctg_name (LIKE/exact), hoặc ctg_id (JOIN t_ctg_head).\n\nWHEN TO USE:\n- 'tên JP/EN/CN của category t_ctg_head_id=10' → `t_ctg_head_id=10` + `m_lang_id=1/2/3`\n- 'tên category 10 cả 3 ngôn ngữ' → `t_ctg_head_id=10`\n- 'category tên chứa カタログ' → `ctg_name='カタログ'`\n- 'tên category mã A01' → `ctg_id='A01'`\n\nDO NOT USE: Khi chỉ cần `ctg_id` (dùng get_category_info), hoặc cần tree (dùng get_category_tree).\n\nNOTES: Khi truyền `ctg_id`, response có thêm field `ctg_id` (JOIN t_ctg_head).\n\nRETURNS: { ok, ctg_langs: [{ t_ctg_lang_id, t_ctg_head_id, m_lang_id, ctg_name, ctg_id? }], page, max_page, total }.",
    schema: {
      t_ctg_lang_id: z.number().int().optional().describe("PK của t_ctg_lang, exact match."),
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head."),
      m_lang_id: z.number().int().optional().describe("Ngôn ngữ: 1=JP, 2=EN, 3=CN. Bỏ qua = trả cả 3."),
      ctg_name: z.string().optional().describe("Tên category. Default exact. Truyền ctg_name_like=1 để LIKE."),
      ctg_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %ctg_name%. Truyền 1 explicitly để LIKE match."),
      ctg_id: z.string().optional().describe("Mã category (JOIN t_ctg_head)."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_category_lang(args)),
  },

  // ===== SPEC #3: /api/getctgsections — t_ctg_section =====
  {
    name: "get_category_sections",
    description: "Requires prior `login`. Lấy danh sách section của category từ bảng `t_ctg_section`. Hỗ trợ filter theo PK, head_id, flags, type shortcut, section_name (LIKE/exact), hoặc section_code (= db_column của m_section, JOIN tự động).\n\nWHEN TO USE:\n- 'sections của category 10' → `t_ctg_head_id=10`\n- 'basic section của 10' → `t_ctg_head_id=10` + `section_type='basic'`\n- 'common section của 10' → `section_type='common'`\n- 'custom section của 10' → `section_type='custom'`\n- 'section tên 価格' → `section_name='価格'`\n- 'section có db_column=price' → `section_code='price'`\n\nDO NOT USE: Khi user cần tên section đa ngôn ngữ (dùng get_section_translations), hoặc data_share_flg (dùng get_data_share_flags).\n\n⚠️ NOTES (section_type mapping ĐÃ ĐỔI theo spec mới):\n- `basic` = base_flg = 1\n- `common` = base_flg = 2  (KHÔNG còn dùng m_section_id IS NOT NULL)\n- `custom` = base_flg <> 1 AND base_flg <> 2\n→ section_type override base_flg khi cùng truyền.\n\nRETURNS: { ok, sections: [{ t_ctg_section_id, t_ctg_head_id, m_section_id, data_kbn, section_name, raw_section_name, section_kbn, base_flg, require_flg, relation_flg, reference_flg, m_common_spec_id, help_img_flg, multi_flg, enable_flg, disp_seq_eff, tot_child, tot_par, row_child }], page, max_page, limit, total, page_size }.",
    schema: {
      t_ctg_section_id: z.number().int().optional().describe("PK của t_ctg_section, exact match."),
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head."),
      enable_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("1=enabled, 0=disabled."),
      base_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("1=base section, 0=custom/common."),
      section_type: z.enum(["basic", "common", "custom"]).optional().describe("Shortcut filter, override base_flg."),
      section_name: z.string().optional().describe("Tên section. Default exact. Truyền section_name_like=1 để LIKE."),
      section_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_name%. Truyền 1 explicitly để LIKE match."),
      section_code: z.string().optional().describe("`db_column` của m_section (JOIN). Mặc định exact."),
      section_code_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_code%. Truyền 1 explicitly để LIKE match."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_category_sections(args)),
  },

  // ===== SPEC #5: /api/getctgdatashare — t_ctg_data_share_init =====
  {
    name: "get_data_share_flags",
    description: "Requires prior `login`. Lấy cờ `data_share_flg` của section theo từng ngôn ngữ (init value khi tạo data mới) từ bảng `t_ctg_data_share_init`.\n\nWHEN TO USE:\n- 'data share flag của category 10' → `t_ctg_head_id=10` (JOIN t_ctg_section)\n- 'data share flag của section 55' → `t_ctg_section_id=55`\n\nDO NOT USE: Khi cần section info tổng quát (dùng get_category_sections).\n\nRETURNS: { ok, data_share: [{ t_ctg_data_share_init_id, t_ctg_section_id, m_lang_id, data_share_flg }], page, max_page, total }.",
    schema: {
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head (JOIN t_ctg_section)."),
      t_ctg_section_id: z.number().int().optional().describe("FK → t_ctg_section."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_data_share_flags(args)),
  },

  // ===== SPEC #8: /api/getsectiontrans — t_section_trans =====
  {
    name: "get_section_translations",
    description: "Requires prior `login`. Lấy bản dịch tên section từ bảng `t_section_trans`. Hỗ trợ filter theo PK, t_ctg_section_id, m_section_id, m_lang_id, section_name (LIKE/exact), section_code (=db_column, JOIN m_section).\n\nWHEN TO USE:\n- 'tên section 55 bằng EN' → `t_ctg_section_id=55` + `m_lang_id=2`\n- 'tên section 55 cả 3 ngôn ngữ' → `t_ctg_section_id=55`\n- 'master section X tên EN' → `m_section_id=X` + `m_lang_id=2`\n- 'bản dịch tên chứa Price' → `section_name='Price'` + `m_lang_id=2`\n- 'bản dịch theo db_column=price' → `section_code='price'`\n\nDO NOT USE: Khi cần flags/structure của section (dùng get_category_sections).\n\nNOTES: Section đã override bởi category → filter `t_ctg_section_id`. Master section chưa override → filter `m_section_id`.\n\nRETURNS: { ok, section_trans: [{ t_section_trans_id, t_ctg_section_id, m_section_id, m_lang_id, section_name }], page, max_page, total }.",
    schema: {
      t_section_trans_id: z.number().int().optional().describe("PK của t_section_trans, exact match."),
      t_ctg_section_id: z.number().int().optional().describe("FK → t_ctg_section (section đã override)."),
      m_section_id: z.number().int().optional().describe("FK → m_section (master section chưa override)."),
      m_lang_id: z.number().int().optional().describe("Ngôn ngữ: 1=JP, 2=EN, 3=CN. Bỏ qua = trả cả 3."),
      section_name: z.string().optional().describe("Tên đã dịch. Default exact. Truyền section_name_like=1 để LIKE."),
      section_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_name%. Truyền 1 explicitly để LIKE match."),
      section_code: z.string().optional().describe("`db_column` của m_section (JOIN). Mặc định exact."),
      section_code_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %section_code%. Truyền 1 explicitly để LIKE match."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_section_translations(args)),
  },

  // ===== SPEC #9: /api/getseriesinfo — t_series_head =====
  {
    name: "get_series_info",
    description: "Requires prior `login`. Lấy thông tin series từ bảng `t_series_head`. Hỗ trợ filter theo PK, series_id (exact/LIKE), t_ctg_head_id, series_name (JOIN t_series_lang).\n\nWHEN TO USE:\n- 'series trong category 10' → `t_ctg_head_id=10`\n- 'series mã SER001' → `series_id='SER001'`\n- 'series bắt đầu/chứa SER' → `series_id='SER'` + `series_id_like=1`\n- 'series tên chứa カタログ tiếng Nhật' → `series_name='カタログ'` + `m_lang_id=1`\n- 'series t_series_head_id=99' → `t_series_head_id=99`\n\nDO NOT USE: Khi user hỏi info category (dùng get_category_info).\n\nNOTES: Khi truyền `series_name` hoặc `m_lang_id`, response có thêm `series_name` + `m_lang_id` (JOIN t_series_lang).\n\nRETURNS: { ok, series: [{ t_series_head_id, series_id, t_ctg_head_id, series_name?, m_lang_id? }], page, max_page, total }.",
    schema: {
      t_series_head_id: z.number().int().optional().describe("PK của t_series_head, exact match."),
      series_id: z.string().optional().describe("Mã series. Mặc định exact."),
      series_id_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %series_id%. Truyền 1 explicitly để LIKE match."),
      t_ctg_head_id: z.number().int().optional().describe("FK → t_ctg_head (category cha)."),
      series_name: z.string().optional().describe("Tên series (JOIN t_series_lang). Default exact. Truyền series_name_like=1 để LIKE."),
      series_name_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=LIKE %series_name%. Truyền 1 explicitly để LIKE match."),
      m_lang_id: z.number().int().optional().describe("Ngôn ngữ khi dùng series_name (1=JP, 2=EN, 3=CN)."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_series_info(args)),
  },

  // ==========================================================================
  // ===== ITEMINFO endpoints (from api-iteminfo.md) ==========================
  // ==========================================================================

  // ===== /api/getlanglist — m_lang =====
  {
    name: "get_lang_list",
    description: "Requires prior `login`. Lấy danh sách ngôn ngữ active trong hệ thống.\n\nWHEN TO USE:\n- 'có những ngôn ngữ nào trong hệ thống'\n- 'list lang active'\n- Khi cần map m_lang_id → tên ngôn ngữ\n\nRETURNS: { ok, langs: [{ m_lang_id, lang_kbn, lang_name, disp_seq }], page, max_page, limit, total, page_size }. Vd: [{1,'ja','日本語',1},...].",
    schema: {},
    handler: async (client) => json(await client.get_lang_list()),
  },

  // ===== /api/getseriesstatus — ⭐ CORE: full status cho tab シリーズ状況 =====
  {
    name: "get_series_status",
    description: "Requires prior `login`. ⭐ CORE API cho màn iteminfo. Lấy TOÀN BỘ trạng thái + metadata của 1 series trong 1 call. Dùng cho tab シリーズ状況.\n\nWHEN TO USE:\n- 'thông tin chi tiết series LDM-W' (đã có t_series_head_id)\n- 'approval_status / translate_status của series'\n- 'series lock chưa' → xem top-level `is_locked`\n- 'số 品番 trong series' → xem `item_no_use_del.count_use`\n- 'có comment unlock không' → xem `approval_comment`\n- 'kyoyu/syuyaku/relation/info của series' → xem các `*_list` top-level\n- 'cad_url_kbn / no_reflect_price_flg' → xem trong `series_info`\n\nDO NOT USE: Khi chỉ cần PK lookup (dùng get_series_info) hoặc list version (dùng get_series_version_list).\n\n⚠️ RESPONSE STRUCTURE (đã restructure):\n- Hầu hết core fields nằm trong `series_info` (KHÔNG phải flat top-level).\n- `approval_users` (kbn_0=校正, kbn_1=承認) thay cho `series_approval_rows` cũ.\n- `is_locked` + `locked_sections` ở TOP-LEVEL (không phải trong series_info).\n- `t_item_price.item_count` là STRING dạng 'N 件' (không phải int).\n- Trong `relation_list/info_list/kyoyu_list/syuyaku_list`: field `series_name` thực ra là `series_id` code (không phải tên JP).\n- `info_list` có thêm `relation_ship: 1`. `kyoyu_list` có thêm `link_t_series_lang_id, t_ctg_head_id`. `syuyaku_list` có thêm `t_series_lang_id`.\n- `series_info.approval_status_other_lang`: CSV 'lang_id_approval_status,...' cho ngôn ngữ khác.\n- `series_info.key_lang_flg=1`: ngôn ngữ gốc (JP), translate_status_name trả '-'.\n\napproval_status: 0=未承認, 1=修正中, 2=PM承認中, 3=PM承認済, 4=MK確認済, 5=予約反映済.\ntranslate_status: 1=不要, 2=未, 3=中, 4=済, 5=先行.\n\nRETURNS: { ok, series_info: { t_series_head_id, t_ctg_head_id, series_id, series_name, data_kbn, syuyaku_flg, kyoyu_flg, cad_url_kbn, no_reflect_price_flg, t_series_lang_id, m_lang_id, lang_name, stop_flg, key_lang_flg, memo, upd_datetime, add_datetime, add_user_name, upd_user_name, t_series_ver_id, major_ver, minor_ver, approval_status, approval_status_name, translate_status, translate_status_name, translate_base_*, t_series_mei_id, kou_no, kou_no_name, typeset_ver, typeset_ver_lookup, tb_lang_name, is_ctg_user, cnt_header, approval_status_other_lang, object_storage_flg }, is_locked, locked_sections: [{ t_ctg_section_id, add_user_id, t_export_history_id, add_datetime }], approval_users: { kbn_0: [], kbn_1: [{ approval_status, approval_user_kbn, approval_user_id, user_name, approval_status_name }] }, approval_comment: { main_comment, free_comment, t_approval_comment_id }, item_no_use_del: { count_use, count_del }, t_item_price: { item_count: 'N 件', create_date }, relation_list, info_list, kyoyu_list, syuyaku_list }.",
    schema: {
      t_series_head_id: z.number().int().describe("PK series head. Bắt buộc."),
      m_lang_id: z.number().int().describe("Ngôn ngữ (1=JP, 2=EN, 3=CN). Bắt buộc."),
    },
    handler: async (client, args) => json(await client.get_series_status(args)),
  },

  // ===== /api/getseriesversionlist — lịch sử kou_no =====
  {
    name: "get_series_version_list",
    description: "Requires prior `login`. Lấy lịch sử TẤT CẢ phiên bản (kou_no) của 1 series. Dùng render dropdown chọn version.\n\nWHEN TO USE:\n- 'các version của series 101'\n- 'lịch sử revision'\n- 'tất cả version ở mọi ngôn ngữ' → bỏ qua m_lang_id\n- 'version chỉ JP' → m_lang_id=1\n\nDO NOT USE: Khi chỉ cần version hiện tại (đã nằm trong get_series_status).\n\nNOTES:\n- `m_lang_id` OPTIONAL — bỏ qua = lấy tất cả ngôn ngữ\n- Mỗi kou_no = 1 revision trong cùng major version\n- t_series_mei_id dùng làm input cho get_series_data\n- kou_no_name mapping: 0='-', 1='初校', 2='再校', 999='校了', N='N校'\n- Sort: m_lang_id ASC, major_ver DESC, minor_ver DESC, kou_no DESC\n\nRETURNS: { ok, versions: [{ t_series_mei_id, t_series_ver_id, series_name, major_ver, minor_ver, kou_no, kou_no_name, approval_status, m_lang_id, upd_datetime }], page, max_page, limit, total, page_size }.",
    schema: {
      t_series_head_id: z.number().int().describe("PK series head. Bắt buộc."),
      m_lang_id: z.number().int().optional().describe("Ngôn ngữ (1=JP, 2=EN, 3=CN). Optional — bỏ qua = tất cả."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_series_version_list(args)),
  },

  // ===== /api/getlockinfo — exclusive edit lock =====
  {
    name: "get_lock_info",
    description: "Requires prior `login`. Kiểm tra series hoặc từng section có đang bị lock (exclusive edit) hay không.\n\nWHEN TO USE:\n- 'series 101 lock chưa'\n- 'section nào đang bị lock'\n- 'ai đang edit series'\n\nNOTES: Lock tồn tại khi đang export → unlock tự động sau khi export hoàn tất. `is_locked=true` khi có record trong t_series_exclusive với `t_ctg_section_id` NULL.\n\nRETURNS: { ok, series_locked: bool, locked_sections: [{ t_ctg_section_id, add_user_id, t_export_history_id, add_datetime }] }.",
    schema: {
      t_series_head_id: z.number().int().describe("PK series head. Bắt buộc."),
      m_lang_id: z.number().int().describe("Ngôn ngữ. Bắt buộc."),
    },
    handler: async (client, args) => json(await client.get_lock_info(args)),
  },

  // ===== /api/getseriesdata — ⭐ CORE: nội dung sections của revision =====
  {
    name: "get_series_data",
    description: "Requires prior `login`. ⭐ CORE API cho iteminfo. Lấy NỘI DUNG đầy đủ TẤT CẢ section của 1 series revision. Phục vụ tab 基本項目 / 共通項目 / フリー項目.\n\nWHEN TO USE:\n- 'nội dung sections của revision 401'\n- 'data của tab 基本項目' → `data_kbn=1` (base_flg=1)\n- 'data của tab 共通項目' → `data_kbn=2` (base_flg=2)\n- 'data của tab フリー項目' → `data_kbn=3` (đọc từ t_section, free_section_flg=1)\n- 'tất cả tab' → bỏ qua `data_kbn` (sections theo loại series)\n\nDO NOT USE:\n- Cần template section (chưa có data) → dùng get_category_sections\n- Cần cad_url_kbn / no_reflect_price_flg → ở get_series_status (KHÔNG ở đây)\n- Cần comment list → ⚠️ KHÔNG có trong response, đó là feature web AJAX riêng\n\n⚠️ NOTES quan trọng:\n- Array key là `section_data` (KHÔNG phải `data`)\n- t_ctg_section_id là TEXT (không int)\n- data_id là business key từ sequence xml_data_tag_id_seq (TEXT)\n- KHÔNG có: comment_list, help_t_ctg_section_id, open_flg, checkdis, list_media (chỉ ở web AJAX)\n- Khi `data_kbn=3`: đọc từ `t_section`, response có thêm field `t_section_id`\n- Section chưa có data → `section_data: []`\n- Section sort theo `section_disp_seq`, item theo `data_disp_seq`\n\nsection_kbn: 1=text, 2=image, 3=excel, 4=textarea, 5=checkbox, 6=header_excel, 99=mix.\n\nRETURNS: { ok, sections: [{ t_ctg_section_id, section_name, disp_section_name, section_kbn, base_flg, require_flg, relation_flg, multi_flg, m_common_spec_id, free_section_flg, section_disp_seq, pre, suf, t_section_id, section_data: [{ t_section_data_id, data_id, text_data, filename, org_filename, header_filename, org_header_filename, title, alt, note, unit, link_url, target, table_type, table_page, data_disp_seq, mei_share, fixedrowheight, data_add_datetime }] }], total_sections, total, page, max_page, limit, page_size }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision (lấy từ get_series_status hoặc get_series_version_list). Bắt buộc."),
      t_ctg_head_id: z.number().int().describe("PK category. Bắt buộc."),
      m_lang_id: z.number().int().describe("Ngôn ngữ. Bắt buộc."),
      data_kbn: z.number().int().optional().describe("Filter tab: 1=基本項目 (base_flg=1), 2=共通項目 (base_flg=2), 3=フリー項目 (free_section_flg=1, từ t_section). Bỏ qua = sections theo loại series."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số section/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_series_data(args)),
  },

  // ===== /api/getiteminfolist — danh sách 品番 =====
  {
    name: "get_item_info_list",
    description: "Requires prior `login`. Lấy danh sách 品番 (mã sản phẩm) thuộc 1 series revision, KÈM SPEC values (mỗi 品番 có thể có nhiều spec column).\n\nWHEN TO USE:\n- 'danh sách 品番 của revision 401' → `t_series_mei_id=401`\n- '品番 active' → `del_flg=0`\n- '品番 đã xoá' → `del_flg=1`\n- 'tìm 品番 chứa LDM-W' → `item_item_no='ldm-w'` (ILIKE partial)\n- 'chỉ lấy spec D1, D2, 最高回転数' → `spec_names='D1,D2,最高回転数'` (BẮT BUỘC dùng để tránh token bloat)\n\n⚠️ TOKEN LIMIT WARNING:\n- 1 series có thể có 50-100+ spec columns. Mặc định trả HẾT → response cực lớn → có thể vượt token limit của AI.\n- BẮT BUỘC dùng `spec_names` khi:\n  - Series có nhiều spec (> 10 column)\n  - User chỉ hỏi 1-vài spec cụ thể (vd 'D1 của 品番 này là gì')\n  - Không chắc → ưu tiên truyền spec_names để safe\n- Chỉ KHÔNG cần spec_names khi user yêu cầu RÕ 'tất cả spec' / 'full data'\n\nNOTES:\n- `spec_names` = comma-separated label names (ILIKE match với `m_item_header.spec_value`)\n- Vd: `spec_names='D1,D2'` → chỉ trả 2 column spec đó\n- `spec_names='最高'` → ILIKE match → trả mọi spec có '最高' trong tên\n- t_series_mei_id resolve ra `series_item_no` và `m_lang_id` tự động\n- KHÔNG có thông tin giá — dùng `get_item_info_detail` để lấy giá\n\nRETURNS: { ok, items: [{ t_item_info_id, series_item_no, catalog_item_no, item_item_no, i7_item_no, cadenas_item_no, del_flg, m_lang_id, specs: {...} }], count_use, count_del, total, page, max_page, limit, page_size }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. Bắt buộc."),
      item_item_no: z.string().optional().describe("Filter 品番 (ILIKE). Default partial '%value%'; truyền exact=1 để exact match (case-insensitive)."),
      del_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("0=active, 1=deleted. Bỏ qua = tất cả."),
      spec_names: z.string().optional().describe("⚠️ Comma-separated spec label names (ILIKE match m_item_header.spec_value). Vd: 'D1,D2,最高回転数'. Bắt buộc dùng khi không cần toàn bộ spec để tránh token bloat. Bỏ qua = trả TẤT CẢ spec (có thể rất lớn!). Match mode xem `exact`. Khi đã biết spec_id → dùng spec_ids thay vì param này."),
      spec_ids: z.string().optional().describe("⚠️ Comma-separated spec_id values (vd: 'spec0002,spec0025'). Dùng khi đã biết spec_id từ get_item_header — nhanh hơn và chính xác hơn spec_names. Kết hợp với spec_names = union (OR). spec_id không hợp lệ (không phải spec\\d+) bỏ qua tự động."),
      col_values: z.string().optional().describe("🎯 Filter ROWS theo giá trị thực tế trong spec cell. Format: comma-separated 'specXXXX:value' pairs (vd: 'spec0092:M5' hoặc 'spec0092:M5,spec0094:正目'). AND logic — tất cả điều kiện phải khớp. Match mode theo `exact` (0=partial, 1=exact). spec_id không hợp lệ bỏ qua."),
      exact: z.union([z.literal(0), z.literal(1)]).optional().describe("Áp dụng cho cả item_item_no, spec_names và col_values. 0=partial ILIKE '%value%' (default), 1=exact ILIKE 'value' (case-insensitive, không wildcard)."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_item_info_list(args)),
  },

  // ===== /api/getiteminfospeclistbyctg — 品番 + spec theo category =====
  {
    name: "get_item_info_spec_list_by_ctg",
    description: "Requires prior `login`. Lấy items với spec values (wide format) của TẤT CẢ series trong 1 category. Tương tự get_item_info_list nhưng filter theo t_ctg_head_id thay vì t_series_mei_id → trả items từ nhiều series.\n\n⚠️ TOKEN LIMIT WARNING (QUAN TRỌNG HƠN get_item_info_list):\n- 1 category có thể có 100+ series × 1000+ items × 500+ spec columns → response có thể cực lớn.\n- BẮT BUỘC dùng `spec_names` trong hầu hết trường hợp.\n- LUÔN dùng `spec_names` trừ khi user yêu cầu rõ 'tất cả spec'.\n- KHÔNG dùng limit > 100 khi scan items. Mặc định limit=50.\n\n⚠️ SPEC VALUE FILTER — API KHÔNG hỗ trợ filter theo giá trị spec:\n- Không thể nói 'chỉ lấy items có spec0002=M5'. API trả TẤT CẢ items, bạn phải lọc trong code.\n- Workflow đúng: 1) get_item_header tìm label đúng → 2) gọi API này với spec_names + limit=50 → 3) lọc items theo giá trị spec trong response.\n- Nếu page 1 không có giá trị cần tìm → paginate (page=2, 3...) hoặc thử spec column khác.\n\nWHEN TO USE:\n- 'tất cả 品番 trong category X với spec D1, D2' → t_ctg_head_id=X + spec_names='D1,D2'\n- 'tìm 品番 LDM-W-10 trong category Y' → t_ctg_head_id=Y + item_item_no='LDM-W-10'\n- 'so sánh spec D1 giữa các series trong category X' → t_ctg_head_id=X + spec_names='D1'\n\nDO NOT USE:\n- Khi đã biết t_series_mei_id → dùng get_item_info_list (nhanh hơn, ít data hơn).\n- Khi cần search global không biết category → dùng get_item_info_search.\n- Khi không truyền spec_names và category có nhiều series → có thể timeout/overflow token.\n- Khi chưa biết đúng spec column → dùng get_item_header TRƯỚC.\n\nNOTES:\n- m_lang_id BẮT BUỘC (không auto-resolve từ t_ctg_head_id).\n- series_item_no trong mỗi item = series code (vd 'LDM-W') → biết item thuộc series nào.\n- headers: spec_id → label map — dùng để render columns.\n- Kết quả ORDER BY series_item_no, item_item_no.\n\nRETURNS: { ok, headers: { spec_id: label }, items: [{ t_item_info_id, series_item_no, catalog_item_no, item_item_no, i7_item_no, cadenas_item_no, del_flg, shitsuryo, item_sort, add_datetime, upd_datetime, spec0XXX: '...' }], total, page, limit, max_page, page_size }.",
    schema: {
      t_ctg_head_id: z.number().int().describe("ID category (t_ctg_head_id). Bắt buộc."),
      m_lang_id: z.number().int().describe("Ngôn ngữ: 1=JP, 2=EN, 3=CN. Bắt buộc."),
      item_item_no: z.string().optional().describe("Filter 品番 (ILIKE). Default partial '%value%'; truyền exact=1 để exact match (case-insensitive)."),
      del_flg: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("0=active (default), 1=deleted, 2=discontinued."),
      spec_names: z.string().optional().describe("⚠️ Comma-separated spec label names. LUÔN dùng để tránh token bloat. Bỏ qua = trả TẤT CẢ spec (rất nguy hiểm với category lớn!). Match mode xem `exact`. Khi đã biết spec_id → dùng spec_ids thay vì param này (nhanh hơn, chính xác hơn)."),
      spec_ids: z.string().optional().describe("⚠️ Comma-separated spec_id values (vd: 'spec0002,spec0025'). Dùng khi đã biết spec_id từ get_item_header — nhanh hơn và chính xác hơn spec_names. Kết hợp với spec_names = union (OR). spec_id không hợp lệ (không phải spec\\d+) bỏ qua tự động."),
      col_values: z.string().optional().describe("🎯 Filter ROWS theo giá trị thực tế trong spec cell. Format: comma-separated 'specXXXX:value' pairs (vd: 'spec0092:M5' hoặc 'spec0092:M5,spec0094:正目'). AND logic — tất cả điều kiện phải khớp. Match mode theo `exact` (0=partial, 1=exact). spec_id không hợp lệ bỏ qua. WORKFLOW: get_item_header(spec_value='M5') → biết spec0092 → dùng spec_ids='spec0092'&col_values='spec0092:M5' để filter chính xác."),
      exact: z.union([z.literal(0), z.literal(1)]).optional().describe("Áp dụng cho cả item_item_no, spec_names và col_values. 0=partial ILIKE '%value%' (default), 1=exact ILIKE 'value' (case-insensitive, không wildcard). Vd: exact=1 + col_values='spec0092:M5' chỉ lấy rows có spec0092='M5' chính xác."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_item_info_spec_list_by_ctg(args)),
  },

  // ===== /api/getitemheader — tra cứu spec_id ↔ spec_value (m_item_header) =====
  {
    name: "get_item_header",
    description: "Requires prior `login`. Tra cứu bảng `m_item_header` — mapping spec_id ↔ spec_value (nhãn cột spec). Dùng khi cần biết spec_id của 1 tên spec, hoặc ngược lại.\n\n⭐ PHẢI GỌI TOOL NÀY TRƯỚC khi gọi get_item_info_list / get_item_info_spec_list_by_ctg với spec_names — để tìm đúng tên cột, tránh gọi sai và nhận response trống hoặc response khổng lồ.\n\nWHEN TO USE:\n- 'spec_id của ねじの呼び là gì' → `spec_value='ねじの呼び'` + `spec_value_like=1` + `m_lang_id=1`\n- 'nhãn của spec0002 là gì' → `spec_id='spec0002'` + `m_lang_id=1`\n- 'tất cả spec chứa D trong tên' → `spec_value='D'` + `spec_value_like=1` + `m_lang_id=2`\n- 'spec nào bắt đầu bằng spec00' → `spec_id='spec00'` + `spec_id_like=1`\n- 'tìm spec column phù hợp trước khi query items' → tìm bằng keyword rộng (vd: 'ねじ', '呼び', 'L')\n\nDO NOT USE:\n- Khi cần giá trị spec của từng 品番 → dùng get_item_info_list hoặc get_item_info_spec_list_by_ctg.\n\nRECOMMENDED WORKFLOW (khi tìm 品番 theo giá trị spec, vd: tìm item có M5):\n1. get_item_header(spec_value='M5', spec_value_like=1, m_lang_id=1) → lấy danh sách spec_id + spec_value chứa 'M5'\n   Nếu rỗng → thử keyword rộng hơn: 'ねじ', '呼び', 'Nominal'\n   Có thể nhiều cột ứng viên (vd: spec0002='ねじの呼び', spec0187='ねじ', spec0276='呼び') → liệt kê tất cả cho user xác nhận\n2. get_item_info_spec_list_by_ctg(spec_names='<label từ bước 1>', exact=1, limit=50) → fetch items\n   KHÔNG dùng limit > 100 khi scan\n3. Lọc items trong response theo giá trị spec muốn tìm (vd: spec0002 == 'M5')\n   Nếu không có kết quả ở page 1 → thử page 2, 3... hoặc thử spec column khác\n\nNOTES:\n- `spec_value_like=1` dùng ILIKE `%value%` → nên dùng khi tìm theo keyword (vd: 'ねじ')\n- `spec_value_like=0` (default) dùng ILIKE exact → match đúng toàn bộ nhãn\n- `spec_id_like=1` dùng ILIKE `%spec_id%` → tìm theo prefix/suffix cột\n- Bỏ qua `m_lang_id` → trả cả 3 ngôn ngữ (JP+EN+CN)\n- Kết quả ORDER BY m_lang_id, spec_id\n\nRETURNS: { ok, headers: [{ m_item_header_id, spec_id, spec_value, m_lang_id }], total, page, limit, max_page, page_size }.",
    schema: {
      spec_id: z.string().optional().describe("Filter theo spec_id (vd: 'spec0002'). Mặc định exact ILIKE. Truyền spec_id_like=1 để partial."),
      spec_id_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=ILIKE %spec_id%."),
      spec_value: z.string().optional().describe("Filter theo nhãn spec (vd: 'ねじの呼び', 'D1'). Mặc định exact ILIKE. Truyền spec_value_like=1 để partial."),
      spec_value_like: z.union([z.literal(0), z.literal(1)]).optional().describe("0=exact (default), 1=ILIKE %spec_value%. Nên dùng khi tìm theo keyword."),
      m_lang_id: z.number().int().optional().describe("Ngôn ngữ: 1=JP, 2=EN, 3=CN. Bỏ qua = trả cả 3."),
      del_flg: z.union([z.literal(0), z.literal(1)]).optional().describe("0=active (default), 1=deleted."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_item_header(args)),
  },

  // ===== /api/getiteminfodetail — chi tiết 1 品番 + giá =====
  {
    name: "get_item_info_detail",
    description: "Requires prior `login`. Thông tin đầy đủ của 1 品番 kèm giá (tanka, tani) từ JOIN t_item_info_price.\n\nWHEN TO USE:\n- 'chi tiết 品番 LDM-W-10'\n- 'giá của 品番 X'\n- 'flag output JP/EN/CN của 品番'\n\nNOTES:\n- `item_item_no` EXACT match\n- `t_series_mei_id` resolve `m_lang_id` tự động (nếu cùng truyền cả m_lang_id, ưu tiên series_mei_id)\n- `price` là `null` nếu không tìm thấy record trong t_item_info_price\n- KHÔNG có: tanka_en, tani_en, shitsuryo, slide_price, cad_url (đã loại khỏi spec)\n- Flag output_jpn/eng/cn nằm trong `price` object (không phải top-level item)\n\nRETURNS: { ok, item: { t_item_info_id, series_item_no, catalog_item_no, item_item_no, i7_item_no, cadenas_item_no, del_flg, m_lang_id, add_datetime, upd_datetime, price: { t_item_info_price_id, tanka, tani, output_jpn, output_eng, output_cn, add_datetime, upd_datetime } | null } }.",
    schema: {
      item_item_no: z.string().describe("Mã 品番 EXACT (vd: 'LDM-W-10'). Bắt buộc."),
      t_series_mei_id: z.number().int().optional().describe("Giới hạn revision — auto resolve m_lang_id."),
      m_lang_id: z.number().int().optional().describe("Giới hạn ngôn ngữ — bỏ qua nếu đã có t_series_mei_id."),
    },
    handler: async (client, args) => json(await client.get_item_info_detail(args)),
  },

  // ===== /api/getiteminfocount — đếm số 品番 active+廃番 (không tính deleted) =====
  {
    name: "get_item_info_count",
    description: "Requires prior `login`. Đếm số 品番 (active + 廃番, KHÔNG tính `del_flg=1`) và ngày tạo mới nhất của 1 series revision.\n\nWHEN TO USE:\n- 'có bao nhiêu 品番 trong revision 401' → đọc `item_count`\n- 'lần cuối tạo 品番 mới là khi nào' → đọc `latest_add_datetime`\n\nDO NOT USE:\n- Cần breakdown active/廃番/deleted riêng → dùng get_item_info_status_count\n- Cần list items → dùng get_item_info_list\n\nNOTES: KHÔNG tính item có `del_flg=1` (deleted). Để có cả deleted dùng get_item_info_status_count.\n\nRETURNS: { ok, series_id, m_lang_id, item_count: int, latest_add_datetime: string|null }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. Bắt buộc."),
    },
    handler: async (client, args) => json(await client.get_item_info_count(args)),
  },

  // ===== /api/getiteminfostatuscount — breakdown theo del_flg =====
  {
    name: "get_item_info_status_count",
    description: "Requires prior `login`. Breakdown số 品番 theo del_flg trong 1 revision: tổng / active / 廃番 / deleted.\n\nWHEN TO USE:\n- 'breakdown 品番 active vs 廃番 vs deleted'\n- 'có bao nhiêu 品番 đã xoá'\n- Cần biết tỉ lệ status\n\nDO NOT USE:\n- Cần tổng (không tính deleted) → dùng get_item_info_count (nhanh hơn)\n- Cần list từng 品番 → dùng get_item_info_list\n\nNOTES: `all_count` BAO GỒM cả deleted (del_flg=1). `active_count` + `stop_count` + `deleted_count` = `all_count`.\n\nRETURNS: { ok, series_id, m_lang_id, all_count, active_count, stop_count, deleted_count }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. Bắt buộc."),
    },
    handler: async (client, args) => json(await client.get_item_info_status_count(args)),
  },

  // ===== /api/getiteminfopricestatuscount — báo cáo giá đã set chưa =====
  {
    name: "get_item_info_price_status",
    description: "Requires prior `login`. Báo cáo số 品番 đã có giá vs chưa có giá trong 1 revision theo NGÔN NGỮ. Trả về list mã 品番 chưa có giá.\n\nWHEN TO USE:\n- '品番 nào chưa có giá' → đọc `missing_price_items`\n- 'báo cáo set giá tiến độ thế nào'\n- 'còn bao nhiêu 品番 pending giá'\n- 'price coverage % của series'\n\nDO NOT USE: Khi cần chi tiết giá từng 品番 (dùng get_item_price hoặc get_item_info_detail).\n\nNOTES: m_lang_id mặc định 1=JP. Price status check theo từng ngôn ngữ (vì giá có thể khác theo JP/EN/CN).\n\nRETURNS: { ok, series_id, m_lang_id, total_items, items_with_price, items_without_price, missing_price_items: [item_item_no, ...] }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. Bắt buộc."),
      m_lang_id: z.number().int().optional().describe("Ngôn ngữ (1=JP, 2=EN, 3=CN). Mặc định 1=JP."),
    },
    handler: async (client, args) => json(await client.get_item_info_price_status(args)),
  },

  // ===== /api/getiteminfosearch — search 品番 theo keyword + category/series name =====
  {
    name: "get_item_info_search",
    description: "Requires prior `login`. ⭐ Search 品番 GLOBAL theo keyword (item code/name), với option lọc theo tên category, tên series, status. KHÔNG giới hạn 1 series cụ thể.\n\nWHEN TO USE:\n- 'tìm 品番 chứa LDM trên toàn hệ thống' → `keyword='LDM'`\n- 'tìm 品番 trong category クランプ' → `ctg_name='クランプ'`\n- 'tìm 品番 trong series LDM-W' → `series_name='LDM-W'`\n- 'tìm 品番 LDM trong cate クランプ' → `keyword='LDM'` + `ctg_name='クランプ'`\n- 'tìm 品番 active' → `del_flg=0`; '品番 đã xoá' → `del_flg=1`; '品番 廃番' → `del_flg=2`\n\nDO NOT USE: Khi đã biết t_series_mei_id và chỉ cần list (dùng get_item_info_list — nhanh hơn).\n\nNOTES: m_lang_id BẮT BUỘC. Phải có ít nhất 1 trong (keyword, ctg_name, series_name).\n\nRETURNS: { ok, total, page, limit, max_page, page_size, items: [{ t_item_info_id, item_item_no, catalog_item_no, i7_item_no, del_flg, m_lang_id, series_id, t_ctg_head_id, ctg_id, ctg_name }] }.",
    schema: {
      m_lang_id: z.number().int().describe("Ngôn ngữ (1=JP, 2=EN, 3=CN). Bắt buộc."),
      keyword: z.string().optional().describe("Keyword tìm trong item code/name."),
      ctg_name: z.string().optional().describe("Filter theo tên category."),
      series_name: z.string().optional().describe("Filter theo tên series."),
      del_flg: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("0=active, 1=deleted, 2=廃番. Bỏ qua = tất cả."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_item_info_search(args)),
  },

  // ===== /api/getitemprice — giá 品番 đa ngôn ngữ + source =====
  {
    name: "get_item_price",
    description: "Requires prior `login`. Lấy giá đầy đủ của 1 品番 (cả 3 ngôn ngữ JP/EN/CN, kèm flag output_jpn/eng/cn, source manual/sftp, timestamps).\n\nWHEN TO USE:\n- 'giá của 品番 LDM-W-10' → `item_item_no='LDM-W-10'` + `series_item_no='LDM-W'`\n- 'giá 品番 chỉ JP' → thêm `m_lang_id=1` để lọc\n- 'lịch sử upload giá / nguồn giá manual vs sftp'\n\nDO NOT USE:\n- Khi cần info đầy đủ (tên + meta + giá tóm tắt) → dùng get_item_info_detail\n- Khi cần báo cáo coverage giá → dùng get_item_info_price_status\n\nNOTES:\n- `item_item_no` + `series_item_no` đều BẮT BUỘC (cần cả 2 để identify 品番 chính xác)\n- `prices` array có thể nhiều entry (mỗi m_lang_id 1 entry)\n- `source: 'manual'` = nhập tay, `'sftp'` = import từ SFTP\n- `tanka`, `tani` là string (không phải number)\n\nRETURNS: { ok, item_item_no, series_item_no, prices: [{ t_item_info_price_id, m_lang_id, tanka, tani, output_jpn, output_eng, output_cn, source, t_itemno_price_upload_id, add_datetime, upd_datetime }] }.",
    schema: {
      item_item_no: z.string().describe("Mã 品番 (vd: 'LDM-W-10'). Bắt buộc."),
      series_item_no: z.string().describe("Mã series (vd: 'LDM-W'). Bắt buộc."),
      m_lang_id: z.number().int().optional().describe("Lọc theo 1 ngôn ngữ cụ thể (1=JP, 2=EN, 3=CN). Bỏ qua = trả cả 3."),
    },
    handler: async (client, args) => json(await client.get_item_price(args)),
  },

  // ===== /api/getitempricebylist — giá hàng loạt toàn bộ 品番 trong revision =====
  {
    name: "get_item_price_by_list",
    description: "Requires prior `login`. Lấy giá của TẤT CẢ 品番 trong 1 series revision trong 1 call (bulk). Dùng LEFT JOIN nên 品番 không có giá vẫn xuất hiện với `has_price=false`.\n\n⚠️ TOKEN: Series lớn (150+ 品番) có thể trả 50k+ chars. LUÔN dùng `compact=1` (default) trừ khi cần trường phụ (output_*, source, datetime).\n\nWHEN TO USE:\n- 'tất cả giá của revision 401' → `t_series_mei_id=401`\n- 'danh sách giá bulk / hàng loạt của series' → đây là tool duy nhất\n- '品番 nào chưa có giá + xem giá hiện tại' → filter `has_price` trong kết quả\n- 'giá 品番 LDM-W-10 trong revision 401' → truyền thêm `item_item_no='LDM-W-10'`\n- 'giá 品番 active trong revision' → `del_flg=0`\n\nDO NOT USE:\n- Khi chỉ cần 1 品番 cụ thể → dùng `get_item_price` (nhanh hơn)\n- Khi chỉ cần báo cáo coverage giá (bao nhiêu 品番 có giá) → dùng `get_item_info_price_status`\n- Khi cần chi tiết đầy đủ item (tên, meta) kèm giá → dùng `get_item_info_detail`\n\nNOTES:\n- `has_price=true` khi có record trong `t_item_info_price`; `false` = không có giá\n- `source='manual'` = nhập tay; `'sftp'` = import SFTP; `null` = không có giá (chỉ có khi compact=0)\n- `tanka`, `tani` đều `null` khi `has_price=false`\n- Paginated: dùng `page`/`limit` nếu series có nhiều 品番\n\nRETURNS (compact=1, default): { ok, items: [{ item_item_no, tanka, tani, has_price }], total, page, limit, max_page, page_size }.\nRETURNS (compact=0): { ok, items: [{ item_item_no, series_item_no, m_lang_id, tanka, tani, output_jpn, output_eng, output_cn, has_price, source, price_add_datetime, price_upd_datetime }], total, page, limit, max_page, page_size }.",
    schema: {
      t_series_mei_id: z.number().int().describe("ID revision. Bắt buộc."),
      item_item_no: z.string().optional().describe("Filter 品番 (ILIKE partial, case-insensitive). Bỏ qua = tất cả."),
      del_flg: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("0=active (default), 1=deleted, 2=廃番. Bỏ qua = chỉ active (del_flg=0)."),
      compact: z.union([z.literal(0), z.literal(1)]).optional().describe("1=compact (default) — chỉ trả item_item_no+tanka+tani+has_price, giảm ~5x token. 0=full — thêm series_item_no, m_lang_id, output_jpn/eng/cn, source, price_add_datetime, price_upd_datetime."),
      page: z.number().int().min(1).optional().describe("Số trang. Mặc định 1."),
      limit: z.number().int().min(1).optional().describe("Số bản ghi/trang. Mặc định 50."),
    },
    handler: async (client, args) => json(await client.get_item_price_by_list(args)),
  },

  // ===== /api/getapprovedseries — series đã approved trong khoảng date + missing-lang filter =====
  {
    name: "get_approved_series",
    description: "Requires prior `login`. ⭐ Trả về series có `approval_status=4` (MK確認済 — final approved) trong 1 khoảng date, kèm option filter các series MISSING data ở ngôn ngữ khác (use case: 'JP đã approved nhưng EN chưa có data').\n\nWHEN TO USE:\n- 'series JP approved tháng trước mà chưa có EN' → KHÔNG truyền param (default: prev month, JP, missing EN)\n- 'series approved hôm qua' → `date_from='YYYY-MM-DD'` + `date_to='YYYY-MM-DD'` (cùng ngày)\n- 'series approved tháng 4/2025' → `year_month='202504'` (shorthand)\n- 'series JP approved tháng 3, có cả EN data hay không' → `year_month='202503'` + `filter_missing_lang=0`\n- 'series EN approved tuần này, chưa có CN' → `m_lang_id=2` + `missing_lang_id=3` + date range\n\nDO NOT USE:\n- Khi muốn list series không filter status (dùng get_series_info)\n- Khi cần check approval status của 1 series cụ thể (dùng get_series_status)\n\nNOTES:\n- Default: prev month, JP approved, filter missing EN\n- `year_month` ưu tiên thấp hơn (chỉ dùng khi không có date_from/date_to)\n- `filter_missing_lang=1` (default) = chỉ trả series thiếu missing_lang_id; =0 = trả tất cả approved trong range\n- approval_status=4 nghĩa MK確認済 (final approved, không phải PM承認)\n\nRETURNS: { ok, series: [...] } — list series approved match điều kiện.",
    schema: {
      date_from: z.string().optional().describe("Date format YYYY-MM-DD, inclusive. Default: first day of previous month."),
      date_to: z.string().optional().describe("Date format YYYY-MM-DD, inclusive. Default: last day of previous month."),
      year_month: z.string().optional().describe("Format YYYYMM, shorthand cho cả tháng (backward-compat). Lower priority than date_from/date_to."),
      m_lang_id: z.number().int().optional().describe("Ngôn ngữ đã approved (1=JP default, 2=EN, 3=CN)."),
      filter_missing_lang: z.union([z.literal(0), z.literal(1)]).optional().describe("1=chỉ series thiếu missing_lang_id (default), 0=tất cả series approved."),
      missing_lang_id: z.number().int().optional().describe("Ngôn ngữ kiểm tra missing data (default 2=EN). Chỉ dùng khi filter_missing_lang=1."),
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
