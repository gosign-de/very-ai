/**
 * Unicode Character Mapping Utility
 * Maps Unicode mathematical symbols and special characters to ASCII equivalents
 * for PDF generation fallback when Unicode fonts are not available
 */

export const UNICODE_CHARACTER_MAP: Record<string, string> = {
  // Mathematical symbols
  "≤": "<=",
  "≥": ">=",
  "±": "+/-",
  "∓": "-+",
  "×": "x",
  "÷": "/",
  "≠": "!=",
  "≈": "~=",
  "≡": "==",
  "≪": "<<",
  "≫": ">>",
  "∝": "proportional to",
  "∼": "~",
  "≅": "approximately equal",
  "√": "sqrt",
  "∛": "cuberoot",
  "∜": "fourthroot",
  "∞": "infinity",
  "∫": "integral",
  "∬": "double integral",
  "∭": "triple integral",
  "∮": "contour integral",
  "∯": "surface integral",
  "∰": "volume integral",
  ħ: "h",
  "∑": "sum",
  "∏": "product",
  "∐": "coproduct",
  "∇": "del",
  "∂": "partial",
  "‴": '""',
  "⁗": '""""',
  ℝ: "R",

  // Checkmarks (WinAnsi unsupported)
  "✓": "check", // Common checkmark ✅
  "✔": "check",
  "✗": "x", // Cross ✗
  "✘": "x", // Cross ✘

  // Subscripts
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  ₖ: "k",

  // Superscripts
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
  "⁼": "=",
  "⁽": "(",
  "⁾": ")",

  // Modifier letters / subscript letters
  ᵢ: "i", // small i
  ᵣ: "r", // small r
  ᵤ: "u", // small u
  ᵥ: "v", // small v
  ᵦ: "beta", // Greek small beta subscript
  ᵧ: "gamma", // Greek small gamma subscript
  ᵨ: "rho", // Greek small rho subscript
  ᵩ: "phi", // Greek small phi subscript
  ᵪ: "chi", // Greek small chi subscript

  // Greek letters (common mathematical)
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  ζ: "zeta",
  η: "eta",
  θ: "theta",
  ι: "iota",
  κ: "kappa",
  λ: "lambda",
  μ: "mu",
  ν: "nu",
  ξ: "xi",
  ο: "omicron",
  π: "pi",
  ρ: "rho",
  σ: "sigma",
  τ: "tau",
  υ: "upsilon",
  φ: "phi",
  χ: "chi",
  ψ: "psi",
  ω: "omega",

  // Uppercase Greek
  Α: "Alpha",
  Β: "Beta",
  Γ: "Gamma",
  Δ: "Delta",
  "△": "^",
  Ε: "Epsilon",
  Ζ: "Zeta",
  Η: "Eta",
  Θ: "Theta",
  Ι: "Iota",
  Κ: "Kappa",
  Λ: "Lambda",
  Μ: "Mu",
  Ν: "Nu",
  Ξ: "Xi",
  Ο: "Omicron",
  Π: "Pi",
  Ρ: "Rho",
  Σ: "Sigma",
  Τ: "Tau",
  Υ: "Upsilon",
  Φ: "Phi",
  Χ: "Chi",
  Ψ: "Psi",
  Ω: "Omega",

  // Set theory symbols
  "∈": "in",
  "∉": "not in",
  "∋": "contains",
  "∌": "does not contain",
  "⊂": "subset of",
  "⊃": "superset of",
  "⊆": "subset or equal",
  "⊇": "superset or equal",
  "∪": "union",
  "∩": "intersection",
  "∅": "empty set",

  // Logic symbols
  "∧": "and",
  "∨": "or",
  "¬": "not",
  "∀": "for all",
  "∃": "there exists",
  "∄": "there does not exist",
  "∴": "therefore",
  "∵": "because",

  // Arrows
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "↑": "up",
  "↓": "down",
  "↗": "up-right",
  "↖": "up-left",
  "↘": "down-right",
  "↙": "down-left",

  // Miscellaneous symbols
  "°": "deg",
  "′": "min",
  "″": "sec",
  "℃": "C",
  "℉": "F",
  "‰": "per mille",
  "‱": "per ten thousand",

  // Common Unicode punctuation
  "–": "-", // en dash
  "—": "-", // em dash
  "…": "...", // ellipsis
  "‚": ",", // single low-9 quotation mark
  "„": '"', // double low-9 quotation mark
  "‹": "<",
  "›": ">",
  "«": "<<",
  "»": ">>",
};

/**
 * Additional problematic characters handled separately
 */
const ADDITIONAL_UNICODE_MAP: Record<string, string> = {
  "\u2018": "'", // Left single quotation mark
  "\u2019": "'", // Right single quotation mark
  "\u201C": '"', // Left double quotation mark
  "\u201D": '"', // Right double quotation mark
  "\u201A": "'", // Single low-9 quotation mark
  "\u201E": '"', // Double low-9 quotation mark
};

/**
 * Sanitizes text for PDF generation by replacing Unicode characters
 * with ASCII equivalents when Unicode fonts are not available
 */
export function sanitizeTextForPdf(text: string): string {
  if (!text) return text;

  let sanitized = text;

  // Replace Unicode characters with ASCII equivalents
  for (const [unicodeChar, asciiReplacement] of Object.entries(
    UNICODE_CHARACTER_MAP,
  )) {
    sanitized = sanitized.replace(
      new RegExp(unicodeChar, "g"),
      asciiReplacement,
    );
  }

  // Handle additional problematic characters
  for (const [unicodeChar, asciiReplacement] of Object.entries(
    ADDITIONAL_UNICODE_MAP,
  )) {
    sanitized = sanitized.replace(
      new RegExp(unicodeChar, "g"),
      asciiReplacement,
    );
  }

  return sanitized;
}

/**
 * Checks if text contains any Unicode characters that might cause encoding issues
 */
export function containsUnicodeCharacters(text: string): boolean {
  if (!text) return false;

  // Check main mapping
  for (const unicodeChar of Object.keys(UNICODE_CHARACTER_MAP)) {
    if (text.includes(unicodeChar)) {
      return true;
    }
  }

  // Check additional mapping
  for (const unicodeChar of Object.keys(ADDITIONAL_UNICODE_MAP)) {
    if (text.includes(unicodeChar)) {
      return true;
    }
  }

  return false;
}

/**
 * Gets statistics about Unicode characters in text
 */
export function getUnicodeStats(text: string): {
  total: number;
  unique: Set<string>;
} {
  const found = new Set<string>();

  // Check main mapping
  for (const unicodeChar of Object.keys(UNICODE_CHARACTER_MAP)) {
    if (text.includes(unicodeChar)) {
      found.add(unicodeChar);
    }
  }

  // Check additional mapping
  for (const unicodeChar of Object.keys(ADDITIONAL_UNICODE_MAP)) {
    if (text.includes(unicodeChar)) {
      found.add(unicodeChar);
    }
  }

  return {
    total: Array.from(found).length,
    unique: found,
  };
}
