/**
 * Azure AI Language Service PII Entity Categories
 * Reference: https://learn.microsoft.com/en-us/azure/ai-services/language-service/personally-identifiable-information/concepts/entity-categories
 * Last updated: 2025
 */

export interface PiiCategory {
  value: string; // The actual category value sent to the detection engine
  label: string; // Display name
  description: string; // Description of what this category detects
  group:
    | "personal"
    | "identification"
    | "financial"
    | "medical"
    | "location"
    | "organization"
    | "security";
}

export const PII_CATEGORY_GROUPS = [
  "personal",
  "identification",
  "financial",
  "medical",
  "location",
  "organization",
  "security",
] as const;

export type PiiCategoryGroup = (typeof PII_CATEGORY_GROUPS)[number];

export const PII_CATEGORIES: PiiCategory[] = [
  // ==================== GENERAL/INTERNATIONAL CATEGORIES ====================
  {
    value: "Person",
    label: "Person Name",
    description: "Full names, first names, last names",
    group: "personal",
  },
  {
    value: "Age",
    label: "Age",
    description: "Numerical age of a person",
    group: "personal",
  },
  {
    value: "Date",
    label: "Date",
    description: "General dates",
    group: "personal",
  },
  {
    value: "DateOfBirth",
    label: "Date of Birth",
    description: "Specific birth dates (preview)",
    group: "personal",
  },
  {
    value: "Email",
    label: "Email Address",
    description: "Email addresses",
    group: "personal",
  },
  {
    value: "PhoneNumber",
    label: "Phone Number",
    description: "Telephone contact numbers",
    group: "personal",
  },
  {
    value: "Address",
    label: "Physical Address",
    description: "Physical addresses, street addresses, mailing addresses",
    group: "location",
  },
  {
    value: "IPAddress",
    label: "IP Address",
    description: "IPv4 and IPv6 network addresses",
    group: "location",
  },
  {
    value: "URL",
    label: "URL/Website",
    description: "Web addresses and website URLs",
    group: "personal",
  },
  {
    value: "Organization",
    label: "Organization Name",
    description: "Company and organization names",
    group: "organization",
  },

  // ==================== GENERAL IDENTIFICATION (PREVIEW) ====================
  {
    value: "DriversLicenseNumber",
    label: "Driver's License",
    description: "General driver's license numbers (preview)",
    group: "identification",
  },
  {
    value: "PassportNumber",
    label: "Passport Number",
    description: "General passport numbers (preview)",
    group: "identification",
  },
  {
    value: "LicensePlate",
    label: "License Plate",
    description: "Vehicle registration plates (preview)",
    group: "identification",
  },

  // ==================== FINANCIAL CATEGORIES ====================
  {
    value: "CreditCardNumber",
    label: "Credit Card Number",
    description: "Credit and debit card numbers",
    group: "financial",
  },
  {
    value: "BankAccountNumber",
    label: "Bank Account Number",
    description: "General bank account numbers (preview)",
    group: "financial",
  },
  {
    value: "ABARoutingNumber",
    label: "ABA Routing Number",
    description: "US ABA routing transit numbers",
    group: "financial",
  },
  {
    value: "InternationalBankingAccountNumber",
    label: "IBAN",
    description: "International Bank Account Numbers",
    group: "financial",
  },
  {
    value: "SWIFTCode",
    label: "SWIFT Code",
    description: "SWIFT bank identifier codes",
    group: "financial",
  },
  {
    value: "SortCode",
    label: "Sort Code",
    description: "UK bank sort codes (preview)",
    group: "financial",
  },

  // ==================== AZURE/SECURITY CATEGORIES ====================
  {
    value: "AzureDocumentDBAuthKey",
    label: "Azure DocumentDB Auth Key",
    description: "Azure DocumentDB authentication keys",
    group: "security",
  },
  {
    value: "AzureIAASDatabaseConnectionAndSQLString",
    label: "Azure IAAS Database Connection",
    description: "Azure IAAS database connection strings",
    group: "security",
  },
  {
    value: "AzureIoTConnectionString",
    label: "Azure IoT Connection String",
    description: "Azure IoT connection strings",
    group: "security",
  },
  {
    value: "AzurePublishSettingPassword",
    label: "Azure Publish Setting Password",
    description: "Azure publish setting passwords",
    group: "security",
  },
  {
    value: "AzureRedisCacheString",
    label: "Azure Redis Cache String",
    description: "Azure Redis cache connection strings",
    group: "security",
  },
  {
    value: "AzureSAS",
    label: "Azure SAS",
    description: "Azure Shared Access Signatures",
    group: "security",
  },
  {
    value: "AzureServiceBusString",
    label: "Azure Service Bus String",
    description: "Azure Service Bus connection strings",
    group: "security",
  },
  {
    value: "AzureStorageAccountGeneric",
    label: "Azure Storage Account",
    description: "Azure storage account information",
    group: "security",
  },
  {
    value: "AzureStorageAccountKey",
    label: "Azure Storage Account Key",
    description: "Azure storage account keys",
    group: "security",
  },
  {
    value: "SQLServerConnectionString",
    label: "SQL Server Connection String",
    description: "SQL Server connection strings",
    group: "security",
  },

  // ==================== EUROPEAN UNION ====================
  {
    value: "EUDebitCardNumber",
    label: "EU Debit Card",
    description: "EU debit card numbers",
    group: "financial",
  },
  {
    value: "EUDriversLicenseNumber",
    label: "EU Driver's License",
    description: "European Union driver's license numbers",
    group: "identification",
  },
  {
    value: "EUGPSCoordinates",
    label: "EU GPS Coordinates",
    description: "GPS coordinates within EU",
    group: "location",
  },
  {
    value: "EUNationalIdentificationNumber",
    label: "EU National ID",
    description: "EU national identification numbers",
    group: "identification",
  },
  {
    value: "EUPassportNumber",
    label: "EU Passport",
    description: "European Union passport numbers",
    group: "identification",
  },
  {
    value: "EUSocialSecurityNumber",
    label: "EU Social Security Number",
    description: "EU social security numbers",
    group: "identification",
  },
  {
    value: "EUTaxIdentificationNumber",
    label: "EU Tax ID",
    description: "EU tax identification numbers",
    group: "identification",
  },

  // ==================== UNITED STATES ====================
  {
    value: "USSocialSecurityNumber",
    label: "US Social Security Number",
    description: "US Social Security Numbers (SSN)",
    group: "identification",
  },
  {
    value: "USIndividualTaxpayerIdentification",
    label: "US Tax ID (ITIN)",
    description: "US Individual Taxpayer Identification Number",
    group: "identification",
  },
  {
    value: "USDriversLicenseNumber",
    label: "US Driver's License",
    description: "US driver's license numbers",
    group: "identification",
  },
  {
    value: "USBankAccountNumber",
    label: "US Bank Account Number",
    description: "US bank account numbers",
    group: "financial",
  },
  {
    value: "USUKPassportNumber",
    label: "US/UK Passport",
    description: "US and UK passport numbers",
    group: "identification",
  },
  {
    value: "DrugEnforcementAgencyNumber",
    label: "DEA Number",
    description: "US Drug Enforcement Agency numbers",
    group: "medical",
  },

  // ==================== UNITED KINGDOM ====================
  {
    value: "UKDriversLicenseNumber",
    label: "UK Driver's License",
    description: "UK driver's license numbers",
    group: "identification",
  },
  {
    value: "UKElectoralRollNumber",
    label: "UK Electoral Roll Number",
    description: "UK electoral roll numbers",
    group: "identification",
  },
  {
    value: "UKNationalHealthNumber",
    label: "UK NHS Number",
    description: "UK National Health Service numbers",
    group: "medical",
  },
  {
    value: "UKNationalInsuranceNumber",
    label: "UK National Insurance",
    description: "UK National Insurance numbers",
    group: "identification",
  },
  {
    value: "UKUniqueTaxpayerNumber",
    label: "UK Unique Taxpayer Number",
    description: "UK unique taxpayer reference numbers",
    group: "identification",
  },

  // ==================== CANADA ====================
  {
    value: "CABankAccountNumber",
    label: "Canadian Bank Account",
    description: "Canadian bank account numbers",
    group: "financial",
  },
  {
    value: "CADriversLicenseNumber",
    label: "Canadian Driver's License",
    description: "Canadian driver's license numbers",
    group: "identification",
  },
  {
    value: "CAHealthServiceNumber",
    label: "Canadian Health Number",
    description: "Canadian health service numbers",
    group: "medical",
  },
  {
    value: "CAPassportNumber",
    label: "Canadian Passport",
    description: "Canadian passport numbers",
    group: "identification",
  },
  {
    value: "CAPersonalHealthIdentification",
    label: "Canadian Personal Health ID",
    description: "Canadian personal health identification",
    group: "medical",
  },
  {
    value: "CASocialInsuranceNumber",
    label: "Canadian SIN",
    description: "Canadian Social Insurance Numbers",
    group: "identification",
  },

  // ==================== AUSTRALIA ====================
  {
    value: "AUBankAccountNumber",
    label: "Australian Bank Account",
    description: "Australian bank account numbers",
    group: "financial",
  },
  {
    value: "AUBusinessNumber",
    label: "Australian Business Number",
    description: "Australian Business Numbers (ABN)",
    group: "identification",
  },
  {
    value: "AUCompanyNumber",
    label: "Australian Company Number",
    description: "Australian Company Numbers (ACN)",
    group: "identification",
  },
  {
    value: "AUDriversLicenseNumber",
    label: "Australian Driver's License",
    description: "Australian driver's license numbers",
    group: "identification",
  },
  {
    value: "AUMedicalAccountNumber",
    label: "Australian Medical Account",
    description: "Australian medical account numbers",
    group: "medical",
  },
  {
    value: "AUPassportNumber",
    label: "Australian Passport",
    description: "Australian passport numbers",
    group: "identification",
  },
  {
    value: "AUTaxFileNumber",
    label: "Australian Tax File Number",
    description: "Australian Tax File Numbers (TFN)",
    group: "identification",
  },

  // ==================== GERMANY ====================
  {
    value: "DEDriversLicenseNumber",
    label: "German Driver's License",
    description: "German driver's license numbers",
    group: "identification",
  },
  {
    value: "DEIdentityCardNumber",
    label: "German Identity Card",
    description: "German identity card numbers",
    group: "identification",
  },
  {
    value: "DEPassportNumber",
    label: "German Passport",
    description: "German passport numbers",
    group: "identification",
  },
  {
    value: "DETaxIdentificationNumber",
    label: "German Tax ID",
    description: "German tax identification numbers",
    group: "identification",
  },
  {
    value: "DEValueAddedNumber",
    label: "German VAT Number",
    description: "German Value Added Tax numbers",
    group: "identification",
  },

  // ==================== FRANCE ====================
  {
    value: "FRDriversLicenseNumber",
    label: "French Driver's License",
    description: "French driver's license numbers",
    group: "identification",
  },
  {
    value: "FRHealthInsuranceNumber",
    label: "French Health Insurance",
    description: "French health insurance numbers",
    group: "medical",
  },
  {
    value: "FRNationalID",
    label: "French National ID",
    description: "French national ID cards",
    group: "identification",
  },
  {
    value: "FRPassportNumber",
    label: "French Passport",
    description: "French passport numbers",
    group: "identification",
  },
  {
    value: "FRSocialSecurityNumber",
    label: "French Social Security",
    description: "French social security numbers",
    group: "identification",
  },
  {
    value: "FRTaxIdentificationNumber",
    label: "French Tax ID",
    description: "French tax identification numbers",
    group: "identification",
  },
  {
    value: "FRValueAddedTaxNumber",
    label: "French VAT Number",
    description: "French VAT numbers",
    group: "identification",
  },

  // ==================== SPAIN ====================
  {
    value: "ESDNI",
    label: "Spanish DNI",
    description: "Spanish National Identity Document",
    group: "identification",
  },
  {
    value: "ESSocialSecurityNumber",
    label: "Spanish Social Security",
    description: "Spanish social security numbers",
    group: "identification",
  },
  {
    value: "ESTaxIdentificationNumber",
    label: "Spanish Tax ID",
    description: "Spanish tax identification numbers",
    group: "identification",
  },

  // ==================== ITALY ====================
  {
    value: "ITDriversLicenseNumber",
    label: "Italian Driver's License",
    description: "Italian driver's license numbers",
    group: "identification",
  },
  {
    value: "ITFiscalCode",
    label: "Italian Fiscal Code",
    description: "Italian fiscal codes",
    group: "identification",
  },
  {
    value: "ITValueAddedTaxNumber",
    label: "Italian VAT Number",
    description: "Italian VAT numbers",
    group: "identification",
  },

  // ==================== NETHERLANDS ====================
  {
    value: "NLCitizensServiceNumber",
    label: "Dutch BSN",
    description: "Dutch citizen service numbers (BSN)",
    group: "identification",
  },
  {
    value: "NLTaxIdentificationNumber",
    label: "Dutch Tax ID",
    description: "Dutch tax identification numbers",
    group: "identification",
  },
  {
    value: "NLValueAddedTaxNumber",
    label: "Dutch VAT Number",
    description: "Dutch VAT numbers",
    group: "identification",
  },

  // ==================== BELGIUM ====================
  {
    value: "BENationalNumber",
    label: "Belgian National Number",
    description: "Belgian national numbers",
    group: "identification",
  },
  {
    value: "BEValueAddedTaxNumber",
    label: "Belgian VAT Number",
    description: "Belgian VAT numbers",
    group: "identification",
  },

  // ==================== POLAND ====================
  {
    value: "PLIdentityCard",
    label: "Polish Identity Card",
    description: "Polish identity card numbers",
    group: "identification",
  },
  {
    value: "PLNationalID",
    label: "Polish National ID (PESEL)",
    description: "Polish national ID (PESEL)",
    group: "identification",
  },
  {
    value: "PLPassportNumber",
    label: "Polish Passport",
    description: "Polish passport numbers",
    group: "identification",
  },
  {
    value: "PLREGONNumber",
    label: "Polish REGON Number",
    description: "Polish REGON numbers",
    group: "identification",
  },
  {
    value: "PLTaxIdentificationNumber",
    label: "Polish Tax ID",
    description: "Polish tax identification numbers",
    group: "identification",
  },

  // ==================== PORTUGAL ====================
  {
    value: "PTCitizenCardNumber",
    label: "Portuguese Citizen Card",
    description: "Portuguese citizen card numbers",
    group: "identification",
  },
  {
    value: "PTTaxIdentificationNumber",
    label: "Portuguese Tax ID",
    description: "Portuguese tax identification numbers",
    group: "identification",
  },

  // ==================== SWEDEN ====================
  {
    value: "SENationalID",
    label: "Swedish National ID",
    description: "Swedish national ID numbers",
    group: "identification",
  },
  {
    value: "SEPassportNumber",
    label: "Swedish Passport",
    description: "Swedish passport numbers",
    group: "identification",
  },
  {
    value: "SETaxIdentificationNumber",
    label: "Swedish Tax ID",
    description: "Swedish tax identification numbers",
    group: "identification",
  },

  // ==================== NORWAY ====================
  {
    value: "NOIdentityNumber",
    label: "Norwegian Identity Number",
    description: "Norwegian identity numbers",
    group: "identification",
  },

  // ==================== DENMARK ====================
  {
    value: "DKPersonalIdentificationNumber",
    label: "Danish CPR",
    description: "Danish personal identification numbers (CPR)",
    group: "identification",
  },

  // ==================== FINLAND ====================
  {
    value: "FINationalID",
    label: "Finnish National ID",
    description: "Finnish national ID numbers",
    group: "identification",
  },
  {
    value: "FIPassportNumber",
    label: "Finnish Passport",
    description: "Finnish passport numbers",
    group: "identification",
  },
  {
    value: "FIEuropeanHealthNumber",
    label: "Finnish European Health Number",
    description: "Finnish European health insurance numbers",
    group: "medical",
  },

  // ==================== AUSTRIA ====================
  {
    value: "ATIdentityCard",
    label: "Austrian Identity Card",
    description: "Austrian identity card numbers",
    group: "identification",
  },
  {
    value: "ATTaxIdentificationNumber",
    label: "Austrian Tax ID",
    description: "Austrian tax identification numbers",
    group: "identification",
  },
  {
    value: "ATValueAddedTaxNumber",
    label: "Austrian VAT Number",
    description: "Austrian VAT numbers",
    group: "identification",
  },

  // ==================== SWITZERLAND ====================
  {
    value: "CHSocialSecurityNumber",
    label: "Swiss Social Security (AHV)",
    description: "Swiss social security numbers (AHV)",
    group: "identification",
  },

  // ==================== IRELAND ====================
  {
    value: "IEPersonalPublicServiceNumber",
    label: "Irish PPS Number",
    description: "Irish Personal Public Service Numbers (PPS)",
    group: "identification",
  },

  // ==================== GREECE ====================
  {
    value: "GRNationalIDCard",
    label: "Greek National ID Card",
    description: "Greek national ID card numbers",
    group: "identification",
  },
  {
    value: "GRTaxIdentificationNumber",
    label: "Greek Tax ID",
    description: "Greek tax identification numbers",
    group: "identification",
  },

  // ==================== CZECH REPUBLIC ====================
  {
    value: "CZPersonalIdentityNumber",
    label: "Czech Personal Identity",
    description: "Czech personal identity numbers",
    group: "identification",
  },

  // ==================== SLOVAKIA ====================
  {
    value: "SKPersonalNumber",
    label: "Slovak Personal Number",
    description: "Slovak personal numbers",
    group: "identification",
  },

  // ==================== LATVIA ====================
  {
    value: "LVPersonalCode",
    label: "Latvian Personal Code",
    description: "Latvian personal codes",
    group: "identification",
  },

  // ==================== LITHUANIA ====================
  {
    value: "LTPersonalCode",
    label: "Lithuanian Personal Code",
    description: "Lithuanian personal codes",
    group: "identification",
  },

  // ==================== ESTONIA ====================
  {
    value: "EEPersonalIdentificationCode",
    label: "Estonian Personal ID",
    description: "Estonian personal identification codes",
    group: "identification",
  },

  // ==================== SLOVENIA ====================
  {
    value: "SITaxIdentificationNumber",
    label: "Slovenian Tax ID",
    description: "Slovenian tax identification numbers",
    group: "identification",
  },
  {
    value: "SIUniqueMasterCitizenNumber",
    label: "Slovenian Unique Master Citizen Number",
    description: "Slovenian unique master citizen numbers",
    group: "identification",
  },

  // ==================== BULGARIA ====================
  {
    value: "BGUniformCivilNumber",
    label: "Bulgarian Uniform Civil Number",
    description: "Bulgarian uniform civil numbers",
    group: "identification",
  },

  // ==================== CROATIA ====================
  {
    value: "HRIdentityCardNumber",
    label: "Croatian Identity Card",
    description: "Croatian identity card numbers",
    group: "identification",
  },
  {
    value: "HRNationalIDNumber",
    label: "Croatian National ID (OIB)",
    description: "Croatian national ID numbers (OIB)",
    group: "identification",
  },
  {
    value: "HRPersonalIdentificationNumber",
    label: "Croatian Personal ID",
    description: "Croatian personal identification numbers",
    group: "identification",
  },

  // ==================== ROMANIA ====================
  {
    value: "ROPersonalNumericalCode",
    label: "Romanian Personal Numerical Code",
    description: "Romanian personal numerical codes (CNP)",
    group: "identification",
  },

  // ==================== HUNGARY ====================
  {
    value: "HUPersonalIdentificationNumber",
    label: "Hungarian Personal ID",
    description: "Hungarian personal identification numbers",
    group: "identification",
  },
  {
    value: "HUTaxIdentificationNumber",
    label: "Hungarian Tax ID",
    description: "Hungarian tax identification numbers",
    group: "identification",
  },
  {
    value: "HUValueAddedNumber",
    label: "Hungarian VAT Number",
    description: "Hungarian VAT numbers",
    group: "identification",
  },

  // ==================== LUXEMBOURG ====================
  {
    value: "LUNationalIdentificationNumberNatural",
    label: "Luxembourg National ID (Natural)",
    description: "Luxembourg national ID for natural persons",
    group: "identification",
  },
  {
    value: "LUNationalIdentificationNumberNonNatural",
    label: "Luxembourg National ID (Non-Natural)",
    description: "Luxembourg national ID for non-natural persons",
    group: "identification",
  },

  // ==================== MALTA ====================
  {
    value: "MTIdentityCardNumber",
    label: "Maltese Identity Card",
    description: "Maltese identity card numbers",
    group: "identification",
  },
  {
    value: "MTTaxIDNumber",
    label: "Maltese Tax ID",
    description: "Maltese tax ID numbers",
    group: "identification",
  },

  // ==================== CYPRUS ====================
  {
    value: "CYIdentityCard",
    label: "Cypriot Identity Card",
    description: "Cypriot identity card numbers",
    group: "identification",
  },
  {
    value: "CYTaxIdentificationNumber",
    label: "Cypriot Tax ID",
    description: "Cypriot tax identification numbers",
    group: "identification",
  },

  // ==================== RUSSIA ====================
  {
    value: "RUPassportNumberDomestic",
    label: "Russian Domestic Passport",
    description: "Russian domestic passport numbers",
    group: "identification",
  },
  {
    value: "RUPassportNumberInternational",
    label: "Russian International Passport",
    description: "Russian international passport numbers",
    group: "identification",
  },

  // ==================== UKRAINE ====================
  {
    value: "UAPassportNumberDomestic",
    label: "Ukrainian Domestic Passport",
    description: "Ukrainian domestic passport numbers",
    group: "identification",
  },
  {
    value: "UAPassportNumberInternational",
    label: "Ukrainian International Passport",
    description: "Ukrainian international passport numbers",
    group: "identification",
  },

  // ==================== TURKEY ====================
  {
    value: "TRNationalIdentificationNumber",
    label: "Turkish National ID",
    description: "Turkish national identification numbers",
    group: "identification",
  },

  // ==================== INDIA ====================
  {
    value: "INPermanentAccount",
    label: "Indian PAN",
    description: "Indian Permanent Account Numbers (PAN)",
    group: "identification",
  },
  {
    value: "INUniqueIdentificationNumber",
    label: "Indian Aadhaar",
    description: "Indian Unique Identification Numbers (Aadhaar)",
    group: "identification",
  },

  // ==================== CHINA ====================
  {
    value: "CNResidentIdentityCardNumber",
    label: "Chinese Resident ID Card",
    description: "Chinese resident identity card numbers",
    group: "identification",
  },

  // ==================== JAPAN ====================
  {
    value: "JPBankAccountNumber",
    label: "Japanese Bank Account",
    description: "Japanese bank account numbers",
    group: "financial",
  },
  {
    value: "JPDriversLicenseNumber",
    label: "Japanese Driver's License",
    description: "Japanese driver's license numbers",
    group: "identification",
  },
  {
    value: "JPMyNumberCorporate",
    label: "Japanese My Number (Corporate)",
    description: "Japanese My Number (corporate)",
    group: "identification",
  },
  {
    value: "JPMyNumberPersonal",
    label: "Japanese My Number (Personal)",
    description: "Japanese My Number (personal)",
    group: "identification",
  },
  {
    value: "JPPassportNumber",
    label: "Japanese Passport",
    description: "Japanese passport numbers",
    group: "identification",
  },

  // ==================== SOUTH KOREA ====================
  {
    value: "KRResidentRegistrationNumber",
    label: "Korean Resident Registration",
    description: "South Korean resident registration numbers",
    group: "identification",
  },

  // ==================== SINGAPORE ====================
  {
    value: "SGNationalRegistrationIdentityCardNumber",
    label: "Singapore NRIC",
    description: "Singapore NRIC numbers",
    group: "identification",
  },

  // ==================== HONG KONG ====================
  {
    value: "HKIdentityCardNumber",
    label: "Hong Kong Identity Card",
    description: "Hong Kong identity card numbers",
    group: "identification",
  },

  // ==================== TAIWAN ====================
  {
    value: "TWNationalID",
    label: "Taiwan National ID",
    description: "Taiwan national ID numbers",
    group: "identification",
  },
  {
    value: "TWPassportNumber",
    label: "Taiwan Passport",
    description: "Taiwan passport numbers",
    group: "identification",
  },
  {
    value: "TWResidentCertificate",
    label: "Taiwan Resident Certificate",
    description: "Taiwan resident certificate numbers",
    group: "identification",
  },

  // ==================== MALAYSIA ====================
  {
    value: "MYIdentityCardNumber",
    label: "Malaysian MyKad",
    description: "Malaysian identity card numbers (MyKad)",
    group: "identification",
  },

  // ==================== PHILIPPINES ====================
  {
    value: "PHUnifiedMultiPurposeIDNumber",
    label: "Philippine Unified Multi-Purpose ID",
    description: "Philippine Unified Multi-Purpose ID numbers",
    group: "identification",
  },

  // ==================== THAILAND ====================
  {
    value: "THPopulationIdentificationCode",
    label: "Thai Population ID",
    description: "Thai population identification codes",
    group: "identification",
  },

  // ==================== INDONESIA ====================
  {
    value: "IDIdentityCardNumber",
    label: "Indonesian KTP",
    description: "Indonesian identity card numbers (KTP)",
    group: "identification",
  },

  // ==================== BRAZIL ====================
  {
    value: "BRCPFNumber",
    label: "Brazilian CPF",
    description: "Brazilian CPF numbers (individual taxpayer)",
    group: "identification",
  },
  {
    value: "BRLegalEntityNumber",
    label: "Brazilian CNPJ",
    description: "Brazilian legal entity numbers (CNPJ)",
    group: "identification",
  },
  {
    value: "BRNationalIDRG",
    label: "Brazilian RG",
    description: "Brazilian national ID (RG)",
    group: "identification",
  },

  // ==================== ARGENTINA ====================
  {
    value: "ARNationalIdentityNumber",
    label: "Argentine DNI",
    description: "Argentine national identity numbers (DNI)",
    group: "identification",
  },

  // ==================== CHILE ====================
  {
    value: "CLIdentityCardNumber",
    label: "Chilean RUT",
    description: "Chilean identity card numbers (RUT)",
    group: "identification",
  },

  // ==================== SOUTH AFRICA ====================
  {
    value: "ZAIdentificationNumber",
    label: "South African ID",
    description: "South African ID numbers",
    group: "identification",
  },

  // ==================== ISRAEL ====================
  {
    value: "ILNationalID",
    label: "Israeli National ID",
    description: "Israeli national ID numbers",
    group: "identification",
  },
  {
    value: "ILBankAccountNumber",
    label: "Israeli Bank Account",
    description: "Israeli bank account numbers",
    group: "financial",
  },

  // ==================== SAUDI ARABIA ====================
  {
    value: "SANationalID",
    label: "Saudi Arabian National ID",
    description: "Saudi Arabian national ID numbers",
    group: "identification",
  },

  // ==================== NEW ZEALAND ====================
  {
    value: "NZBankAccountNumber",
    label: "New Zealand Bank Account",
    description: "New Zealand bank account numbers",
    group: "financial",
  },
  {
    value: "NZDriversLicenseNumber",
    label: "New Zealand Driver's License",
    description: "New Zealand driver's license numbers",
    group: "identification",
  },
  {
    value: "NZInlandRevenueNumber",
    label: "New Zealand IRD Number",
    description: "New Zealand IRD numbers",
    group: "identification",
  },
  {
    value: "NZMinistryOfHealthNumber",
    label: "New Zealand Ministry of Health Number",
    description: "New Zealand Ministry of Health numbers",
    group: "medical",
  },
  {
    value: "NZSocialWelfareNumber",
    label: "New Zealand Social Welfare Number",
    description: "New Zealand social welfare numbers",
    group: "identification",
  },
];

function buildGroupedCategories(
  categories: PiiCategory[],
): Record<PiiCategoryGroup, PiiCategory[]> {
  return PII_CATEGORY_GROUPS.reduce(
    (acc, group) => {
      acc[group] = categories.filter(category => category.group === group);
      return acc;
    },
    {} as Record<PiiCategoryGroup, PiiCategory[]>,
  );
}

export const GROUPED_PII_CATEGORIES = buildGroupedCategories(PII_CATEGORIES);

export const PRESIDIO_SUPPORTED_CATEGORY_VALUES = [
  "Person",
  "Date",
  "Email",
  "PhoneNumber",
  "URL",
  "Address",
  "IPAddress",
  "Organization",
  "CreditCardNumber",
  "BankAccountNumber",
  "ABARoutingNumber",
  "InternationalBankingAccountNumber",
  "DriversLicenseNumber",
  "PassportNumber",
  "LicensePlate",
  "USSocialSecurityNumber",
  "USIndividualTaxpayerIdentification",
] as const;

const PRESIDIO_SUPPORTED_CATEGORY_SET = new Set<string>(
  PRESIDIO_SUPPORTED_CATEGORY_VALUES,
);

export const PRESIDIO_PII_CATEGORIES = PII_CATEGORIES.filter(category =>
  PRESIDIO_SUPPORTED_CATEGORY_SET.has(category.value),
);

export const GROUPED_PRESIDIO_PII_CATEGORIES = buildGroupedCategories(
  PRESIDIO_PII_CATEGORIES,
);

export const PII_CATEGORIES_BY_ENGINE = {
  azure: PII_CATEGORIES,
  presidio: PRESIDIO_PII_CATEGORIES,
} as const;

export const GROUPED_PII_CATEGORIES_BY_ENGINE = {
  azure: GROUPED_PII_CATEGORIES,
  presidio: GROUPED_PRESIDIO_PII_CATEGORIES,
} as const;

export function getPiiCategoriesForEngine(
  engine: "azure" | "presidio",
): PiiCategory[] {
  return PII_CATEGORIES_BY_ENGINE[engine];
}

export function getGroupedPiiCategories(
  engine: "azure" | "presidio",
): Record<PiiCategoryGroup, PiiCategory[]> {
  return GROUPED_PII_CATEGORIES_BY_ENGINE[engine];
}

export function filterCategoriesByEngine(
  categories: string[] | undefined | null,
  engine: "azure" | "presidio",
): string[] {
  if (!categories || categories.length === 0) {
    return [];
  }

  const allowed = new Set(
    getPiiCategoriesForEngine(engine).map(category => category.value),
  );

  return categories.filter(category => allowed.has(category));
}

// Helper function to get category label by value
export function getCategoryLabel(
  value: string,
  engine: "azure" | "presidio" = "azure",
): string {
  const category = getPiiCategoriesForEngine(engine).find(
    cat => cat.value === value,
  );
  return category ? category.label : value;
}

// Helper function to get category by value
export function getCategoryByValue(
  value: string,
  engine: "azure" | "presidio" = "azure",
): PiiCategory | undefined {
  return getPiiCategoriesForEngine(engine).find(cat => cat.value === value);
}

// Default selected categories (commonly used ones)
export const DEFAULT_PII_CATEGORIES = [
  "Person",
  "Email",
  "PhoneNumber",
  "Address",
  "USSocialSecurityNumber",
  "CreditCardNumber",
];
