// @ts-nocheck
// Checkout processing module
// Handles cart calculations and order placement

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Cart {
  items: CartItem[];
  discount?: {
    code: string;
    percentage: number;
  };
}

// Simulated data store — in production this would come from a database
function getCart(): Cart {
  return {
    items: [
      { id: "SKU-001", name: "Mechanical Keyboard", price: 149.99, quantity: 1 },
      { id: "SKU-002", name: "USB-C Hub", price: 49.99, quantity: 2 },
    ],
    // No discount applied to this cart
  };
}

function calculateTotal(cart: Cart): number {
  const subtotal = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // BUG: cart.discount is undefined when no coupon is applied,
  // but this code unconditionally accesses .percentage on it.
  // This causes: TypeError: Cannot read properties of undefined (reading 'percentage')
  const discountMultiplier = (100 - cart.discount.percentage) / 100;

  return Math.round(subtotal * discountMultiplier * 100) / 100;
}

export function processCheckout() {
  const cart = getCart();
  const total = calculateTotal(cart);
  return { success: true, total, orderId: `ORD-${Date.now()}` };
}
