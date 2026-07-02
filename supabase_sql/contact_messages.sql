create table if not exists public.contact_messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.contact_messages enable row level security;

-- Create policy so users can only insert their own messages
create policy "Users can insert their own contact messages"
on public.contact_messages
for insert
to authenticated
with check (auth.uid() = user_id);

-- Create policy so users can view their own messages (optional, if you want them to see history)
create policy "Users can view their own contact messages"
on public.contact_messages
for select
to authenticated
using (auth.uid() = user_id);
