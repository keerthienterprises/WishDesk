import { supabase } from './supabase'

const BUCKET = 'media'

// Resize to at most `maxSize` px on the long side and re-encode as JPEG.
// JPEG (not WebP) because WhatsApp handles it everywhere.
function compressToJpeg(file, maxSize = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error(`${file.name} is not an image`))
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff' // transparent PNGs would turn black in JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error('Could not compress the image'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Could not read ${file.name}`))
    }
    img.src = objectUrl
  })
}

const slug = (s) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image'

/** Compress, upload to Storage and record in the library. Returns the media row. */
export async function uploadImage(file, userId) {
  const { blob, width, height } = await compressToJpeg(file)
  const path = `${userId}/${Date.now()}-${slug(file.name)}.jpg`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const { data, error } = await supabase
    .from('media')
    .insert({ name: file.name.replace(/\.[^.]+$/, ''), path, url: publicUrl, width, height, bytes: blob.size, created_by: userId })
    .select('*')
    .single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data
}

export async function listMedia() {
  const { data, error } = await supabase.from('media').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function renameMedia(id, name) {
  const { error } = await supabase.from('media').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteMedia(item) {
  const { error } = await supabase.storage.from(BUCKET).remove([item.path])
  if (error) throw error
  const { error: rowError } = await supabase.from('media').delete().eq('id', item.id)
  if (rowError) throw rowError
}
