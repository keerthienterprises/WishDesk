// New uploads are compressed and stored in Supabase Storage (see media.js).
// These helpers work with both Storage URLs and older base64 data URLs.

export async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob()
}

// Browsers only allow PNG images on the clipboard
export function dataUrlToPngBlob(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!dataUrl.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG conversion failed'))), 'image/png')
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// Save an image (data URL or Storage URL) under a chosen file name.
// A plain <a download> is ignored for cross-origin URLs, so go through a blob.
export async function downloadImage(src, fileName) {
  const url = URL.createObjectURL(await dataUrlToBlob(src))
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function approxKb(dataUrl) {
  return Math.round((dataUrl.length * 3) / 4 / 1024)
}
