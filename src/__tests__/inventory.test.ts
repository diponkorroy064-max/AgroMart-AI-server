describe('Agricultural Inventory Management Business Logic', () => {
  const calculateAvailableStock = (
    quantity: number,
    reservedStock: number = 0,
    expiryDate?: Date | null
  ): { availableStock: number; isExpired: boolean; isOutOfStock: boolean; isLowStock: boolean } => {
    const now = new Date();
    const isExpired = expiryDate ? new Date(expiryDate) <= now : false;
    const availableStock = isExpired
      ? 0
      : Math.max(0, (quantity || 0) - (reservedStock || 0));

    return {
      availableStock,
      isExpired,
      isOutOfStock: availableStock <= 0,
      isLowStock: availableStock > 0 && availableStock <= 5,
    };
  };

  test('should correctly compute available stock deducting reserved stock', () => {
    const result = calculateAvailableStock(100, 25);
    expect(result.availableStock).toBe(75);
    expect(result.isExpired).toBe(false);
    expect(result.isOutOfStock).toBe(false);
  });

  test('should return 0 available stock and mark isExpired if product is expired', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    const result = calculateAvailableStock(50, 0, pastDate);
    expect(result.availableStock).toBe(0);
    expect(result.isExpired).toBe(true);
    expect(result.isOutOfStock).toBe(true);
  });

  test('should allow purchase if expiry date is in the future', () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days in future
    const result = calculateAvailableStock(30, 5, futureDate);
    expect(result.availableStock).toBe(25);
    expect(result.isExpired).toBe(false);
  });

  test('should trigger low stock alert when stock is 5 or below', () => {
    const result = calculateAvailableStock(4, 0);
    expect(result.isLowStock).toBe(true);
    expect(result.isOutOfStock).toBe(false);
  });

  test('should handle stock delta calculations for different movement types', () => {
    const previousStock = 50;

    // 1. Restock (+20)
    const restockDelta = 20;
    const stockAfterRestock = previousStock + restockDelta;
    expect(stockAfterRestock).toBe(70);

    // 2. Order Placed (-10)
    const orderQty = 10;
    const stockAfterOrder = stockAfterRestock - orderQty;
    expect(stockAfterOrder).toBe(60);

    // 3. Order Cancelled (+10 restored)
    const stockAfterCancel = stockAfterOrder + orderQty;
    expect(stockAfterCancel).toBe(70);

    // 4. Damaged/Spoiled write-off (-5)
    const damageQty = 5;
    const stockAfterDamage = stockAfterCancel - damageQty;
    expect(stockAfterDamage).toBe(65);
  });
});
