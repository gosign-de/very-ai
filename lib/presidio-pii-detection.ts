import type { PiiDetectionResult, PiiEntity } from "./azure-pii-detection";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/presidio-pii-detection" });

const DEFAULT_LANGUAGE = "en";

const PRESIDIO_ENTITY_TYPES = new Set<string>([
  "PERSON",
  "PERSON_FIRST_NAME",
  "PERSON_LAST_NAME",
  "ORGANIZATION",
  "LOCATION",
  "EMAIL_ADDRESS",
  "PHONE_NUMBER",
  "IP_ADDRESS",
  "URL",
  "CREDIT_CARD",
  "CRYPTO",
  "IBAN_CODE",
  "US_BANK_NUMBER",
  "US_BANK_ROUTING",
  "PASSPORT",
  "US_PASSPORT",
  "US_DRIVER_LICENSE",
  "US_LICENSE_PLATE",
  "US_SSN",
  "US_ITIN",
  "DATE_TIME",
]);

const CATEGORY_TO_PRESIDIO_MAP: Record<string, string[]> = {
  person: ["PERSON", "PERSON_FIRST_NAME", "PERSON_LAST_NAME"],
  date: ["DATE_TIME"],
  dateofbirth: ["DATE_TIME"],
  email: ["EMAIL_ADDRESS"],
  phonenumber: ["PHONE_NUMBER"],
  url: ["URL"],
  address: ["LOCATION"],
  ipaddress: ["IP_ADDRESS"],
  organization: ["ORGANIZATION"],
  creditcardnumber: ["CREDIT_CARD"],
  bankaccountnumber: ["US_BANK_NUMBER"],
  abaroutingnumber: ["US_BANK_ROUTING"],
  internationalbankingaccountnumber: ["IBAN_CODE"],
  driverslicensenumber: ["US_DRIVER_LICENSE"],
  usdriverslicensenumber: ["US_DRIVER_LICENSE"],
  passportnumber: ["PASSPORT", "US_PASSPORT"],
  usukpassportnumber: ["US_PASSPORT"],
  licenseplate: ["US_LICENSE_PLATE"],
  ussocialsecuritynumber: ["US_SSN"],
  usindividualtaxpayeridentification: ["US_ITIN"],
  cryptoaddress: ["CRYPTO"],
};

type PresidioAnalyzerResult = {
  start: number;
  end: number;
  score: number;
  entity_type: string;
  text?: string;
  analysis_explanation?: Record<string, unknown>;
};

type PresidioAnonymizerResponse = {
  text?: string;
};

function sanitizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function normalizeCategoryKey(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapCategoriesToPresidio(categories?: string[]): string[] | undefined {
  if (!categories || categories.length === 0) {
    return undefined;
  }

  const mapped = new Set<string>();

  for (const category of categories) {
    if (!category) continue;

    const direct = category.toUpperCase();
    if (PRESIDIO_ENTITY_TYPES.has(direct)) {
      mapped.add(direct);
      continue;
    }

    const normalizedKey = normalizeCategoryKey(category);
    const results = CATEGORY_TO_PRESIDIO_MAP[normalizedKey];
    if (results && results.length > 0) {
      results.forEach(result => mapped.add(result));
    }
  }

  if (mapped.size === 0) {
    return undefined;
  }

  return Array.from(mapped);
}

function mapPresidioEntityType(entityType: string): {
  category: string;
  subcategory?: string;
} {
  const mapping: Record<string, { category: string; subcategory?: string }> = {
    PERSON: { category: "Person" },
    PERSON_FIRST_NAME: { category: "Person", subcategory: "PERSON_FIRST_NAME" },
    PERSON_LAST_NAME: { category: "Person", subcategory: "PERSON_LAST_NAME" },
    NRP: { category: "Person", subcategory: "NRP" },
    ORGANIZATION: { category: "Organization" },
    LOCATION: { category: "Address", subcategory: "LOCATION" },
    EMAIL_ADDRESS: { category: "Email" },
    PHONE_NUMBER: { category: "PhoneNumber" },
    IP_ADDRESS: { category: "IPAddress" },
    URL: { category: "URL" },
    CREDIT_CARD: { category: "CreditCardNumber" },
    CRYPTO: { category: "CryptoAddress", subcategory: "CRYPTO" },
    IBAN_CODE: { category: "InternationalBankingAccountNumber" },
    US_BANK_NUMBER: {
      category: "BankAccountNumber",
      subcategory: "US_BANK_NUMBER",
    },
    US_BANK_ROUTING: { category: "ABARoutingNumber" },
    PASSPORT: { category: "PassportNumber" },
    US_PASSPORT: { category: "PassportNumber", subcategory: "US_PASSPORT" },
    US_DRIVER_LICENSE: {
      category: "DriversLicenseNumber",
      subcategory: "US_DRIVER_LICENSE",
    },
    US_LICENSE_PLATE: {
      category: "LicensePlate",
      subcategory: "US_LICENSE_PLATE",
    },
    US_SSN: { category: "USSocialSecurityNumber", subcategory: "US_SSN" },
    US_ITIN: {
      category: "USIndividualTaxpayerIdentification",
      subcategory: "US_ITIN",
    },
    DATE_TIME: { category: "Date" },
  };

  return (
    mapping[entityType] ?? {
      category: entityType,
    }
  );
}

async function callPresidioAnalyzer(
  analyzerEndpoint: string,
  text: string,
  language?: string | null,
  selectedCategories?: string[],
): Promise<PresidioAnalyzerResult[]> {
  const entitiesFilter = mapCategoriesToPresidio(selectedCategories);

  const payload: Record<string, unknown> = {
    text,
    language: language || DEFAULT_LANGUAGE,
    analyzer_config: {
      language: language || DEFAULT_LANGUAGE,
      score_threshold: 0.3,
      ...(entitiesFilter && entitiesFilter.length > 0
        ? { entities: entitiesFilter }
        : {}),
    },
  };

  const response = await fetch(`${sanitizeBaseUrl(analyzerEndpoint)}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Presidio analyzer request failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as unknown;

  if (!Array.isArray(data)) {
    throw new Error("Unexpected analyzer response shape from Presidio");
  }

  return data as PresidioAnalyzerResult[];
}

async function callPresidioAnonymizer(
  anonymizerEndpoint: string,
  text: string,
  analyzerResults: PresidioAnalyzerResult[],
): Promise<string> {
  try {
    const payload = {
      text,
      analyzer_results: analyzerResults,
      anonymizers: {
        DEFAULT: {
          type: "replace",
          new_value: "[REDACTED]",
        },
      },
    };

    const response = await fetch(
      `${sanitizeBaseUrl(anonymizerEndpoint)}/anonymize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Presidio anonymizer request failed (${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json()) as PresidioAnonymizerResponse;
    return data?.text ?? text;
  } catch (error) {
    logger.error("Anonymizer error, falling back to original text", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return text;
  }
}

function mapAnalyzerResultsToPiiEntities(
  text: string,
  results: PresidioAnalyzerResult[],
): PiiEntity[] {
  return results.map(result => {
    const { category, subcategory } = mapPresidioEntityType(result.entity_type);
    const entityText = text.slice(result.start, result.end);

    return {
      text: entityText,
      category,
      subcategory,
      confidenceScore: result.score ?? 0,
      offset: result.start,
      length: result.end - result.start,
    };
  });
}

export async function detectAndRedactPii(
  text: string,
  language?: string | null,
  piiCategories?: string[],
): Promise<PiiDetectionResult> {
  const analyzerEndpoint = process.env.PRESIDIO_ANALYZER_ENDPOINT;
  const anonymizerEndpoint = process.env.PRESIDIO_ANONYMIZER_ENDPOINT;

  if (!analyzerEndpoint || !anonymizerEndpoint) {
    throw new Error(
      "Presidio detection is not configured. Please set PRESIDIO_ANALYZER_ENDPOINT and PRESIDIO_ANONYMIZER_ENDPOINT.",
    );
  }

  const analyzerResults = await callPresidioAnalyzer(
    analyzerEndpoint,
    text,
    language,
    piiCategories,
  );

  const piiEntities = mapAnalyzerResultsToPiiEntities(text, analyzerResults);

  const redactedText = await callPresidioAnonymizer(
    anonymizerEndpoint,
    text,
    analyzerResults,
  );

  return {
    originalText: text,
    redactedText,
    entities: piiEntities,
  };
}

export async function detectAndRedactPiiBatch(
  texts: string[],
  language?: string | null,
  piiCategories?: string[],
): Promise<PiiDetectionResult[]> {
  return Promise.all(
    texts.map(text => detectAndRedactPii(text, language, piiCategories)),
  );
}
