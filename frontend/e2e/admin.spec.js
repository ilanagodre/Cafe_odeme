import { test, expect } from '@playwright/test';
import { setAdminAuth } from './helpers/auth.js';

test.describe('Admin Layout and Navigation', () => {
  test('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL('/staff-login');
  });

  test('should display admin layout for owner', async ({ page }) => {
    await setAdminAuth(page, 'owner');
    await page.goto('/admin');

    // Should see admin nav
    const adminNav = page.locator('[data-testid="admin-nav"]');
    await expect(adminNav).toBeVisible();

    // Should see logout button
    const logoutBtn = page.locator('[data-testid="logout-btn"]');
    await expect(logoutBtn).toBeVisible();

    // Should see all nav items for owner
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Masalar')).toBeVisible();
    await expect(page.locator('text=Siparişler')).toBeVisible();
    await expect(page.locator('text=Sipariş Al')).toBeVisible();
    await expect(page.locator('text=Personel')).toBeVisible();
    await expect(page.locator('text=Menü')).toBeVisible();
    await expect(page.locator('text=Raporlar')).toBeVisible();
    await expect(page.locator('text=Kayıtlar')).toBeVisible();
  });

  test('should display limited nav for waiter role', async ({ page }) => {
    await setAdminAuth(page, 'waiter');
    await page.goto('/admin');

    // Should see common nav items
    await expect(page.locator('text=Masalar')).toBeVisible();
    await expect(page.locator('text=Siparişler')).toBeVisible();
    await expect(page.locator('text=Sipariş Al')).toBeVisible();

    // Should NOT see owner-only items
    await expect(page.locator('text=Personel')).not.toBeVisible();
    await expect(page.locator('text=Menü')).not.toBeVisible();
    await expect(page.locator('text=Kayıtlar')).not.toBeVisible();
  });

  test('should logout and clear localStorage', async ({ page }) => {
    await setAdminAuth(page, 'owner');
    await page.goto('/admin');

    const logoutBtn = page.locator('[data-testid="logout-btn"]');
    await logoutBtn.click();

    // Should redirect to login
    await expect(page).toHaveURL('/staff-login');

    // localStorage should be cleared
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const user = await page.evaluate(() => localStorage.getItem('user'));
    expect(token).toBeNull();
    expect(user).toBeNull();
  });

  test('should navigate between sections', async ({ page }) => {
    await setAdminAuth(page, 'owner');
    await page.goto('/admin');

    // Click on Masalar
    await page.locator('text=Masalar').click();
    await expect(page).toHaveURL(/\/admin\/tables/);

    // Click on Siparişler
    await page.locator('text=Siparişler').click();
    await expect(page).toHaveURL(/\/admin\/orders/);

    // Click on Personel
    await page.locator('text=Personel').click();
    await expect(page).toHaveURL(/\/admin\/staff/);
  });
});
