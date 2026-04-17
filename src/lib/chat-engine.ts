/**
 * Chat Engine — Scripted conversational flow for reimbursement requests.
 * Pure functions, no React dependency.
 */

export type MessageType =
  | "text"
  | "file"
  | "ocr_result"
  | "request_summary"
  | "request_list"
  | "status_update"
  | "stats"

export type MessageRole = "user" | "assistant"

export interface ChatMessage {
  id: string
  role: MessageRole
  type: MessageType
  content: string
  data?: Record<string, unknown>
  timestamp: Date
}

export interface DraftRequest {
  title: string
  amount: number
  currency: string
  category: string
  receiptUrl?: string
  parsedData?: Record<string, unknown>
  filePreview?: string
}

export interface ChatState {
  messages: ChatMessage[]
  currentDraft: DraftRequest | null
  awaitingConfirm: boolean // waiting for user to confirm OCR result
  awaitingAmount: boolean // waiting for user to enter amount
  awaitingCategory: boolean // waiting for user to pick category
  isProcessing: boolean
  userName: string
}

export type ChatAction =
  | { type: "text"; text: string }
  | { type: "file"; file: File; receiptUrl: string; ocrResult?: Record<string, unknown>; filePreview?: string }

export interface EngineResponse {
  messages: ChatMessage[]
  draftUpdate?: Partial<DraftRequest> | null
  stateUpdates?: Partial<Pick<ChatState, "awaitingConfirm" | "awaitingAmount" | "awaitingCategory">>
  apiAction?: {
    type: "create_request" | "fetch_requests" | "fetch_stats" | "submit_drafts" | "delete_request"
    payload?: Record<string, unknown>
  }
}

let msgCounter = 0
export function makeId(): string {
  return `msg_${Date.now()}_${++msgCounter}`
}

function msg(role: MessageRole, type: MessageType, content: string, data?: Record<string, unknown>): ChatMessage {
  return { id: makeId(), role, type, content, data, timestamp: new Date() }
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase()
  if (lower.match(/uber|grab|taxi|lyft|gojek|bus|train|flight|airline|airport|transport|parking|toll|fuel|gas|petrol|ride/)) return "TRAVEL"
  if (lower.match(/restaurant|cafe|coffee|food|lunch|dinner|breakfast|mcdonald|starbucks|eat|meal|catering/)) return "MEALS"
  if (lower.match(/hotel|motel|inn|lodge|airbnb|accommodation|penginapan|villa|hostel/)) return "ACCOMMODATION"
  if (lower.match(/phone|mobile|internet|data|telkom|xl|indosat|telkomsel|wifi|broadband|sim|communication|kuota/)) return "COMMUNICATION"
  if (lower.match(/training|course|seminar|workshop|webinar|certification|class|learning|udemy|coursera/)) return "TRAINING"
  if (lower.match(/entertainment|client|event|team|gathering|outing|hiburan|ticket|concert|sport/)) return "ENTERTAINMENT"
  if (lower.match(/meeting|conference|boardroom|room rental|venue|ruang rapat|zoom|webex|meet/)) return "MEETING"
  if (lower.match(/equipment|hardware|laptop|monitor|keyboard|mouse|headset|device|gadget|printer/)) return "EQUIPMENT"
  if (lower.match(/print|printing|photocopy|copy|binding|laminate|cetak|fotokopi/)) return "PRINTING"
  if (lower.match(/software|subscription|license|app|saas|adobe|microsoft|google workspace|slack|notion/)) return "SOFTWARE"
  if (lower.match(/stationery|paper|ink|supply|supplies|amazon|shopee|lazada|kantor/)) return "SUPPLIES"
  return "OTHER"
}

function parseAmountFromText(text: string): { amount: number; currency: string } | null {
  // Try "Rp 150.000" or "Rp150000"
  const rpMatch = text.match(/Rp\.?\s*([\d.]+)/i)
  if (rpMatch) {
    const raw = rpMatch[1]
    const amount = raw.includes(".") && raw.split(".").pop()?.length === 3
      ? parseInt(raw.replace(/\./g, ""), 10)
      : parseFloat(raw)
    if (amount > 0) return { amount, currency: "IDR" }
  }

  // Try "$50" or "USD 50"
  const dollarMatch = text.match(/\$\s*([\d,]+\.?\d*)/i)
  if (dollarMatch) {
    const amount = parseFloat(dollarMatch[1].replace(",", ""))
    if (amount > 0) return { amount, currency: "USD" }
  }

  // Try bare number at end: "Grab ride 85000"
  const trailingNum = text.match(/\s([\d,.]+)\s*$/)
  if (trailingNum) {
    const raw = trailingNum[1]
    // If number > 1000 and no decimal, likely IDR
    const parsed = raw.includes(".") && raw.split(".").pop()?.length === 3
      ? parseInt(raw.replace(/\./g, ""), 10)
      : parseFloat(raw.replace(/,/g, ""))
    if (parsed > 0) {
      return { amount: parsed, currency: parsed >= 1000 ? "IDR" : "IDR" }
    }
  }

  return null
}

function extractTitleFromText(text: string): string {
  // Remove amount patterns to get the title
  return text
    .replace(/Rp\.?\s*[\d.]+/gi, "")
    .replace(/\$\s*[\d,]+\.?\d*/g, "")
    .replace(/\s[\d,.]+\s*$/, "")
    .replace(/USD|IDR|EUR|GBP|SGD/gi, "")
    .trim()
    || text.trim()
}

export function generateGreeting(userName: string): ChatMessage {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  return msg(
    "assistant",
    "text",
    `${greeting}, ${userName}! I'm your reimbursement assistant.\n\nYou can:\n- **Upload a receipt** (photo or PDF) and I'll read it automatically\n- **Type an expense** like "Grab ride to airport 85000"\n- **Ask me** "show my requests" or "what's my total this month?"\n\nWhat would you like to do?`
  )
}

export function processTextInput(text: string, state: ChatState): EngineResponse {
  const lower = text.toLowerCase().trim()

  // --- Awaiting confirmation of OCR result ---
  if (state.awaitingConfirm && state.currentDraft) {
    if (lower.match(/^(yes|y|correct|confirm|ok|okay|looks good|lgtm|yep|sure|right)$/i)) {
      // Confirmed — show summary card
      return {
        messages: [msg("assistant", "request_summary", "Great! Here's your request summary. Save it or submit directly.", { draft: state.currentDraft as unknown as Record<string, unknown> })],
        stateUpdates: { awaitingConfirm: false },
      }
    }
    // User wants to edit — could be a correction
    const amountParsed = parseAmountFromText(text)
    if (amountParsed) {
      return {
        messages: [msg("assistant", "text", `Updated amount to ${amountParsed.currency} ${amountParsed.amount.toLocaleString()}. Anything else to change, or say "confirm"?`)],
        draftUpdate: { amount: amountParsed.amount, currency: amountParsed.currency },
      }
    }
    // Treat as title correction
    return {
      messages: [msg("assistant", "text", `Updated title to "${text}". Say "confirm" when ready.`)],
      draftUpdate: { title: text },
    }
  }

  // --- Awaiting amount ---
  if (state.awaitingAmount && state.currentDraft) {
    const amountParsed = parseAmountFromText(text) || { amount: parseFloat(text.replace(/[^\d.]/g, "")), currency: "IDR" }
    if (amountParsed.amount > 0) {
      const category = detectCategory(state.currentDraft.title)
      return {
        messages: [msg("assistant", "request_summary", `Got it — ${amountParsed.currency} ${amountParsed.amount.toLocaleString()}. Here's your request:`, { draft: { ...state.currentDraft, amount: amountParsed.amount, currency: amountParsed.currency, category } as unknown as Record<string, unknown> })],
        draftUpdate: { amount: amountParsed.amount, currency: amountParsed.currency, category },
        stateUpdates: { awaitingAmount: false },
      }
    }
    return {
      messages: [msg("assistant", "text", "I couldn't understand that amount. Please enter a number, e.g. \"85000\" or \"Rp 85.000\".")],
    }
  }

  // --- Command: show requests ---
  if (lower.match(/^(show|list|my|view)\s*(my\s*)?(request|reimbursement|expense)/i) || lower === "show" || lower === "list") {
    return {
      messages: [],
      apiAction: { type: "fetch_requests" },
    }
  }

  // --- Command: total this month ---
  if (lower.match(/total|how much|berapa|summary|this month/i)) {
    return {
      messages: [],
      apiAction: { type: "fetch_stats" },
    }
  }

  // --- Command: submit all drafts ---
  if (lower.match(/submit\s*(all)?\s*(draft|request)/i)) {
    return {
      messages: [],
      apiAction: { type: "submit_drafts" },
    }
  }

  // --- Command: help ---
  if (lower.match(/^(help|commands|what can you do|\?)/i)) {
    return {
      messages: [msg("assistant", "text",
        "Here's what I can help with:\n\n" +
        "**Upload a receipt** — Drop or attach a photo/PDF\n" +
        "**Type an expense** — e.g. \"Grab ride to airport 85000\"\n" +
        "**\"show my requests\"** — See your recent requests\n" +
        "**\"total this month\"** — See your monthly summary\n" +
        "**\"submit all drafts\"** — Submit all draft requests\n" +
        "**\"help\"** — Show this message"
      )],
    }
  }

  // --- Default: parse as expense description ---
  const amountParsed = parseAmountFromText(text)
  const title = extractTitleFromText(text)
  const category = detectCategory(text)

  if (amountParsed && amountParsed.amount > 0 && title) {
    // Full expense in one message
    const draft: DraftRequest = {
      title,
      amount: amountParsed.amount,
      currency: amountParsed.currency,
      category,
    }
    return {
      messages: [msg("assistant", "request_summary", `I'll create this request:`, { draft: draft as unknown as Record<string, unknown> })],
      draftUpdate: draft,
      stateUpdates: { awaitingConfirm: false, awaitingAmount: false },
    }
  }

  if (title && !amountParsed) {
    // Got a description but no amount
    const draft: DraftRequest = {
      title: text.trim(),
      amount: 0,
      currency: "IDR",
      category,
    }
    return {
      messages: [msg("assistant", "text", `Got it — "${text.trim()}". How much was it?`)],
      draftUpdate: draft,
      stateUpdates: { awaitingAmount: true },
    }
  }

  return {
    messages: [msg("assistant", "text", "I'm not sure what you mean. Try uploading a receipt, typing an expense like \"lunch 50000\", or say \"help\" for options.")],
  }
}

export function processFileInput(
  receiptUrl: string,
  ocrResult: Record<string, unknown> | undefined,
  filePreview: string | undefined
): EngineResponse {
  if (!ocrResult || (!ocrResult.amount && !ocrResult.source)) {
    // OCR failed or returned nothing useful
    const draft: DraftRequest = {
      title: "Receipt upload",
      amount: 0,
      currency: "IDR",
      category: "OTHER",
      receiptUrl,
      filePreview,
    }
    return {
      messages: [msg("assistant", "text", "I uploaded your receipt but couldn't read it clearly. What's the title and amount?")],
      draftUpdate: draft,
      stateUpdates: { awaitingAmount: true },
    }
  }

  const amount = (ocrResult.amount as number) || 0
  const currency = (ocrResult.currency as string) || "IDR"
  const source = (ocrResult.source as string) || "Receipt upload"
  const date = ocrResult.date as string | undefined
  const chargeType = (ocrResult.chargeType as string) || "other"

  // Map chargeType to category
  let category = "OTHER"
  if (chargeType === "transport") category = "TRAVEL"
  else if (chargeType === "food") category = "MEALS"
  else if (chargeType === "accommodation") category = "ACCOMMODATION"
  else if (chargeType === "communication") category = "COMMUNICATION"
  else if (chargeType === "training") category = "TRAINING"
  else if (chargeType === "entertainment") category = "ENTERTAINMENT"
  else if (chargeType === "meeting") category = "MEETING"
  else if (chargeType === "equipment") category = "EQUIPMENT"
  else if (chargeType === "printing") category = "PRINTING"
  else if (chargeType === "software") category = "SOFTWARE"
  else if (chargeType === "office supplies") category = "SUPPLIES"
  else if (chargeType === "accommodation") category = "TRAVEL"

  const draft: DraftRequest = {
    title: source,
    amount,
    currency,
    category,
    receiptUrl,
    parsedData: ocrResult,
    filePreview,
  }

  return {
    messages: [
      msg("assistant", "ocr_result", "Here's what I found on your receipt:", {
        draft: draft as unknown as Record<string, unknown>,
        ocrResult,
      }),
    ],
    draftUpdate: draft,
    stateUpdates: { awaitingConfirm: true, awaitingAmount: false },
  }
}
