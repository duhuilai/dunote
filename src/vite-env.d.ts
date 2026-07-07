/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[]
    filename?: string
    image?: { type?: string; quality?: number }
    html2canvas?: Record<string, any>
    jsPDF?: { unit?: string; format?: string | [number, number]; orientation?: string }
    pagebreak?: Record<string, any>
  }
  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance
    from(element: HTMLElement | string): Html2PdfInstance
    save(): Promise<void>
    toPdf(): Html2PdfInstance
    output(type: string): Promise<any>
  }
  function html2pdf(element?: HTMLElement | string, options?: Html2PdfOptions): Html2PdfInstance
  export default html2pdf
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export function gfm(turndownService: TurndownService): void
  export function tables(turndownService: TurndownService): void
  export function strikethrough(turndownService: TurndownService): void
  export function taskListItems(turndownService: TurndownService): void
  export function highlightedCodeBlock(turndownService: TurndownService): void
}
