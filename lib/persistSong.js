import supabaseAdmin from './supabaseAdmin.js';
import prisma from './prisma.js';

export async function persistSong({ jobId, tempUrl, customerId, mime = 'audio/mpeg' }) {
  const r = await fetch(tempUrl);
  if (!r.ok) throw new Error(`Fetch temp song failed: ${r.status}`);
  const arrayBuf = await r.arrayBuffer();

  const key = `songs/${customerId}/${jobId}.mp3`;

  const { error: upErr } = await supabaseAdmin
    .storage
    .from('song-files')
    .upload(key, Buffer.from(arrayBuf), { upsert: true, contentType: mime });
  if (upErr) throw upErr;

  await prisma.songJob.update({
    where: { id: jobId },
    data: { storageKey: key, mime, status: 'succeeded' },
  });

  return key;
}
