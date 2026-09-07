import type { Product } from "./types";

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
  { sku: "SKU-1012", name: "Riverside Craft Lager 6-pack", category: "beer", abv: 5, packageSize: 330, unit: "pack", costPrice: 210, suggestedPrice: 320, stockAvailable: 560, status: "available", hsCode: "2203.00" },
];
