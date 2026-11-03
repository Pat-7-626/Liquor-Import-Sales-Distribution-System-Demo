import type { Product } from "./types";

/**
 * SKU-1001…1012 are the products from the source spreadsheet (its stock figures are replaced by what the demo
 * history leaves on hand). SKU-1013…1024 are illustrative additions, so wine and every channel has a range.
 * Cost price is the all-in landed cost per unit; suggested price is the VAT-inclusive retail price.
 */
export const products: Product[] = [
  { sku: "SKU-1001", name: "Golden Barrel Single Malt 12Y", category: "whisky", abv: 43, packageSize: 700, unit: "bottle", costPrice: 1850, suggestedPrice: 2490, stockAvailable: 420, status: "available", hsCode: "2208.30" },
  { sku: "SKU-1002", name: "Golden Barrel Single Malt 18Y", category: "whisky", abv: 43, packageSize: 700, unit: "bottle", costPrice: 4200, suggestedPrice: 5990, stockAvailable: 96, status: "available", hsCode: "2208.30" },
  { sku: "SKU-1003", name: "Highland Mist Blended", category: "whisky", abv: 40, packageSize: 750, unit: "bottle", costPrice: 780, suggestedPrice: 1090, stockAvailable: 1250, status: "available", hsCode: "2208.30" },
  { sku: "SKU-1004", name: "Casa Roble Reposado", category: "tequila", abv: 38, packageSize: 750, unit: "bottle", costPrice: 990, suggestedPrice: 1390, stockAvailable: 300, status: "available", hsCode: "2208.90" },
  { sku: "SKU-1005", name: "Chateau Belmont Rouge 2019", category: "redWine", abv: 13.5, packageSize: 750, unit: "bottle", costPrice: 650, suggestedPrice: 950, stockAvailable: 640, status: "available", hsCode: "2204.21" },
  { sku: "SKU-1006", name: "Chateau Belmont Blanc 2021", category: "whiteWine", abv: 12.5, packageSize: 750, unit: "bottle", costPrice: 620, suggestedPrice: 890, stockAvailable: 18, status: "lowStock", hsCode: "2204.21" },
  { sku: "SKU-1007", name: "Nordic Frost Vodka", category: "vodka", abv: 40, packageSize: 700, unit: "bottle", costPrice: 520, suggestedPrice: 790, stockAvailable: 980, status: "available", hsCode: "2208.60" },
  { sku: "SKU-1008", name: "Blue Coral Gin", category: "gin", abv: 42, packageSize: 700, unit: "bottle", costPrice: 610, suggestedPrice: 890, stockAvailable: 0, status: "outOfStock", hsCode: "2208.50" },
  { sku: "SKU-1009", name: "Sakura Plum Liqueur", category: "liqueur", abv: 15, packageSize: 500, unit: "bottle", costPrice: 380, suggestedPrice: 590, stockAvailable: 210, status: "available", hsCode: "2208.70" },
  { sku: "SKU-1010", name: "Amber Harbor Rum Dark", category: "rum", abv: 40, packageSize: 700, unit: "bottle", costPrice: 560, suggestedPrice: 820, stockAvailable: 75, status: "available", hsCode: "2208.40" },
  { sku: "SKU-1011", name: "Golden Barrel Cask Reserve", category: "whisky", abv: 46, packageSize: 700, unit: "bottle", costPrice: 3100, suggestedPrice: 4390, stockAvailable: 12, status: "lowStock", hsCode: "2208.30" },
  { sku: "SKU-1012", name: "Riverside Craft Lager 6-pack", category: "beer", abv: 5, packageSize: 330, unit: "pack", unitsPerPack: 6, costPrice: 210, suggestedPrice: 320, stockAvailable: 560, status: "available", hsCode: "2203.00" },
  { sku: "SKU-1013", name: "Barossa Ridge Shiraz 2021", category: "redWine", abv: 14.5, packageSize: 750, unit: "bottle", costPrice: 780, suggestedPrice: 1190, stockAvailable: 0, status: "outOfStock", hsCode: "2204.21" },
  { sku: "SKU-1014", name: "Barossa Ridge Chardonnay 2023", category: "whiteWine", abv: 13, packageSize: 750, unit: "bottle", costPrice: 690, suggestedPrice: 1050, stockAvailable: 0, status: "outOfStock", hsCode: "2204.21" },
  { sku: "SKU-1015", name: "Vallerosa Pinot Grigio 2023", category: "whiteWine", abv: 12, packageSize: 750, unit: "bottle", costPrice: 560, suggestedPrice: 850, stockAvailable: 0, status: "outOfStock", hsCode: "2204.21" },
  { sku: "SKU-1016", name: "Vallerosa Chianti Classico 2020", category: "redWine", abv: 13.5, packageSize: 750, unit: "bottle", costPrice: 890, suggestedPrice: 1350, stockAvailable: 0, status: "outOfStock", hsCode: "2204.21" },
  { sku: "SKU-1017", name: "Andes Valley Cabernet Sauvignon 2022", category: "redWine", abv: 13.5, packageSize: 750, unit: "bottle", costPrice: 420, suggestedPrice: 650, stockAvailable: 0, status: "outOfStock", hsCode: "2204.21" },
  { sku: "SKU-1018", name: "Andes Valley Sauvignon Blanc 2024", category: "whiteWine", abv: 12.5, packageSize: 750, unit: "bottle", costPrice: 400, suggestedPrice: 620, stockAvailable: 0, status: "outOfStock", hsCode: "2204.21" },
  { sku: "SKU-1019", name: "Highland Mist Blended 1L", category: "whisky", abv: 40, packageSize: 1000, unit: "bottle", costPrice: 1020, suggestedPrice: 1450, stockAvailable: 0, status: "outOfStock", hsCode: "2208.30" },
  { sku: "SKU-1020", name: "Blue Coral Pink Gin", category: "gin", abv: 37.5, packageSize: 700, unit: "bottle", costPrice: 590, suggestedPrice: 860, stockAvailable: 0, status: "outOfStock", hsCode: "2208.50" },
  { sku: "SKU-1021", name: "Nordic Frost Citrus Vodka", category: "vodka", abv: 37.5, packageSize: 700, unit: "bottle", costPrice: 500, suggestedPrice: 750, stockAvailable: 0, status: "outOfStock", hsCode: "2208.60" },
  { sku: "SKU-1022", name: "Sakura Mizunara Japanese Whisky", category: "whisky", abv: 43, packageSize: 700, unit: "bottle", costPrice: 2350, suggestedPrice: 3290, stockAvailable: 0, status: "outOfStock", hsCode: "2208.30" },
  { sku: "SKU-1023", name: "Casa Roble Blanco", category: "tequila", abv: 38, packageSize: 750, unit: "bottle", costPrice: 820, suggestedPrice: 1190, stockAvailable: 0, status: "outOfStock", hsCode: "2208.90" },
  { sku: "SKU-1024", name: "Amber Harbor Spiced Rum", category: "rum", abv: 35, packageSize: 700, unit: "bottle", costPrice: 480, suggestedPrice: 720, stockAvailable: 0, status: "outOfStock", hsCode: "2208.40" },
];
