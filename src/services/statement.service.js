import { PDFParse } from 'pdf-parse';
import { config } from '../config/env.js';

/**
 * FinTrack AI — Bank Statement Import Service
 *
 * Pipeline:
 *   1. Extract raw text from PDF buffer via pdf-parse (no page limit)
 *   2. Split text into ~4000-token chunks
 *   3. Send chunks to Gemini 1.5 Flash in parallel (max 3 concurrent)
 *   4. Merge results, deduplicate, and return structured Transaction[]
 */

const VALID_CATEGORIES = [
  'Salary',
  'Food & Dining',
  'Groceries',
  'Travel',
  'Shopping',
  'Bills & EMI',
  'Health',
  'Entertainment',
  'Rent',
  'ATM Withdrawal',
  'Transfer',
  'Others',
];

const STATEMENT_PROMPT = `You are a financial data extraction AI for FinTrack AI.
You have been given raw text extracted from a bank statement (could be partial — one chunk of a longer document).

Extract EVERY individual transaction you can find in this text as a JSON array.
Each item in the array must have:
{
  "date": "YYYY-MM-DD",
  "description": "original narration or description from the statement",
  "merchant": "cleaned merchant or payee name (e.g. 'Swiggy', 'HDFC EMI', 'Salary - Acme Corp', 'ATM Withdrawal')",
  "amount": numeric value (positive number only),
  "type": "income" or "expense",
  "category": one of exactly ["Salary", "Food & Dining", "Groceries", "Travel", "Shopping", "Bills & EMI", "Health", "Entertainment", "Rent", "ATM Withdrawal", "Transfer", "Others"],
  "paymentMethod": one of ["UPI", "NEFT", "IMPS", "ATM", "Card", "Cheque", "Others"],
  "isReimbursable": true or false
}

CATEGORIZATION RULES:
- Credits / money coming IN → type: "income"
- Debits / money going OUT → type: "expense"
- Large recurring monthly credit (e.g. salary, stipend) → category: "Salary", type: "income"
- EMI, loan payment, insurance premium → category: "Bills & EMI"
- Electricity, water, gas, internet, phone bill → category: "Bills & EMI"
- UPI payment to a person name → category: "Transfer"
- Rent payment → category: "Rent"
- ATM cash withdrawal → category: "ATM Withdrawal", paymentMethod: "ATM"
- Swiggy, Zomato, restaurant → category: "Food & Dining"
- Amazon, Flipkart, Meesho → category: "Shopping"
- Ola, Uber, IRCTC, IndiGo, MakeMyTrip, Rapido → category: "Travel"
- Apollo, pharmacy, hospital, lab test → category: "Health"
- Netflix, Spotify, Amazon Prime → category: "Entertainment"
- Grocery store, BigBasket, Blinkit → category: "Groceries"

REIMBURSABILITY RULES (set isReimbursable: true if ANY of these apply):
- Flight tickets (IndiGo, Air India, SpiceJet, Vistara, IRCTC, MakeMyTrip flights)
- Hotel or accommodation (Oyo, Treebo, Taj, Marriott, Booking.com, Airbnb, MakeMyTrip hotels)
- Taxi or cab for work (Uber, Ola, Rapido — especially if narration mentions 'office', 'client', 'airport')
- Restaurant or meal that looks corporate (large amounts at restaurants, mentions of 'client dinner', 'team lunch')
- Medical / health expense (doctor, hospital, diagnostic lab, Apollo, Fortis, pharmacy)
- Corporate tool or software subscription (Zoom, Slack, AWS, Google Cloud, Microsoft, Adobe)
- Courier or logistics (FedEx, Delhivery, BlueDart)
- Office supplies or equipment (stationery, laptop accessories, etc.)
- Any transaction narration containing: 'office', 'client', 'business', 'corporate', 'reimburs', 'claim', 'work'
- Otherwise set isReimbursable: false (personal food delivery, personal shopping, personal entertainment, ATM, rent, salary are NOT reimbursable)

If you cannot determine a field with confidence, use the best guess.
If there are NO transactions in this chunk, return an empty array [].
Return ONLY the JSON array. No markdown, no explanation, no extra text.`;

/**
 * Extract raw text from a PDF buffer.
 * NOTE: This version of pdf-parse requires the buffer to be passed
 * as `data: Uint8Array` in the constructor options — not in load().
 */
/**
 * Extract raw text and pages from a PDF buffer.
 */
const extractPdfText = async (pdfBuffer) => {
  const uint8 = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);

  const parser = new PDFParse({ data: uint8 });
  try {
    const result = await parser.getText();
    const fullText = typeof result === 'string' ? result : (result?.text ?? '');
    const numPages = result?.total ?? (result?.pages ? result.pages.length : 1);
    const pages = Array.isArray(result?.pages) ? result.pages.map((p) => p.text) : [];

    return {
      text: fullText,
      numPages: numPages || 1,
      pages,
    };
  } finally {
    try {
      await parser.destroy();
    } catch {
      // Ignore parser cleanup error
    }
  }
};

/**
 * Split raw text into chunks of approximately `maxChars` characters,
 * breaking at newlines to avoid cutting mid-transaction.
 */
const chunkText = (text, maxChars = 4000) => {
  const lines = text.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = line;
    } else {
      current += '\n' + line;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter((c) => c.length > 20);
};

/**
 * Safe JSON parser with auto-repair for truncated arrays.
 */
const repairTruncatedJsonArray = (rawText) => {
  if (!rawText) {
    return [];
  }
  let text = rawText.trim();

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Attempt parsing with markdown stripping
  }

  // Strip markdown code fences if present
  if (text.includes('```')) {
    text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Attempt truncation repair
    }
  }

  // Auto-repair if response was truncated: find last '}' and close with ']'
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace !== -1) {
    const candidate = text.slice(0, lastBrace + 1) + ']';
    try {
      const parsed = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Candidate repair failed
    }
  }

  return [];
};

/**
 * Send one text chunk to Gemini and parse the returned transaction array.
 * Uses model fallback if a model experiences rate limits (429) or high load (503).
 */
const parseChunkWithGemini = async (chunk, chunkIndex) => {
  const models = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.6-flash'];

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.geminiApiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: STATEMENT_PROMPT },
                  { text: `\n\n--- BANK STATEMENT CHUNK ${chunkIndex + 1} ---\n${chunk}` },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        console.warn(`[Statement] Model ${model} status ${response.status}: ${errBody.slice(0, 120)}`);
        if (response.status === 429 || response.status === 503 || response.status === 404) {
          continue; // Try next fallback model
        }
        return [];
      }

      const jsonRes = await response.json();
      const rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        continue;
      }

      const parsed = repairTruncatedJsonArray(rawText);
      console.log(`[Statement] Chunk ${chunkIndex + 1} extracted ${parsed.length} transactions via ${model}`);
      return parsed;
    } catch (e) {
      console.warn(`[Statement] Model ${model} request error:`, e.message);
    }
  }

  console.error(`[Statement] All models failed for chunk ${chunkIndex + 1}`);
  return [];
};

/**
 * Process chunks sequentially with progress reporting to avoid rate limits.
 */
const processChunksInBatches = async (chunks, onProgress) => {
  const allTransactions = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkTransactions = await parseChunkWithGemini(chunks[i], i);
    allTransactions.push(...chunkTransactions);

    if (onProgress) {
      onProgress(Math.min(Math.round(((i + 1) / chunks.length) * 100), 99));
    }

    // Small courteous pause between chunks
    if (i < chunks.length - 1) {
      await new Promise((res) => setTimeout(res, 200));
    }
  }

  return allTransactions;
};

/**
 * Normalize and validate a raw Gemini-parsed transaction.
 */
const normalizeTransaction = (raw) => {
  const amount = typeof raw.amount === 'number' ? raw.amount : parseFloat(raw.amount);
  if (!amount || isNaN(amount) || amount <= 0) {
    return null;
  }

  const dateStr = raw.date || '';
  const parsedDate = new Date(dateStr);
  const date = isNaN(parsedDate.getTime())
    ? new Date().toISOString().split('T')[0]
    : dateStr;

  const category = VALID_CATEGORIES.includes(raw.category) ? raw.category : 'Others';
  const type = raw.type === 'income' ? 'income' : 'expense';
  const paymentMethod = ['UPI', 'NEFT', 'IMPS', 'ATM', 'Card', 'Cheque', 'Others'].includes(raw.paymentMethod)
    ? raw.paymentMethod
    : 'Others';

  return {
    title: (raw.merchant || raw.description || 'Bank Transaction').trim().slice(0, 100),
    description: (raw.description || '').trim().slice(0, 200),
    amount: parseFloat(amount.toFixed(2)),
    type,
    category,
    paidVia: paymentMethod,
    date,
    source: 'statement',
    isReimbursable: Boolean(raw.isReimbursable),
    note: (raw.description || '').trim().slice(0, 200),
  };
};

/**
 * Deduplicate transactions: remove exact duplicates within the import batch.
 * (date + amount + title must all match)
 */
const deduplicateWithinBatch = (transactions) => {
  const seen = new Set();
  return transactions.filter((tx) => {
    const key = `${tx.date}|${tx.amount}|${tx.title.toLowerCase().slice(0, 20)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

/**
 * Main entry point.
 * Parses a PDF buffer and returns structured transactions.
 *
 * @param {Buffer} pdfBuffer
 * @param {Function} onProgress - callback(percent: 0-100)
 * @returns {{ transactions: Array, numPages: number, totalFound: number }}
 */
export const statementService = {
  parsePdfStatement: async (pdfBuffer, onProgress) => {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Step 1: Extract text from PDF
    console.log('[Statement] Extracting PDF text...');
    const { text, numPages, pages } = await extractPdfText(pdfBuffer);

    if (!text || text.trim().length < 50) {
      throw new Error('Could not extract readable text from the PDF. Please ensure it is a text-based (not scanned) PDF.');
    }

    console.log(`[Statement] Extracted ${text.length} chars across ${numPages} pages`);

    // Step 2: Chunk text — 2 pages per chunk preserves transaction boundaries
    let chunks = [];
    if (pages && pages.length > 0) {
      for (let i = 0; i < pages.length; i += 2) {
        const pageChunk = pages.slice(i, i + 2).join('\n');
        if (pageChunk.trim().length > 20) {
          chunks.push(pageChunk);
        }
      }
    }
    if (chunks.length === 0) {
      chunks = chunkText(text, 4000);
    }
    console.log(`[Statement] Processing in ${chunks.length} structured chunk(s)`);

    if (onProgress) {
      onProgress(5);
    }

    // Step 3: Process chunks with Gemini model fallback & auto-repair
    const rawTransactions = await processChunksInBatches(chunks, (pct) => {
      if (onProgress) {
        onProgress(5 + Math.round(pct * 0.90));
      }
    });

    // Step 4: Normalize + deduplicate
    const normalized = rawTransactions
      .map(normalizeTransaction)
      .filter(Boolean);

    const deduplicated = deduplicateWithinBatch(normalized);

    // Sort by date ascending
    deduplicated.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (onProgress) {
      onProgress(100);
    }

    console.log(`[Statement] Done. Found ${deduplicated.length} transactions across ${numPages} pages.`);

    return {
      transactions: deduplicated,
      numPages,
      totalFound: deduplicated.length,
    };
  },
};
