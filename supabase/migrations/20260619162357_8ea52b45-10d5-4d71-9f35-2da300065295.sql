
CREATE POLICY "own member photos read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own member photos insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own member photos update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own member photos delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
