import type { Supplier } from "./types";

/**
 * SUP-001…007 are built from the suppliers on the original import orders; SUP-008…011 are illustrative
 * additions (wine from Australia, Italy and Chile, and the lager's brewery). Contact emails are .example.
 */
export const suppliers: Supplier[] = [
  { supplierId: "SUP-001", name: "Highland Spirits Co., Ltd.", country: "scotland", manufacturerRegNo: "UK-DIST-2201", origin: "Glasgow, Scotland", defaultIncoterms: "CIF", currency: "GBP", paymentTerms: "L/C at sight", paymentTermDays: 0, contactEmail: "export@highland-spirits.example", active: true },
  { supplierId: "SUP-002", name: "Casa Roble Distillery", country: "mexico", manufacturerRegNo: "MX-TEQ-0587", origin: "Jalisco, Mexico", defaultIncoterms: "FOB", currency: "USD", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "ventas@casaroble.example", active: true },
  { supplierId: "SUP-003", name: "Chateau Belmont Vineyards", country: "france", manufacturerRegNo: "FR-WIN-3390", origin: "Bordeaux, France", defaultIncoterms: "CIF", currency: "EUR", paymentTerms: "L/C at sight", paymentTermDays: 0, contactEmail: "export@chateau-belmont.example", active: true },
  { supplierId: "SUP-004", name: "Nordic Frost Distillers", country: "sweden", manufacturerRegNo: "SE-VOD-0093", origin: "Stockholm, Sweden", defaultIncoterms: "FOB", currency: "EUR", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "orders@nordicfrost.example", active: true },
  { supplierId: "SUP-005", name: "Blue Coral Distillers", country: "uk", manufacturerRegNo: "UK-GIN-4471", origin: "London, United Kingdom", defaultIncoterms: "CIF", currency: "GBP", paymentTerms: "T/T 45 days", paymentTermDays: 45, contactEmail: "trade@bluecoral.example", active: true },
  { supplierId: "SUP-006", name: "Amber Harbor Rum Co.", country: "jamaica", manufacturerRegNo: "JM-RUM-1182", origin: "Kingston, Jamaica", defaultIncoterms: "FOB", currency: "USD", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "export@amberharbor.example", active: true },
  { supplierId: "SUP-007", name: "Sakura Distillery Japan", country: "japan", manufacturerRegNo: "JP-LIQ-0021", origin: "Osaka, Japan", defaultIncoterms: "CIF", currency: "JPY", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "intl@sakura-distillery.example", active: true },
  { supplierId: "SUP-008", name: "Barossa Ridge Wines Pty Ltd", country: "australia", manufacturerRegNo: "AU-WIN-1187", origin: "Adelaide, Australia", defaultIncoterms: "CIF", currency: "AUD", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "export@barossaridge.example", active: true },
  { supplierId: "SUP-009", name: "Cantina Vallerosa S.r.l.", country: "italy", manufacturerRegNo: "IT-WIN-5520", origin: "Florence, Italy", defaultIncoterms: "FOB", currency: "EUR", paymentTerms: "T/T 45 days", paymentTermDays: 45, contactEmail: "export@vallerosa.example", active: true },
  { supplierId: "SUP-010", name: "Andes Valley Vineyards S.A.", country: "chile", manufacturerRegNo: "CL-WIN-0342", origin: "Santiago, Chile", defaultIncoterms: "FOB", currency: "USD", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "ventas@andesvalley.example", active: true },
  { supplierId: "SUP-011", name: "Riverside Brewing Ltd", country: "uk", manufacturerRegNo: "UK-BRW-0716", origin: "Bristol, United Kingdom", defaultIncoterms: "CIF", currency: "GBP", paymentTerms: "T/T 30 days", paymentTermDays: 30, contactEmail: "trade@riversidebrewing.example", active: true },
];
