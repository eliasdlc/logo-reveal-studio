/** Turns a logo file name into a safe base name: "Acme Logo (final).svg" → "Acme-Logo-final". */
export function baseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  const safe = withoutExt
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe || 'logo'
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser time to start the download before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
