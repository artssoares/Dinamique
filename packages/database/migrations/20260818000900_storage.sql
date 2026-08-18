-- ============================================================================
-- Buckets de arquivos e suas políticas.
--
-- Regra central: cada usuário só enxerga e grava dentro da própria pasta, e o
-- caminho sempre começa com o id dele. Isso é verificado pelo banco, não pelo
-- aplicativo (§118).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Fotos de perfil são públicas para leitura: aparecem no app e no Admin, e
  -- URLs assinadas para cada avatar seriam caras sem ganho real de privacidade.
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg','image/png','image/webp']),
  -- Anexos de suporte são privados e lidos por URL assinada.
  ('support-attachments', 'support-attachments', false, 5242880,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- ------------------------------------------------------------- avatars -----
create policy "avatar leitura pública"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- `foldername(name)[1]` é a primeira pasta do caminho: o id do usuário.
create policy "avatar upload próprio"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar troca própria"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar remoção própria"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --------------------------------------------- anexos do suporte -----------
create policy "anexo leitura do dono ou da equipe"
  on storage.objects for select
  using (
    bucket_id = 'support-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
    )
  );

create policy "anexo upload próprio"
  on storage.objects for insert
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
