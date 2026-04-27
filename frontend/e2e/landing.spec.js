import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display landing page with form', async ({ page }) => {
    // Check title and description are visible
    await expect(page.locator('text=Cafe Pay')).toBeVisible();
    await expect(page.locator('text=Hesabını gör, paylaş, öde')).toBeVisible();

    // Check form elements
    await expect(page.locator('[data-testid="name-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="table-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="join-button"]')).toBeVisible();
  });

  test('should require name before joining', async ({ page }) => {
    const joinButton = page.locator('[data-testid="join-button"]');

    // Initially disabled
    await expect(joinButton).toBeDisabled();

    // Enter name
    await page.locator('[data-testid="name-input"]').fill('Ali');

    // Now enabled
    await expect(joinButton).toBeEnabled();
  });

  test('should detect QR code from URL parameter', async ({ page }) => {
    await page.goto('/?qr=cafe-table-2');

    // QR banner should be visible
    const qrBanner = page.locator('[data-testid="qr-detected-banner"]');
    await expect(qrBanner).toBeVisible();
    await expect(qrBanner).toContainText('Masa 2');

    // Table select should be hidden
    await expect(page.locator('[data-testid="table-select"]')).not.toBeVisible();
  });

  test('should submit form with manual table selection', async ({ page }) => {
    const nameInput = page.locator('[data-testid="name-input"]');
    const tableSelect = page.locator('[data-testid="table-select"]');
    const joinButton = page.locator('[data-testid="join-button"]');

    // Fill form
    await nameInput.fill('Aylin');
    await tableSelect.selectOption('3');

    // Wait for navigation
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/session/join') && r.status() === 200),
      joinButton.click()
    ]);

    // Should navigate to table page
    await expect(page).toHaveURL(/\/table\/.+\/.+/);
  });

  test('should submit form with QR-detected table', async ({ page }) => {
    await page.goto('/?qr=cafe-table-4');

    const nameInput = page.locator('[data-testid="name-input"]');
    const joinButton = page.locator('[data-testid="join-button"]');

    // Fill name
    await nameInput.fill('Kerem');

    // Submit
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/session/join') && r.status() === 200),
      joinButton.click()
    ]);

    // Should navigate to table page
    await expect(page).toHaveURL(/\/table\/.+\/.+/);
  });

  test('should show error on API failure', async ({ page }) => {
    // Block the API
    await page.route('**/api/session/join', route => {
      route.abort();
    });

    const nameInput = page.locator('[data-testid="name-input"]');
    const joinButton = page.locator('[data-testid="join-button"]');

    await nameInput.fill('Test');
    await joinButton.click();

    // Error message should appear
    const errorDiv = page.locator('[data-testid="error-message"]');
    await expect(errorDiv).toBeVisible({ timeout: 8000 });
    await expect(errorDiv).toContainText(/hata|error/i);
  });

  test('should show staff login link', async ({ page }) => {
    const staffLink = page.locator('text=👨‍💼 Personel Girişi');
    await expect(staffLink).toBeVisible();

    await staffLink.click();
    await expect(page).toHaveURL('/staff-login');
  });
});
