import { test, expect } from '@playwright/test';

test.describe('Staff Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/staff-login');
  });

  test('should display login page with PIN pad', async ({ page }) => {
    // Check title
    await expect(page.locator('text=Personel Girişi')).toBeVisible();
    await expect(page.locator('text=4 haneli PIN')).toBeVisible();

    // Check PIN display
    await expect(page.locator('[data-testid="pin-display"]')).toBeVisible();

    // Check PIN pad buttons exist
    for (let i = 0; i <= 9; i++) {
      await expect(page.locator(`[data-testid="pin-key-${i}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-testid="pin-key-enter"]')).toBeVisible();
    await expect(page.locator('[data-testid="pin-key-backspace"]')).toBeVisible();
  });

  test('should display PIN dots as user types', async ({ page }) => {
    const pinDisplay = page.locator('[data-testid="pin-display"]');
    const key1 = page.locator('[data-testid="pin-key-1"]');
    const key2 = page.locator('[data-testid="pin-key-2"]');

    // Initially empty (4 empty circles)
    const emptyDots = pinDisplay.locator('div:not(:has-text())');
    let dotCount = await pinDisplay.locator('div').count();
    expect(dotCount).toBe(4);

    // Click 1
    await key1.click();

    // One dot should be filled
    const dot = pinDisplay.locator('text=●');
    await expect(dot).toHaveCount(1);

    // Click 2
    await key2.click();

    // Two dots should be filled
    await expect(dot).toHaveCount(2);
  });

  test('should handle PIN entry and backspace', async ({ page }) => {
    const pin1 = page.locator('[data-testid="pin-key-1"]');
    const pin2 = page.locator('[data-testid="pin-key-2"]');
    const pin3 = page.locator('[data-testid="pin-key-3"]');
    const pin4 = page.locator('[data-testid="pin-key-4"]');
    const backspace = page.locator('[data-testid="pin-key-backspace"]');
    const dot = page.locator('[data-testid="pin-display"] text=●');

    // Enter 1234
    await pin1.click();
    await pin2.click();
    await pin3.click();
    await pin4.click();

    // Should have 4 dots
    await expect(dot).toHaveCount(4);

    // Backspace once
    await backspace.click();

    // Should have 3 dots
    await expect(dot).toHaveCount(3);

    // Backspace again
    await backspace.click();

    // Should have 2 dots
    await expect(dot).toHaveCount(2);
  });

  test('should submit PIN when complete', async ({ page }) => {
    // Valid PIN: 1234
    const key1 = page.locator('[data-testid="pin-key-1"]');
    const key2 = page.locator('[data-testid="pin-key-2"]');
    const key3 = page.locator('[data-testid="pin-key-3"]');
    const key4 = page.locator('[data-testid="pin-key-4"]');
    const enterBtn = page.locator('[data-testid="pin-key-enter"]');

    // Enter PIN
    await key1.click();
    await key2.click();
    await key3.click();
    await key4.click();

    // Wait for login API and navigation
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200),
      enterBtn.click()
    ]);

    // Should navigate to admin
    await expect(page).toHaveURL(/\/admin/);
  });

  test('should show error on invalid PIN', async ({ page }) => {
    // Wrong PIN: 5555
    const key5 = page.locator('[data-testid="pin-key-5"]');
    const enterBtn = page.locator('[data-testid="pin-key-enter"]');

    // Enter wrong PIN
    await key5.click();
    await key5.click();
    await key5.click();
    await key5.click();

    // Click enter
    await enterBtn.click();

    // Error should appear
    const errorDiv = page.locator('[data-testid="pin-error"]');
    await expect(errorDiv).toBeVisible({ timeout: 8000 });

    // PIN should be cleared (no dots)
    const dot = page.locator('[data-testid="pin-display"] text=●');
    await expect(dot).toHaveCount(0);
  });

  test('should support keyboard input', async ({ page }) => {
    const dot = page.locator('[data-testid="pin-display"] text=●');

    // Type 1234 via keyboard
    await page.keyboard.press('1');
    await expect(dot).toHaveCount(1);

    await page.keyboard.press('2');
    await expect(dot).toHaveCount(2);

    await page.keyboard.press('3');
    await expect(dot).toHaveCount(3);

    await page.keyboard.press('4');
    await expect(dot).toHaveCount(4);

    // Backspace via keyboard
    await page.keyboard.press('Backspace');
    await expect(dot).toHaveCount(3);
  });
});
