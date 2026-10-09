/**
 * Tipos do banco. Espelha supabase/schema.sql à mão — se você mexer no schema,
 * atualize aqui (ou rode `supabase gen types typescript` e substitua).
 */

export type LinkRow = {
  id: string;
  slug: string;
  destination_url: string;
  final_url: string;
  title: string | null;
  campaign: string | null;
  rosto: string | null;
  canal: string | null;
  traffic_type: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  is_active: boolean;
};

export type BioPageRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  avatar_url: string | null;
  /** Tema de fundo (chave de BIO_BACKGROUNDS no Worker) ou "imagem". */
  background: string;
  background_url: string | null;
  /** Logo no rodapé da página pública; vazio = texto "dn.ia". */
  logo_url: string | null;
  rosto: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberRole = "admin" | "membro";

/** Quem está no time. Ter conta no Auth sem linha aqui = sem acesso. */
export type MemberRow = {
  user_id: string;
  email: string;
  role: MemberRole;
  invited_by: string | null;
  created_at: string;
};

export type BioPageItemRow = {
  id: string;
  page_id: string;
  link_id: string;
  label: string;
  position: number;
  is_active: boolean;
  created_at: string;
};

export type BioItemStatsRow = {
  item_id: string;
  page_id: string;
  label: string;
  position: number;
  slug: string;
  clicks: number;
  unique_clicks: number;
};

/** created_by e created_at são preenchidos pelo próprio Postgres (auth.uid(), now()). */
export type LinkInsert = {
  slug: string;
  destination_url: string;
  final_url: string;
  title?: string | null;
  campaign?: string | null;
  rosto?: string | null;
  canal?: string | null;
  traffic_type?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
};

export type ClickRow = {
  id: number;
  link_id: string;
  clicked_at: string;
  referrer: string | null;
  referrer_host: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  ip_hash: string | null;
  is_bot: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

/** Linha das views de agregação (v_link_stats, v_campaign_stats, ...). */
export type StatsRow = {
  clicks: number;
  unique_clicks: number;
  bot_hits: number;
  last_click_at: string | null;
};

export type LinkStatsRow = StatsRow & {
  link_id: string;
  slug: string;
  title: string | null;
  campaign: string | null;
  rosto: string | null;
  canal: string | null;
  created_at: string;
};

export type CampaignStatsRow = StatsRow & {
  campaign: string | null;
  links: number;
};

export type GroupStatsRow = StatsRow & {
  label: string | null;
  links: number;
};

export type DailyClickRow = {
  link_id: string;
  day: string;
  clicks: number;
};

export type Database = {
  public: {
    Tables: {
      members: {
        Row: MemberRow;
        Insert: Omit<MemberRow, "created_at" | "invited_by"> & {
          created_at?: string;
          invited_by?: string | null;
        };
        Update: Partial<Pick<MemberRow, "role">>;
        Relationships: [];
      };
      links: {
        Row: LinkRow;
        Insert: LinkInsert;
        Update: Partial<LinkInsert>;
        Relationships: [];
      };
      clicks: {
        Row: ClickRow;
        Insert: Omit<ClickRow, "id" | "clicked_at"> & {
          id?: number;
          clicked_at?: string;
        };
        Update: Partial<ClickRow>;
        Relationships: [];
      };
      bio_pages: {
        Row: BioPageRow;
        Insert: Omit<
          BioPageRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "created_by"
          | "background"
          | "background_url"
          | "logo_url"
        > & {
          id?: string;
          background?: string;
          background_url?: string | null;
          logo_url?: string | null;
        };
        Update: Partial<BioPageRow>;
        Relationships: [];
      };
      bio_page_items: {
        Row: BioPageItemRow;
        Insert: Omit<BioPageItemRow, "id" | "created_at"> & { id?: string };
        Update: Partial<BioPageItemRow>;
        Relationships: [];
      };
    };
    Views: {
      v_link_stats: { Row: LinkStatsRow; Relationships: [] };
      v_campaign_stats: { Row: CampaignStatsRow; Relationships: [] };
      v_rosto_stats: { Row: GroupStatsRow; Relationships: [] };
      v_canal_stats: { Row: GroupStatsRow; Relationships: [] };
      v_daily_clicks: { Row: DailyClickRow; Relationships: [] };
      v_bio_item_stats: { Row: BioItemStatsRow; Relationships: [] };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
