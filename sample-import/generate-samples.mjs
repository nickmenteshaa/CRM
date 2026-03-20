import XLSX from "xlsx";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));

function createFile(name, headers, rows) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Auto-size columns
  ws["!cols"] = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);
  const xlsxPath = join(dir, `${name}.xlsx`);
  const csvPath = join(dir, `${name}.csv`);
  XLSX.writeFile(wb, xlsxPath);
  XLSX.writeFile(wb, csvPath, { bookType: "csv" });
  console.log(`Created: ${xlsxPath}`);
  console.log(`Created: ${csvPath}`);
}

// ── Companies ──
createFile("Companies", [
  "Company Name", "Industry", "Status", "Phone", "Website", "Country", "Tax ID", "Payment Terms",
], [
  ["AutoZone Georgia", "Auto Parts", "Active", "+995-555-1001", "autozone.ge", "Georgia", "GE100001", "net30"],
  ["Tbilisi Motors", "Auto Dealership", "Active", "+995-555-1002", "tbilisimotors.ge", "Georgia", "GE100002", "net60"],
  ["Caucasus Fleet Services", "Fleet Management", "Lead", "+995-555-1003", "", "Georgia", "", "cod"],
  ["EuroParts Direct", "Auto Parts", "Active", "+49-30-5550100", "europarts.de", "Germany", "DE200001", "net30"],
  ["Istanbul Auto Supply", "Parts & Service", "Lead", "+90-212-5550200", "istanbulauto.com.tr", "Turkey", "TR300001", "prepaid"],
]);

// ── Customers ──
createFile("Customers", [
  "Name", "Company Name", "Email", "Phone", "Status", "Source", "Customer Type", "Country", "Preferred Brands", "Tax ID", "Shipping Address", "Billing Address", "Payment Terms", "Notes",
], [
  ["Giorgi Beridze", "AutoZone Georgia", "giorgi@autozone.ge", "+995-555-2001", "Qualified", "Referral", "dealer", "Georgia", "Bosch, Mann", "GE200001", "12 Rustaveli Ave, Tbilisi", "12 Rustaveli Ave, Tbilisi", "net30", "Long-term partner"],
  ["Nino Kvaratskhelia", "Tbilisi Workshop", "nino@workshop.ge", "+995-555-2002", "New", "Website", "workshop", "Georgia", "Denso", "", "45 Chavchavadze St, Tbilisi", "", "cod", ""],
  ["Hans Mueller", "EuroParts Direct", "hans@europarts.de", "+49-30-5550101", "Contacted", "LinkedIn", "distributor", "Germany", "Bosch, Continental", "DE200002", "Berliner Str 10, Berlin", "Berliner Str 10, Berlin", "net60", "EU distribution partner"],
  ["", "Quick Fix Garage", "info@quickfix.ge", "+995-555-2003", "New", "Cold Call", "workshop", "Georgia", "", "", "78 Pekini Ave, Tbilisi", "", "prepaid", "Small local workshop"],
  ["Levan Tsiklauri", "", "levan.t@gmail.com", "+995-555-2004", "Qualified", "Event", "individual", "Georgia", "Toyota OEM", "", "", "", "", "Met at Tbilisi Auto Expo 2025"],
  ["Mehmet Yilmaz", "Yilmaz Otomotiv", "mehmet@yilmaz.com.tr", "+90-532-5550300", "Contacted", "Referral", "dealer", "Turkey", "Valeo, LuK", "TR300002", "Ankara Yolu 55, Istanbul", "", "net30", ""],
]);

// ── Parts Catalog ──
createFile("Parts_Catalog", [
  "SKU", "Name", "Description", "OEM Number", "Brand", "Compatible Make", "Compatible Model", "Year From", "Year To", "Weight", "Dimensions", "Unit Price", "Cost Price",
], [
  ["BRK-001", "Front Brake Pad Set", "Ceramic front brake pads", "04465-33471", "Bosch", "Toyota", "Camry", "2018", "2024", "0.85kg", "15x10x3cm", "45.99", "22.50"],
  ["BRK-002", "Rear Brake Pad Set", "Semi-metallic rear pads", "04466-33180", "Bosch", "Toyota", "Camry", "2018", "2024", "0.75kg", "14x9x3cm", "38.99", "19.00"],
  ["FLT-001", "Oil Filter", "Standard spin-on oil filter", "90915-YZZD4", "Mann", "Toyota", "Corolla", "2015", "2024", "0.3kg", "8x8x10cm", "12.99", "5.50"],
  ["FLT-002", "Air Filter", "Panel air filter element", "17801-21060", "Denso", "Toyota", "Corolla", "2015", "2024", "0.25kg", "25x20x4cm", "18.99", "8.00"],
  ["BLT-001", "Serpentine Belt", "Multi-rib drive belt", "99367-H2080", "Continental", "Hyundai", "Tucson", "2016", "2023", "0.2kg", "105x2cm", "24.99", "11.00"],
  ["SPK-001", "Spark Plug Set (4pc)", "Iridium spark plugs", "90919-01275", "Denso", "Toyota", "RAV4", "2019", "2024", "0.12kg", "7x2x2cm", "39.99", "18.50"],
  ["CLT-001", "Clutch Kit", "3-piece clutch kit", "41100-23510", "Valeo", "Hyundai", "i30", "2017", "2023", "5.2kg", "24x24x8cm", "189.99", "95.00"],
  ["RAD-001", "Radiator", "Aluminum core radiator", "16400-0T040", "Nissens", "Toyota", "Hilux", "2016", "2024", "4.5kg", "65x45x3cm", "159.99", "78.00"],
]);

// ── Suppliers ──
createFile("Suppliers", [
  "Supplier Name", "Contact Name", "Email", "Phone", "Country", "Website", "Lead Time (Days)", "MOQ", "Rating", "Notes",
], [
  ["Bosch Automotive Parts", "Hans Weber", "orders@bosch-auto.de", "+49-711-5550100", "Germany", "bosch-automotive.com", "14", "50", "5", "Tier 1 OEM supplier, priority partner"],
  ["Mann+Hummel", "Klaus Fischer", "supply@mann-hummel.com", "+49-714-5550200", "Germany", "mann-hummel.com", "10", "100", "5", "Filtration specialist"],
  ["Denso Europe", "Yuki Tanaka", "eu-orders@denso.com", "+31-20-5550300", "Netherlands", "denso.com", "21", "30", "4", "Japanese OEM quality"],
  ["Continental AG", "Maria Schmidt", "parts@continental.de", "+49-511-5550400", "Germany", "continental-automotive.com", "12", "25", "4", "Belts, hoses, sensors"],
  ["Valeo Service", "Pierre Duval", "service@valeo.com", "+33-1-5550500", "France", "valeo.com", "18", "20", "4", "Clutch, thermal, lighting"],
  ["Nissens A/S", "Lars Andersen", "sales@nissens.com", "+45-76-5550600", "Denmark", "nissens.com", "15", "10", "3", "Cooling and climate parts"],
]);

console.log("\nAll sample files created in:", dir);
