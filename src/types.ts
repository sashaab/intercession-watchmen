export const IMPRESSION_TYPES = [
  "thought",
  "image",
  "bible_verse",
  "dream",
  "perception",
  "prayer_burden",
  "other",
] as const;

export const CONTEXTS = [
  "person",
  "team",
  "church",
  "event",
  "city",
  "society",
  "nation",
  "other",
] as const;

export const URGENCY_LEVELS = ["none", "low", "medium", "high"] as const;

export const STATUSES = [
  "new",
  "review",
  "monitor",
  "intercession",
  "forward",
  "pastoral",
  "no_action",
  "unconfirmed",
  "completed",
] as const;

export type ImpressionType = (typeof IMPRESSION_TYPES)[number];
export type ContextType = (typeof CONTEXTS)[number];
export type Urgency = (typeof URGENCY_LEVELS)[number];
export type Status = (typeof STATUSES)[number];

export type UserRow = {
  telegram_id: number;
  display_name: string;
  role: "watcher" | "leader" | "admin";
  created_at: string;
};

export type ImpressionRow = {
  id: number;
  watchman_id: number;
  watchman_name: string;
  perceived: string;
  interpretation: string | null;
  type: ImpressionType;
  context: ContextType;
  urgency: Urgency;
  prayed: number;
  confidential: number;
  status: Status;
  decision_notes: string | null;
  outcome: string | null;
  forwarded_to: string | null;
  topic_cluster: string | null;
  ai_recommendation: string | null;
  created_at: string;
  updated_at: string;
};

export type PrayerFocusRow = {
  id: number;
  title: string;
  status: "active" | "paused" | "completed";
  duration_weeks: number;
  leader_name: string | null;
  origin_note: string | null;
  shared_with: string | null;
  review_date: string | null;
  updates: string | null;
  reflection: string | null;
  created_at: string;
  updated_at: string;
};

export const TYPE_LABELS: Record<ImpressionType, string> = {
  thought: "Thought",
  image: "Image",
  bible_verse: "Bible verse",
  dream: "Dream",
  perception: "Perception",
  prayer_burden: "Prayer burden",
  other: "Other",
};

export const CONTEXT_LABELS: Record<ContextType, string> = {
  person: "Person",
  team: "Team",
  church: "Church",
  event: "Event",
  city: "City",
  society: "Society",
  nation: "Nation",
  other: "Other",
};

export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  review: "Review",
  monitor: "Monitor",
  intercession: "Intercession",
  forward: "Forward",
  pastoral: "Pastoral clarification",
  no_action: "No action required",
  unconfirmed: "Unconfirmed / Pending",
  completed: "Completed",
};
