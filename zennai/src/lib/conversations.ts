import { supabase } from "@/integrations/supabase/client";

export type Conversation = { id: string; title: string; updated_at: string };
export const PAGE = 30;

export async function fetchConversations(search: string, page: number): Promise<Conversation[]> {
  const from = page * PAGE;
  let q = supabase.from("conversations").select("id, title, updated_at").order("updated_at", { ascending: false });
  const s = search.trim().replace(/[%_,()]/g, " ");
  if (s) {
    const { data: hits } = await supabase.from("messages").select("conversation_id").ilike("content", `%${s}%`).limit(200);
    const ids = [...new Set((hits ?? []).map((h) => h.conversation_id))];
    q = ids.length ? q.or(`title.ilike.%${s}%,id.in.(${ids.join(",")})`) : q.ilike("title", `%${s}%`);
  }
  const { data, error } = await q.range(from, from + PAGE - 1);
  if (error) throw error;
  return data ?? [];
}

export function groupByDate(items: Conversation[]) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const c of items) {
    const t = new Date(c.updated_at).getTime();
    if (t >= startToday) groups[0]!.items.push(c);
    else if (t >= startToday - day) groups[1]!.items.push(c);
    else if (t >= startToday - 7 * day) groups[2]!.items.push(c);
    else groups[3]!.items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}
