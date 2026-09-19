/**
 * @file index.js
 * Central Exporter Registry.
 * Section 15 of the authoritative specification.
 */

export const EXPORTERS = {
  pdf: {
    label: 'PDF Document',
    extension: 'pdf',
    mime: 'application/pdf',
    engines: ['vector', 'raster'],
    defaultEngine: 'vector',
    loader: async (engine = 'vector') => {
      if (engine === 'raster') {
        return await import('./pdf-raster.js');
      }
      return await import('./pdf-vector.js');
    }
  },
  docx: {
    label: 'Word Document',
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    loader: async () => await import('./docx.js')
  },
  md: {
    label: 'Markdown',
    extension: 'md',
    mime: 'text/markdown;charset=utf-8',
    presets: ['github', 'obsidian', 'notion'],
    defaultPreset: 'github',
    loader: async () => await import('./markdown.js')
  },
  html: {
    label: 'Standalone HTML',
    extension: 'html',
    mime: 'text/html;charset=utf-8',
    loader: async () => await import('./html.js')
  },
  txt: {
    label: 'Plain Text',
    extension: 'txt',
    mime: 'text/plain;charset=utf-8',
    loader: async () => await import('./txt.js')
  },
  json: {
    label: 'JSON Data',
    extension: 'json',
    mime: 'application/json;charset=utf-8',
    loader: async () => await import('./json.js')
  },
  png: {
    label: 'PNG Image',
    extension: 'png',
    mime: 'image/png',
    loader: async () => await import('./png.js')
  },
  csv: {
    label: 'CSV Spreadsheet',
    extension: 'csv',
    mime: 'text/csv;charset=utf-8',
    loader: async () => await import('./csv.js')
  }
};
