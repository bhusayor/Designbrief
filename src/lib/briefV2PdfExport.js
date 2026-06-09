// ────────────────────────────────────────────────────────────────────
// briefV2PdfExport.js — clean text-based PDF for V2 briefs.
//
// Replaces html2canvas snapshot for V2 results. We walk the
// 21 items directly through jsPDF.text() and lay them out in a
// single-column A4 with proper page breaks, a project-name +
// date header on every page, and the design-system summary as
// the final section.
//
// No html2canvas. No UI chrome. Just the translation content +
// design system, formatted for client sharing.
// ────────────────────────────────────────────────────────────────────

import { BRIEF_V2_SECTIONS, BRIEF_V2_ITEM_BY_KEY } from './briefV2Schema.js'

const A4_W = 210
const A4_H = 297
const MARGIN_L = 20
const MARGIN_R = 20
const MARGIN_T = 20
const MARGIN_B = 22
const CONTENT_W = A4_W - MARGIN_L - MARGIN_R

export async function exportV2BriefAsPdf(result, projectTitle) {
  if (!result?.sections) throw new Error('Brief has no V2 sections to export.')

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const state = {
    pdf,
    y: MARGIN_T,
    pageNumber: 1,
    projectTitle: projectTitle || result.projectTitle || 'Untitled brief',
    dateStr: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
  }

  drawHeader(state)
  drawDocumentTitle(state)

  // Walk the 5 sections + 21 items.
  for (let sIdx = 0; sIdx < result.sections.length; sIdx++) {
    const section = result.sections[sIdx]
    drawSectionHeader(state, sIdx + 1, section.label)

    for (const item of section.items) {
      const def = BRIEF_V2_ITEM_BY_KEY[item.key]
      const shape = def?.shape || 'text'
      drawItem(state, item, shape)
    }
  }

  // Design system as the final section.
  if (result.designSystem) {
    drawSectionHeader(state, '06', 'Design system (compiled from items 12 to 17)')
    drawDesignSystem(state, result.designSystem)
  }

  drawFooter(state)

  const filename = (state.projectTitle || 'brief')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + '.pdf'
  pdf.save(filename)
}

// ── Page breaks ────────────────────────────────────────────────────
function ensureRoom(state, needed) {
  if (state.y + needed > A4_H - MARGIN_B) {
    drawFooter(state)
    state.pdf.addPage()
    state.pageNumber += 1
    state.y = MARGIN_T
    drawHeader(state)
  }
}

function drawHeader(state) {
  const pdf = state.pdf
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(110)
  pdf.text(state.projectTitle.toUpperCase(), MARGIN_L, 12)
  const right = state.dateStr.toUpperCase()
  const rightW = pdf.getTextWidth(right)
  pdf.text(right, A4_W - MARGIN_R - rightW, 12)
  // Hairline under header
  pdf.setDrawColor(220)
  pdf.setLineWidth(0.2)
  pdf.line(MARGIN_L, 15, A4_W - MARGIN_R, 15)
  if (state.y < MARGIN_T) state.y = MARGIN_T
}

function drawFooter(state) {
  const pdf = state.pdf
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(140)
  const label = `Page ${state.pageNumber}`
  const w = pdf.getTextWidth(label)
  pdf.text(label, (A4_W - w) / 2, A4_H - 10)
}

function drawDocumentTitle(state) {
  const pdf = state.pdf
  ensureRoom(state, 30)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(24)
  pdf.setTextColor(20)
  const wrapped = pdf.splitTextToSize(state.projectTitle, CONTENT_W)
  pdf.text(wrapped, MARGIN_L, state.y + 8)
  state.y += wrapped.length * 9 + 4

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(120)
  pdf.text('21-item translated brief', MARGIN_L, state.y + 4)
  state.y += 14
}

function drawSectionHeader(state, indexLabel, label) {
  const pdf = state.pdf
  ensureRoom(state, 20)
  state.y += 6

  // Section chip
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(140)
  const chip = `SECTION ${typeof indexLabel === 'string' ? indexLabel : String(indexLabel).padStart(2, '0')}`
  pdf.text(chip, MARGIN_L, state.y)
  state.y += 4

  // Section label
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.setTextColor(20)
  const wrapped = pdf.splitTextToSize(label, CONTENT_W)
  pdf.text(wrapped, MARGIN_L, state.y + 5)
  state.y += wrapped.length * 6 + 4

  // Rule under section title
  pdf.setDrawColor(40)
  pdf.setLineWidth(0.4)
  pdf.line(MARGIN_L, state.y, MARGIN_L + 32, state.y)
  state.y += 6
}

// ── Item dispatcher ────────────────────────────────────────────────
function drawItem(state, item, shape) {
  const pdf = state.pdf
  // Item header: "01 · Core Problem Clarity"
  ensureRoom(state, 14)
  state.y += 4
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.setTextColor(20)
  const idStr = String(item.id).padStart(2, '0')
  const header = `${idStr}   ${item.title}`
  pdf.text(header, MARGIN_L, state.y)
  state.y += 5

  // Body
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10.5)
  pdf.setTextColor(50)

  if (item.content == null) {
    drawText(state, '(not generated)')
    return
  }

  switch (shape) {
    case 'text':          drawText(state, String(item.content)); break
    case 'list':          drawList(state, item.content); break
    case 'rows':          drawRows(state, item.content?.rows || []); break
    case 'badged_list':   drawBadgedList(state, item.content?.items || []); break
    case 'numbered_list': drawNumbered(state, item.content); break
    case 'roles':         drawRoles(state, item.content); break
    case 'levels':        drawLevels(state, item.content); break
    case 'journey':       drawJourney(state, item.content); break
    case 'competitors':   drawCompetitors(state, item.content); break
    case 'inventory':     drawInventory(state, item.content); break
    default:              drawText(state, JSON.stringify(item.content))
  }
  state.y += 1
}

// ── Shape renderers ────────────────────────────────────────────────
function drawText(state, text) {
  const pdf = state.pdf
  if (!text) return
  const wrapped = pdf.splitTextToSize(text, CONTENT_W)
  for (const line of wrapped) {
    ensureRoom(state, 6)
    pdf.text(line, MARGIN_L, state.y)
    state.y += 5
  }
}

function drawList(state, list) {
  const pdf = state.pdf
  const arr = Array.isArray(list) ? list : []
  for (const entry of arr) {
    const text = typeof entry === 'string' ? entry : safeJson(entry)
    const wrapped = pdf.splitTextToSize(text, CONTENT_W - 6)
    for (let i = 0; i < wrapped.length; i++) {
      ensureRoom(state, 6)
      const prefix = i === 0 ? '•  ' : '   '
      pdf.text(prefix + wrapped[i], MARGIN_L, state.y)
      state.y += 5
    }
  }
}

function drawRows(state, rows) {
  const pdf = state.pdf
  if (!rows.length) return
  // Subheads
  ensureRoom(state, 8)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(140)
  pdf.text('ASKED FOR', MARGIN_L, state.y)
  pdf.text('ACTUALLY NEED', MARGIN_L + CONTENT_W / 2 + 2, state.y)
  state.y += 4
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5); pdf.setTextColor(50)

  const col = CONTENT_W / 2 - 4
  for (const r of rows) {
    const left = pdf.splitTextToSize(String(r.left || ''), col)
    const right = pdf.splitTextToSize(String(r.right || ''), col)
    const lines = Math.max(left.length, right.length)
    ensureRoom(state, lines * 5 + 4)
    for (let i = 0; i < lines; i++) {
      if (left[i])  pdf.text(left[i],  MARGIN_L,                       state.y)
      if (right[i]) pdf.text(right[i], MARGIN_L + CONTENT_W / 2 + 2,   state.y)
      state.y += 5
    }
    state.y += 2
  }
}

function drawBadgedList(state, items) {
  const pdf = state.pdf
  for (const it of items) {
    const status = it.status || it.severity || ''
    const label = status ? `[${status.toUpperCase()}]  ${it.text || ''}` : (it.text || '')
    const wrapped = pdf.splitTextToSize(label, CONTENT_W - 6)
    for (let i = 0; i < wrapped.length; i++) {
      ensureRoom(state, 6)
      const prefix = i === 0 ? '•  ' : '   '
      pdf.text(prefix + wrapped[i], MARGIN_L, state.y)
      state.y += 5
    }
  }
}

function drawNumbered(state, list) {
  const pdf = state.pdf
  const arr = Array.isArray(list) ? list : []
  arr.forEach((q, i) => {
    const num = String(i + 1).padStart(2, '0') + '.'
    const wrapped = pdf.splitTextToSize(String(q), CONTENT_W - 10)
    for (let li = 0; li < wrapped.length; li++) {
      ensureRoom(state, 6)
      const prefix = li === 0 ? `${num}  ` : '    '
      pdf.text(prefix + wrapped[li], MARGIN_L, state.y)
      state.y += 5
    }
    state.y += 1
  })
}

function drawRoles(state, v) {
  const rows = [
    ['Primary',    v.primary],
    ['Secondary',  v.secondary],
    ['Accent',     v.accent],
    ['Background', v.background],
    ['Surface',    v.surface],
  ]
  drawKeyValueRows(state, rows)
  if (v.avoid) drawKeyValueRows(state, [['Never', v.avoid]])
}

function drawLevels(state, v) {
  const rows = [
    ['Display', v.display],
    ['Body',    v.body],
    ['Label',   v.label],
  ]
  drawKeyValueRows(state, rows)
  if (Array.isArray(v.contradicts_brand) && v.contradicts_brand.length) {
    drawKeyValueRows(state, [['Avoid', v.contradicts_brand.join('; ')]])
  } else if (v.avoid) {
    drawKeyValueRows(state, [['Avoid', v.avoid]])
  }
}

function drawJourney(state, steps) {
  const pdf = state.pdf
  const arr = Array.isArray(steps) ? steps : []
  arr.forEach((s, i) => {
    const num = String(s.step || i + 1).padStart(2, '0') + '.'
    ensureRoom(state, 6)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${num}  ${s.title || s.stage || 'Step'}`, MARGIN_L, state.y)
    state.y += 5
    pdf.setFont('helvetica', 'normal')
    if (s.action) {
      const wrapped = pdf.splitTextToSize(s.action, CONTENT_W - 8)
      for (const line of wrapped) {
        ensureRoom(state, 5)
        pdf.text('    ' + line, MARGIN_L, state.y)
        state.y += 5
      }
    }
    const emo = s.emotion || s.feeling
    if (emo) {
      ensureRoom(state, 5)
      pdf.setTextColor(120)
      pdf.text(`    Emotion: ${emo}`, MARGIN_L, state.y)
      pdf.setTextColor(50)
      state.y += 5
    }
    state.y += 1
  })
}

function drawCompetitors(state, list) {
  const pdf = state.pdf
  const arr = Array.isArray(list) ? list : []
  for (const c of arr) {
    ensureRoom(state, 6)
    pdf.setFont('helvetica', 'bold')
    pdf.text(c.name || 'Competitor', MARGIN_L, state.y)
    state.y += 5
    pdf.setFont('helvetica', 'normal')
    if (c.positioning)    drawKVLine(state, 'Positioning', c.positioning)
    if (c.layout)         drawKVLine(state, 'Layout',      c.layout)
    if (c.differentiation) drawKVLine(state, 'Where to diverge', c.differentiation)
    state.y += 2
  }
}

function drawInventory(state, list) {
  const pdf = state.pdf
  const arr = Array.isArray(list) ? list : []
  for (const p of arr) {
    ensureRoom(state, 6)
    pdf.setFont('helvetica', 'bold')
    const head = p.status ? `${p.page || 'Page'}   [${String(p.status).toUpperCase()}]` : (p.page || 'Page')
    pdf.text(head, MARGIN_L, state.y)
    state.y += 5
    pdf.setFont('helvetica', 'normal')
    if (p.content) drawKVLine(state, 'Content', p.content)
    if (p.assets)  drawKVLine(state, 'Assets',  p.assets)
    state.y += 2
  }
}

function drawKVLine(state, key, val) {
  const pdf = state.pdf
  const wrapped = pdf.splitTextToSize(`${key}: ${val}`, CONTENT_W - 8)
  for (const line of wrapped) {
    ensureRoom(state, 5)
    pdf.text('    ' + line, MARGIN_L, state.y)
    state.y += 5
  }
}

function drawKeyValueRows(state, rows) {
  const pdf = state.pdf
  for (const [k, v] of rows) {
    if (v == null || v === '') continue
    const labelText = `${k}:`
    pdf.setFont('helvetica', 'bold')
    const lw = pdf.getTextWidth(labelText)
    const valLines = pdf.splitTextToSize(String(v), CONTENT_W - lw - 4)
    ensureRoom(state, valLines.length * 5 + 1)
    pdf.text(labelText, MARGIN_L, state.y)
    pdf.setFont('helvetica', 'normal')
    for (let i = 0; i < valLines.length; i++) {
      const x = i === 0 ? MARGIN_L + lw + 2 : MARGIN_L + lw + 2
      pdf.text(valLines[i], x, state.y)
      state.y += 5
    }
    state.y += 1
  }
}

// ── Design system summary section ──────────────────────────────────
function drawDesignSystem(state, ds) {
  if (ds.color) {
    drawSubhead(state, 'COLOR INTENT')
    drawKeyValueRows(state, [
      ['Primary',    ds.color.primary],
      ['Secondary',  ds.color.secondary],
      ['Accent',     ds.color.accent],
      ['Background', ds.color.background],
      ['Surface',    ds.color.surface],
      ['Never appear', Array.isArray(ds.color.never_appear) ? ds.color.never_appear.join('; ') : null],
    ])
  }
  if (ds.typography) {
    drawSubhead(state, 'TYPOGRAPHY BEHAVIOUR')
    drawKeyValueRows(state, [
      ['Display', ds.typography.display],
      ['Body',    ds.typography.body],
      ['Label',   ds.typography.label],
      ['Contradicts brand', Array.isArray(ds.typography.contradicts_brand) ? ds.typography.contradicts_brand.join('; ') : null],
    ])
  }
  if (ds.spacing) {
    drawSubhead(state, 'SPACING PHILOSOPHY')
    drawKeyValueRows(state, [
      ['Density',   ds.spacing.density],
      ['Scale',     ds.spacing.scale],
      ['Rationale', ds.spacing.rationale],
    ])
  }
  if (ds.component) {
    drawSubhead(state, 'COMPONENT STYLE')
    drawKeyValueRows(state, [
      ['Corner radius', ds.component.corner_radius],
      ['Reason',        ds.component.radius_reason],
      ['Density',       ds.component.density],
      ['Borders',       ds.component.borders],
    ])
  }
  if (ds.motion) {
    drawSubhead(state, 'MOTION + INTERACTION FEEL')
    drawKeyValueRows(state, [
      ['Speed',      ds.motion.speed],
      ['Transition', ds.motion.transition],
      ['Reason',     ds.motion.speed_reason],
    ])
  }
  if (ds.visual_language) {
    drawSubhead(state, 'VISUAL LANGUAGE')
    drawKeyValueRows(state, [
      ['Imagery type',      ds.visual_language.imagery_type],
      ['UI style',          ds.visual_language.ui_style],
      ['Imagery treatment', ds.visual_language.imagery_treatment],
    ])
  }
}

function drawSubhead(state, label) {
  const pdf = state.pdf
  ensureRoom(state, 10)
  state.y += 4
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(140)
  pdf.text(label, MARGIN_L, state.y)
  state.y += 4
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10.5)
  pdf.setTextColor(50)
}

function safeJson(v) {
  try { return JSON.stringify(v) } catch { return String(v) }
}
