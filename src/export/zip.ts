import JSZip from 'jszip'

/** Unique, ordered file names: "01-Acme_1080p60.mp4", "02-Acme-2_1080p60.mp4", … */
export function numberedNames(baseNames: string[], suffix: string): string[] {
  const width = Math.max(2, String(baseNames.length).length)
  const seen = new Map<string, number>()
  return baseNames.map((base, i) => {
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    const unique = count > 1 ? `${base}-${count}` : base
    return `${String(i + 1).padStart(width, '0')}-${unique}${suffix}`
  })
}

/** MP4s are already compressed, so they're stored as-is: fast and no size gain lost. */
export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const zip = new JSZip()
  for (const { name, blob } of files) zip.file(name, blob, { binary: true, compression: 'STORE' })
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' })
}
