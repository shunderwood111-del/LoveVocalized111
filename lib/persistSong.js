// lib/persistSong.js
import supabaseAdmin from './supabaseAdmin';
import prisma from './prisma';

export async function persistSong({ jobId, tempUrl, customerId, mime = 'audio/mpeg' }) {
  // 1) fetch the temporary file
  const r = await fetch(tempUrl);
  if (!r.ok) throw new Error(`Fetch temp song failed: ${r.status}`);
  const arrayBuf = await r.arrayBuffer();

  // 2) durable storage key
  const key = `songs/${customerId}/${jobId}.mp3`;

  // 3) upload to Supabase Storage (private bucket "song-files")
  const { error: upErr } = await supabaseAdmin
    .storage
    .from('song-files')
    .upload(key, Buffer.from(arrayBuf), { upsert: true, contentType: mime });
  if (upErr) throw upErr;

  // 4) save to DB
  await prisma.songJob.update({
    where: { id: jobId },
    data: { storageKey: key, mime, status: 'succeeded' },
  });

  return key;
}
