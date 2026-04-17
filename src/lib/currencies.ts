export interface Currency {
  code: string
  name: string
  symbol: string
  locale: string // primary locale for formatting
  decimals: number
}

// Comprehensive list of world currencies with formatting info
export const CURRENCIES: Currency[] = [
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", locale: "id-ID", decimals: 0 },
  { code: "USD", name: "US Dollar", symbol: "$", locale: "en-US", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", locale: "de-DE", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", locale: "en-GB", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", locale: "ja-JP", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", locale: "zh-CN", decimals: 2 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", locale: "ko-KR", decimals: 0 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", locale: "en-IN", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", locale: "en-AU", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", locale: "en-CA", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", locale: "en-SG", decimals: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", locale: "en-HK", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", locale: "en-NZ", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", locale: "de-CH", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", locale: "sv-SE", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", locale: "nb-NO", decimals: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", locale: "da-DK", decimals: 2 },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", locale: "pl-PL", decimals: 2 },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", locale: "cs-CZ", decimals: 2 },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", locale: "hu-HU", decimals: 0 },
  { code: "RON", name: "Romanian Leu", symbol: "lei", locale: "ro-RO", decimals: 2 },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", locale: "bg-BG", decimals: 2 },
  { code: "HRK", name: "Croatian Kuna", symbol: "kn", locale: "hr-HR", decimals: 2 },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", locale: "ru-RU", decimals: 2 },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴", locale: "uk-UA", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", locale: "tr-TR", decimals: 2 },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪", locale: "he-IL", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", locale: "ar-AE", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", locale: "ar-SA", decimals: 2 },
  { code: "QAR", name: "Qatari Riyal", symbol: "﷼", locale: "ar-QA", decimals: 2 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك", locale: "ar-KW", decimals: 3 },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD", locale: "ar-BH", decimals: 3 },
  { code: "OMR", name: "Omani Rial", symbol: "﷼", locale: "ar-OM", decimals: 3 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", locale: "ar-EG", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", locale: "en-ZA", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", locale: "en-NG", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", locale: "en-KE", decimals: 2 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", locale: "en-GH", decimals: 2 },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", locale: "ar-MA", decimals: 2 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", locale: "sw-TZ", decimals: 0 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", locale: "en-UG", decimals: 0 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", locale: "pt-BR", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", locale: "es-MX", decimals: 2 },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$", locale: "es-AR", decimals: 2 },
  { code: "CLP", name: "Chilean Peso", symbol: "CL$", locale: "es-CL", decimals: 0 },
  { code: "COP", name: "Colombian Peso", symbol: "CO$", locale: "es-CO", decimals: 0 },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/", locale: "es-PE", decimals: 2 },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U", locale: "es-UY", decimals: 2 },
  { code: "VES", name: "Venezuelan Bolivar", symbol: "Bs", locale: "es-VE", decimals: 2 },
  { code: "THB", name: "Thai Baht", symbol: "฿", locale: "th-TH", decimals: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", locale: "ms-MY", decimals: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", locale: "en-PH", decimals: 2 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", locale: "vi-VN", decimals: 0 },
  { code: "TWD", name: "Taiwan Dollar", symbol: "NT$", locale: "zh-TW", decimals: 0 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", locale: "ur-PK", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", locale: "bn-BD", decimals: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", locale: "si-LK", decimals: 2 },
  { code: "MMK", name: "Myanmar Kyat", symbol: "K", locale: "my-MM", decimals: 0 },
  { code: "KHR", name: "Cambodian Riel", symbol: "៛", locale: "km-KH", decimals: 0 },
  { code: "LAK", name: "Lao Kip", symbol: "₭", locale: "lo-LA", decimals: 0 },
  { code: "NPR", name: "Nepalese Rupee", symbol: "Rs", locale: "ne-NP", decimals: 2 },
  { code: "ISK", name: "Icelandic Krona", symbol: "kr", locale: "is-IS", decimals: 0 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD", locale: "ar-JO", decimals: 3 },
  { code: "LBP", name: "Lebanese Pound", symbol: "L£", locale: "ar-LB", decimals: 0 },
  { code: "GEL", name: "Georgian Lari", symbol: "₾", locale: "ka-GE", decimals: 2 },
  { code: "AMD", name: "Armenian Dram", symbol: "֏", locale: "hy-AM", decimals: 0 },
  { code: "AZN", name: "Azerbaijani Manat", symbol: "₼", locale: "az-AZ", decimals: 2 },
  { code: "KZT", name: "Kazakhstani Tenge", symbol: "₸", locale: "kk-KZ", decimals: 2 },
  { code: "UZS", name: "Uzbekistani Som", symbol: "сўм", locale: "uz-UZ", decimals: 0 },
  { code: "MNT", name: "Mongolian Tugrik", symbol: "₮", locale: "mn-MN", decimals: 0 },
  { code: "RSD", name: "Serbian Dinar", symbol: "din", locale: "sr-RS", decimals: 2 },
  { code: "BAM", name: "Bosnia Mark", symbol: "KM", locale: "bs-BA", decimals: 2 },
  { code: "MKD", name: "Macedonian Denar", symbol: "ден", locale: "mk-MK", decimals: 2 },
  { code: "ALL", name: "Albanian Lek", symbol: "L", locale: "sq-AL", decimals: 2 },
  { code: "MDL", name: "Moldovan Leu", symbol: "L", locale: "ro-MD", decimals: 2 },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br", locale: "be-BY", decimals: 2 },
  { code: "XOF", name: "West African CFA Franc", symbol: "CFA", locale: "fr-SN", decimals: 0 },
  { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA", locale: "fr-CM", decimals: 0 },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br", locale: "am-ET", decimals: 2 },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw", locale: "rw-RW", decimals: 0 },
  { code: "DZD", name: "Algerian Dinar", symbol: "د.ج", locale: "ar-DZ", decimals: 2 },
  { code: "TND", name: "Tunisian Dinar", symbol: "د.ت", locale: "ar-TN", decimals: 3 },
  { code: "LYD", name: "Libyan Dinar", symbol: "ل.د", locale: "ar-LY", decimals: 3 },
  { code: "IQD", name: "Iraqi Dinar", symbol: "ع.د", locale: "ar-IQ", decimals: 0 },
  { code: "SYP", name: "Syrian Pound", symbol: "£S", locale: "ar-SY", decimals: 0 },
  { code: "YER", name: "Yemeni Rial", symbol: "﷼", locale: "ar-YE", decimals: 0 },
  { code: "AFN", name: "Afghan Afghani", symbol: "؋", locale: "ps-AF", decimals: 2 },
  { code: "IRR", name: "Iranian Rial", symbol: "﷼", locale: "fa-IR", decimals: 0 },
  { code: "MUR", name: "Mauritian Rupee", symbol: "₨", locale: "en-MU", decimals: 2 },
  { code: "SCR", name: "Seychellois Rupee", symbol: "₨", locale: "en-SC", decimals: 2 },
  { code: "MVR", name: "Maldivian Rufiyaa", symbol: "Rf", locale: "dv-MV", decimals: 2 },
  { code: "FJD", name: "Fijian Dollar", symbol: "FJ$", locale: "en-FJ", decimals: 2 },
  { code: "PGK", name: "Papua New Guinean Kina", symbol: "K", locale: "en-PG", decimals: 2 },
  { code: "WST", name: "Samoan Tala", symbol: "T", locale: "sm-WS", decimals: 2 },
  { code: "TOP", name: "Tongan Pa'anga", symbol: "T$", locale: "to-TO", decimals: 2 },
  { code: "CRC", name: "Costa Rican Colon", symbol: "₡", locale: "es-CR", decimals: 0 },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$", locale: "es-DO", decimals: 2 },
  { code: "GTQ", name: "Guatemalan Quetzal", symbol: "Q", locale: "es-GT", decimals: 2 },
  { code: "HNL", name: "Honduran Lempira", symbol: "L", locale: "es-HN", decimals: 2 },
  { code: "NIO", name: "Nicaraguan Cordoba", symbol: "C$", locale: "es-NI", decimals: 2 },
  { code: "PAB", name: "Panamanian Balboa", symbol: "B/.", locale: "es-PA", decimals: 2 },
  { code: "PYG", name: "Paraguayan Guarani", symbol: "₲", locale: "es-PY", decimals: 0 },
  { code: "BOB", name: "Bolivian Boliviano", symbol: "Bs.", locale: "es-BO", decimals: 2 },
  { code: "TTD", name: "Trinidad Dollar", symbol: "TT$", locale: "en-TT", decimals: 2 },
  { code: "JMD", name: "Jamaican Dollar", symbol: "J$", locale: "en-JM", decimals: 2 },
  { code: "BBD", name: "Barbadian Dollar", symbol: "Bds$", locale: "en-BB", decimals: 2 },
  { code: "BSD", name: "Bahamian Dollar", symbol: "B$", locale: "en-BS", decimals: 2 },
  { code: "BMD", name: "Bermudian Dollar", symbol: "BD$", locale: "en-BM", decimals: 2 },
  { code: "KYD", name: "Cayman Islands Dollar", symbol: "CI$", locale: "en-KY", decimals: 2 },
  { code: "XCD", name: "East Caribbean Dollar", symbol: "EC$", locale: "en-AG", decimals: 2 },
  { code: "AWG", name: "Aruban Florin", symbol: "Afl.", locale: "nl-AW", decimals: 2 },
  { code: "ANG", name: "Netherlands Antillean Guilder", symbol: "NAƒ", locale: "nl-CW", decimals: 2 },
  { code: "HTG", name: "Haitian Gourde", symbol: "G", locale: "fr-HT", decimals: 2 },
  { code: "CUP", name: "Cuban Peso", symbol: "$MN", locale: "es-CU", decimals: 2 },
  { code: "BZD", name: "Belize Dollar", symbol: "BZ$", locale: "en-BZ", decimals: 2 },
  { code: "SRD", name: "Surinamese Dollar", symbol: "SRD", locale: "nl-SR", decimals: 2 },
  { code: "GYD", name: "Guyanese Dollar", symbol: "G$", locale: "en-GY", decimals: 0 },
  { code: "FKP", name: "Falkland Islands Pound", symbol: "FK£", locale: "en-FK", decimals: 2 },
  { code: "BWP", name: "Botswana Pula", symbol: "P", locale: "en-BW", decimals: 2 },
  { code: "NAD", name: "Namibian Dollar", symbol: "N$", locale: "en-NA", decimals: 2 },
  { code: "SZL", name: "Swazi Lilangeni", symbol: "L", locale: "en-SZ", decimals: 2 },
  { code: "LSL", name: "Lesotho Loti", symbol: "L", locale: "en-LS", decimals: 2 },
  { code: "MWK", name: "Malawian Kwacha", symbol: "MK", locale: "en-MW", decimals: 2 },
  { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK", locale: "en-ZM", decimals: 2 },
  { code: "MZN", name: "Mozambican Metical", symbol: "MT", locale: "pt-MZ", decimals: 2 },
  { code: "AOA", name: "Angolan Kwanza", symbol: "Kz", locale: "pt-AO", decimals: 2 },
  { code: "CDF", name: "Congolese Franc", symbol: "FC", locale: "fr-CD", decimals: 2 },
  { code: "BIF", name: "Burundian Franc", symbol: "FBu", locale: "fr-BI", decimals: 0 },
  { code: "DJF", name: "Djiboutian Franc", symbol: "Fdj", locale: "fr-DJ", decimals: 0 },
  { code: "ERN", name: "Eritrean Nakfa", symbol: "Nfk", locale: "ti-ER", decimals: 2 },
  { code: "GMD", name: "Gambian Dalasi", symbol: "D", locale: "en-GM", decimals: 2 },
  { code: "GNF", name: "Guinean Franc", symbol: "FG", locale: "fr-GN", decimals: 0 },
  { code: "KMF", name: "Comorian Franc", symbol: "CF", locale: "fr-KM", decimals: 0 },
  { code: "LRD", name: "Liberian Dollar", symbol: "L$", locale: "en-LR", decimals: 2 },
  { code: "MGA", name: "Malagasy Ariary", symbol: "Ar", locale: "mg-MG", decimals: 0 },
  { code: "SLL", name: "Sierra Leonean Leone", symbol: "Le", locale: "en-SL", decimals: 0 },
  { code: "SOS", name: "Somali Shilling", symbol: "Sh", locale: "so-SO", decimals: 0 },
  { code: "SDG", name: "Sudanese Pound", symbol: "£SD", locale: "ar-SD", decimals: 2 },
  { code: "SSP", name: "South Sudanese Pound", symbol: "SS£", locale: "en-SS", decimals: 2 },
  { code: "STN", name: "Sao Tome Dobra", symbol: "Db", locale: "pt-ST", decimals: 2 },
  { code: "CVE", name: "Cape Verdean Escudo", symbol: "Esc", locale: "pt-CV", decimals: 2 },
  { code: "ZWL", name: "Zimbabwean Dollar", symbol: "Z$", locale: "en-ZW", decimals: 2 },
]

export const CURRENCY_MAP = new Map(CURRENCIES.map((c) => [c.code, c]))

/**
 * Format a number according to the currency's locale convention.
 * Uses the currency's locale for decimal separator (comma vs dot) and grouping.
 */
export function formatCurrencyAmount(
  amount: number,
  currencyCode: string
): string {
  const currency = CURRENCY_MAP.get(currencyCode)
  if (!currency) {
    return amount.toFixed(2)
  }

  try {
    return new Intl.NumberFormat(currency.locale, {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
      useGrouping: true,
    }).format(amount)
  } catch {
    return amount.toFixed(currency.decimals)
  }
}

/**
 * Format with currency symbol.
 */
export function formatCurrencyFull(
  amount: number,
  currencyCode: string
): string {
  const currency = CURRENCY_MAP.get(currencyCode)
  if (!currency) {
    return `${currencyCode} ${amount.toFixed(2)}`
  }

  try {
    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    }).format(amount)
  } catch {
    return `${currency.symbol}${amount.toFixed(currency.decimals)}`
  }
}

/**
 * Get the decimal separator for a currency (e.g., "." for USD, "," for EUR).
 */
export function getDecimalSeparator(currencyCode: string): string {
  const currency = CURRENCY_MAP.get(currencyCode)
  if (!currency) return "."
  const formatted = new Intl.NumberFormat(currency.locale).format(1.1)
  return formatted.charAt(1) // the char between "1" and "1"
}

/**
 * Parse a locale-formatted number string back to a number.
 * Handles both comma and dot as decimal separators.
 */
export function parseCurrencyInput(input: string, currencyCode: string): number {
  const sep = getDecimalSeparator(currencyCode)
  let cleaned = input.replace(/[^\d.,\-]/g, "")
  if (sep === ",") {
    // European style: 1.234,56 -> remove dots (grouping), replace comma with dot
    cleaned = cleaned.replace(/\./g, "").replace(",", ".")
  } else {
    // US style: 1,234.56 -> remove commas (grouping)
    cleaned = cleaned.replace(/,/g, "")
  }
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}
