-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traveler_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(traveler_id, agency_id, listing_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Participants can view their conversations
CREATE POLICY "users_select_own_conversations" ON public.conversations
  FOR SELECT USING (auth.uid() IN (traveler_id, agency_id));

CREATE POLICY "users_insert_conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = traveler_id);

CREATE POLICY "users_select_own_messages" ON public.messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.traveler_id, c.agency_id))
  );

CREATE POLICY "users_insert_own_messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "users_update_read_status" ON public.messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.traveler_id, c.agency_id))
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_traveler ON public.conversations(traveler_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agency ON public.conversations(agency_id);

-- Trigger: auto-update last_message_at when a message is inserted
CREATE OR REPLACE FUNCTION update_conversation_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message_at();

-- RPC: resolve display names for a list of user IDs (reads auth.users safely)
CREATE OR REPLACE FUNCTION public.get_user_display_names(user_ids UUID[])
RETURNS TABLE(id UUID, display_name TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, COALESCE(raw_user_meta_data->>'name', email) AS display_name
  FROM auth.users
  WHERE id = ANY(user_ids);
$$;
