import { test, expect } from '@playwright/test';
import { createTestSession, addOrder } from './helpers/api.js';

test.describe('Payment Flow', () => {
  let sessionToken, participantId;

  test.beforeEach(async () => {
    const session = await createTestSession('cafe-table-1', 'Payer');
    sessionToken = session.sessionToken;
    participantId = session.participantId;

    // Add orders
    await addOrder(sessionToken, participantId, 'Kahve', 50, 1);
    await addOrder(sessionToken, participantId, 'Çay', 30, 1);
  });

  test('should display payment page with balance', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    // Should show remaining balance header
    const balanceHeader = page.locator('[data-testid="remaining-balance-header"]');
    await expect(balanceHeader).toBeVisible();
    await expect(balanceHeader).toContainText('80.00₺');
  });

  test('should toggle between split strategies', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    const strategyEqual = page.locator('[data-testid="strategy-equal"]');
    const strategyItem = page.locator('[data-testid="strategy-item"]');

    // Initially equal split is selected
    await expect(strategyEqual).toHaveClass(/border-indigo-500|bg-indigo-50/);

    // Click item-based
    await strategyItem.click();
    await page.waitForTimeout(500);

    // Item-based should be selected now
    await expect(strategyItem).toHaveClass(/border-indigo-500|bg-indigo-50/);
  });

  test('should display payment mode options', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    // All payment modes should be visible
    await expect(page.locator('[data-testid="payment-mode-self"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-mode-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-mode-item"]')).toBeVisible();
  });

  test('should select self payment mode', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    const selfMode = page.locator('[data-testid="payment-mode-self"]');
    await expect(selfMode).toBeVisible();
    await selfMode.click();

    // Should be highlighted
    await expect(selfMode).toHaveClass(/border-indigo-500|bg-indigo-50/);

    // Pay button should be enabled
    const payBtn = page.locator('[data-testid="pay-button"]');
    await expect(payBtn).toBeEnabled();
  });

  test('should select all payment mode', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    const allMode = page.locator('[data-testid="payment-mode-all"]');
    await expect(allMode).toBeVisible();
    await allMode.click();

    // Should be highlighted
    await expect(allMode).toHaveClass(/border-amber-500|bg-amber-50/);

    // Pay button label should show total
    const payBtn = page.locator('[data-testid="pay-button"]');
    await expect(payBtn).toContainText('80.00₺');
  });

  test('should show item selection panel for item payment', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    const itemMode = page.locator('[data-testid="payment-mode-item"]');
    await itemMode.click();

    // Item selection panel should appear
    await expect(page.locator('text=Ödemek istediğin siparişleri seç')).toBeVisible();

    // Checkboxes should be available
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2); // 2 items
  });

  test('should select specific items for payment', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    const itemMode = page.locator('[data-testid="payment-mode-item"]');
    await itemMode.click();

    // Select first item checkbox
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.first().click();

    // Pay button should show selected amount (50)
    const payBtn = page.locator('[data-testid="pay-button"]');
    await expect(payBtn).toContainText('50.00₺');
  });

  test('should show success message after payment', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    // Select self payment
    await page.locator('[data-testid="payment-mode-self"]').click();

    // Click pay
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/payment') && r.status() === 200),
      page.locator('[data-testid="pay-button"]').click()
    ]);

    // Success message should appear
    const successDiv = page.locator('[data-testid="payment-success"]');
    await expect(successDiv).toBeVisible({ timeout: 8000 });
    await expect(successDiv).toContainText(/başarılı|success/i);
  });

  test('should show error message on payment failure', async ({ page }) => {
    // Block payment API
    await page.route('**/api/payment', route => route.abort());

    await page.goto(`/payment/${sessionToken}/${participantId}`);

    // Select and pay
    await page.locator('[data-testid="payment-mode-self"]').click();
    await page.locator('[data-testid="pay-button"]').click();

    // Error should appear
    const errorDiv = page.locator('[data-testid="payment-error"]');
    await expect(errorDiv).toBeVisible({ timeout: 8000 });
  });

  test('should disable pay button when other mode without selection', async ({ page }) => {
    await page.goto(`/payment/${sessionToken}/${participantId}`);

    // Select other mode
    await page.locator('[data-testid="payment-mode-other"]').click();

    // Pay button should be disabled (no participant selected)
    const payBtn = page.locator('[data-testid="pay-button"]');
    await expect(payBtn).toBeDisabled();
  });
});
