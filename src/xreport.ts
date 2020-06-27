export interface XReportLocale {
  lang: string;
  title: string;
  summary?: string;
  description?: string;
  place?: string;
  route_study?: string;
  conditions?: string;
  training?: string;
  motivations?: string;
  group_management?: string;
  risk?: string;
  time_management?: string;
  safety?: string;
  reduce_impact?: string;
  increase_impact?: string;
  modifications?: string;
  other_comments?: string;
}

export interface Geometry {
  version: number;
  geom: string;
}

export interface AreaLocale {
  lang: string;
  title: string;
}

export interface Area {
  locales: AreaLocale[];
}

export interface Author {
  name: string;
  user_id: number;
}

export interface Association {
  type: string;
  document_id: number;
}

export interface Associations {
  users: Association[];
  routes: Association[];
  outings: Association[];
  articles: Association[];
  images: Association[];
  waypoints: Association[];
}

export interface XReport {
  document_id: number;
  areas: Area[];
  event_activity: string;
  activity_rate?: string;
  age?: number;
  associations: Associations;
  author?: Author;
  author_status?: string;
  autonomy?: string;
  avalanche_level?: string;
  avalanche_slope?: string;
  available_langs: string[];
  date?: string;
  elevation?: number;
  event_type: string;
  gender?: string;
  geometry?: Geometry;
  nb_impacted?: number;
  nb_participants?: number;
  previous_injuries?: string;
  qualification?: string;
  quality: string;
  rescue?: string;
  severity?: string;
  supervision?: string;
  locales: XReportLocale[];
}
