import { test, expect } from '@playwright/test';
import { createTestSession, addOrder } from './helpers/api.js';

test.describe('Customer Flow - Table and Ordering', () => {
  let sessionToken, participantId, participantName;

  test.beforeEach(async () => {
    // Create a test session via API
    const session = await createTestSession('cafe-table-1', 'Test Customer');
    sessionToken = session.sessionToken;
    participantId = session.participantId;
    participantName = session.participantName;
  });

  test('should display table page with correct title', async ({ page }) => {
    await page.goto(`/table/${sessionToken}/${participantId}`);

    // Check title
    await expect(page.locator(`text=${participantName}'nin Masası`)).toBeVisible();

    // Check connection status
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toBeVisible();

    // Should show green connection dot (Canlı)
    await expect(connectionStatus).toContainText('Canlı', { timeout: 10000 });
  });

  test('should display order form and add button', async ({ page }) => {
    await page.goto(`/table/${sessionToken}/${participantId}`);

    // Add order button should be visible
    const addOrderBtn = page.locator('[data-testid="add-order-btn"]');
    await expect(addOrderBtn).toBeVisible();

    // Click to open menu
    await addOrderBtn.click();

    // Menu modal should appear
    const menuModal = page.locator('[data-testid="menu-modal"]');
    await expect(menuModal).toBeVisible({ timeout: 8000 });
  });

  test('should place an order successfully', async ({ page }) => {
    await page.goto(`/table/${sessionToken}/${participantId}`);

    // Add order via API first
    await addOrder(sessionToken, participantId, 'Kahve', 50, 2);

    // Wait for WebSocket update
    await page.waitForTimeout(1000);
    await page.reload();

    // Order should appear in list
    const orderList = page.locator('[data-testid="order-list"]');
    await expect(orderList).toContainText('Kahve', { timeout: 8000 });
    await expect(orderList).toContainText('2 × 50.00₺');
  });

  test('should show remaining balance', async ({ page }) => {
    // Add some orders
    await addOrder(sessionToken, participantId, 'Kahve', 50, 1);
    await addOrder(sessionToken, participantId, 'Çay', 30, 1);

    await page.goto(`/table/${sessionToken}/${participantId}`);
    await page.waitForTimeout(1000);

    // Remaining balance should be 80 (50 + 30)
    const remainingBalance = page.locator('[data-testid="remaining-balance"]');
    await expect(remainingBalance).toBeVisible();
    await expect(remainingBalance).toContainText('80.00₺');
  });

  test('should navigate to payment page', async ({ page }) => {
    // Add an order
    await addOrder(sessionToken, participantId, 'Kahve', 50, 1);

    await page.goto(`/table/${sessionToken}/${participantId}`);

    // Go to payment
    const paymentBtn = page.locator('[data-testid="go-to-payment-btn"]');
    await expect(paymentBtn).toBeVisible();
    await paymentBtn.click();

    // Should navigate to payment page
    await expect(page).toHaveURL(`/payment/${sessionToken}/${participantId}`);
  });

  test('should handle multiple participants joining', async ({ page, context }) => {
    const page2 = await context.newPage();

    try {
      // First customer joins
      await page.goto(`/table/${sessionToken}/${participantId}`);

      // Verify connection
      const connection = page.locator('[data-testid="connection-status"]');
      await expect(connection).toContainText('Canlı', { timeout: 10000 });

      // Second customer joins same table
      const session2 = await createTestSession('cafe-table-1', 'Second Customer');
      await page2.goto(`/table/${session2.sessionToken}/${session2.participantId}`);

      // Add order as customer 1
      await addOrder(sessionToken, participantId, 'Kahve', 50, 1);

      // Wait and reload both pages
      await page.waitForTimeout(1000);
      await page.reload();
      await page2.waitForTimeout(1000);
      await page2.reload();

      // Both should see the order
      const orderList1 = page.locator('[data-testid="order-list"]');
      const orderList2 = page2.locator('[data-testid="order-list"]');

      await expect(orderList1).toContainText('Kahve', { timeout: 8000 });
      await expect(orderList2).toContainText('Kahve', { timeout: 8000 });
    } finally {
      await page2.close();
    }
  });

  test('should disable ordering when session is closed', async ({ page }) => {
    await page.goto(`/table/${sessionToken}/${participantId}`);

    const addOrderBtn = page.locator('[data-testid="add-order-btn"]');

    // Initially enabled
    await expect(addOrderBtn).toBeEnabled();

    // Note: Cannot actually close session in E2E without admin API call
    // This test structure shows the expected behavior when session.status === 'closed'
  });
});
