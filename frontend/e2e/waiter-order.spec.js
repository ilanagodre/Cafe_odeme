import { test, expect } from '@playwright/test';
import { setAdminAuth } from './helpers/auth.js';

test.describe('Waiter Order Page', () => {
  test('should be visible in nav for waiter role', async ({ page }) => {
    await setAdminAuth(page, 'waiter');
    await page.goto('/admin');

    // Should see "Sipariş Al" menu item
    await expect(page.locator('text=Sipariş Al')).toBeVisible();
  });

  test('should be visible in nav for head_waiter role', async ({ page }) => {
    await setAdminAuth(page, 'head_waiter');
    await page.goto('/admin');

    // Should see "Sipariş Al" menu item
    await expect(page.locator('text=Sipariş Al')).toBeVisible();
  });

  test('should be visible in nav for owner role', async ({ page }) => {
    await setAdminAuth(page, 'owner');
    await page.goto('/admin');

    // Should see "Sipariş Al" menu item
    await expect(page.locator('text=Sipariş Al')).toBeVisible();
  });

  test('should navigate to waiter-order page', async ({ page }) => {
    await setAdminAuth(page, 'waiter');
    await page.goto('/admin/waiter-order');

    // Should show loading or table selection step
    await expect(page.locator('text=Masa Seçin')).toBeVisible();
  });

  test('should show progress steps', async ({ page }) => {
    await setAdminAuth(page, 'waiter');
    await page.goto('/admin/waiter-order');

    // Should have progress indicator with step numbers
    const steps = page.locator('div').filter({ has: page.locator('text="1"') });
    await expect(steps.first()).toBeVisible();
  });

  test('should have back button', async ({ page }) => {
    await setAdminAuth(page, 'waiter');
    await page.goto('/admin/waiter-order');

    // Should have back button
    const backButton = page.locator('button').first();
    await expect(backButton).toBeVisible();
  });

  test('should handle empty active sessions gracefully', async ({ page }) => {
    await setAdminAuth(page, 'waiter');
    await page.goto('/admin/waiter-order');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if either tables are shown or empty message is displayed
    const tablesGrid = page.locator('text=Masa');
    const emptyMessage = page.locator('text=aktif masa');

    // At least one should be visible
    const isTablesVisible = await tablesGrid.isVisible().catch(() => false);
    const isEmptyVisible = await emptyMessage.isVisible().catch(() => false);

    expect(isTablesVisible || isEmptyVisible).toBeTruthy();
  });
});
