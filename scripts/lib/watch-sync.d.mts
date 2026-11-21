export type PickRow = {
  event_id: string;
  event_date: string;
  kind: "pin" | "hide";
};

export function storeToRows(store: { pinned?: Record<string, string>; hidden?: Record<string, string> } | null): PickRow[];
export function rowsToStore(rows: PickRow[] | null): { pinned: Record<string, string>; hidden: Record<string, string> };
export function mergeOnSignIn(
  local: { pinned?: Record<string, string>; hidden?: Record<string, string> },
  remoteRows: PickRow[],
): { store: { pinned: Record<string, string>; hidden: Record<string, string> }; uploads: PickRow[] };
export function isSyncConfigured(config: { enabled?: boolean; supabaseUrl?: string; supabaseAnonKey?: string } | null): boolean;
export function buildMustWatchDocument(input: {
  source: string;
  rows: PickRow[];
  updatedAt?: string | null;
}): {
  schemaVersion: number;
  source: string;
  updatedAt: string | null;
  pinned: { id: string; date: string }[];
  hidden: { id: string; date: string }[];
};
