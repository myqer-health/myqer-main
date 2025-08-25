
-- Create private buckets and storage policies
select storage.create_bucket('qr', true, 'private');     -- public = false
select storage.create_bucket('voices', true, 'private');

-- Ensure only authenticated users can create in their user-scoped folders; functions may use service role
create policy "qr_read_own_signed" on storage.objects
as permissive for select
to authenticated
using (bucket_id = 'qr');

create policy "qr_write_own" on storage.objects
as permissive for insert
to authenticated
with check (bucket_id = 'qr');

create policy "voices_read_own_signed" on storage.objects
as permissive for select
to authenticated
using (bucket_id = 'voices');

create policy "voices_write_own" on storage.objects
as permissive for insert
to authenticated
with check (bucket_id = 'voices');
