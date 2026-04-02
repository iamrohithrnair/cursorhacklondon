// @ts-nocheck
// Product search module

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

const PRODUCTS: Product[] = [
  { id: "SKU-001", name: "Mechanical Keyboard", price: 149.99, category: "peripherals", inStock: true },
  { id: "SKU-002", name: "USB-C Hub", price: 49.99, category: "peripherals", inStock: true },
  { id: "SKU-003", name: "4K Monitor", price: 399.99, category: "displays", inStock: false },
  { id: "SKU-004", name: "Wireless Mouse", price: 79.99, category: "peripherals", inStock: true },
  { id: "SKU-005", name: "Standing Desk", price: 599.99, category: "furniture", inStock: true },
];

export function searchProducts(query: string): { results: Product[]; total: number } {
  const q = query.toLowerCase();
  const results = PRODUCTS.filter(
    (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  );
  return { results, total: results.length };
}
